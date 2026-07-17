/**
 * Verifies the WITHDRAWAL of a settled local swap: for the reward mint/token
 * (= the pair's `inputToken`), it fetches the settlement tx and extracts the
 * raw amount withdrawn and the claimant it settled to.
 *
 * Local swaps settle fulfill+prove+withdraw atomically in one tx, so the
 * fulfillment tx IS the settlement. This never trusts the mirror: it reads the
 * on-chain token movement so the matrix can assert the reward reached the
 * expected claimant in the exact amount.
 *
 * Uses the same RPC access the publishers use (RpcService.getUrl(chain)), and
 * never throws — on any failure it returns `{ error }` so the caller can fail
 * the row cleanly rather than crash the run.
 */

import { Injectable } from '@nestjs/common';

import { Connection, PublicKey } from '@solana/web3.js';
import {
  Chain,
  createPublicClient,
  decodeEventLog,
  decodeFunctionData,
  erc20Abi,
  getAddress,
  Hex,
  http,
  parseAbi,
} from 'viem';
import * as viemChains from 'viem/chains';

import { RpcService } from '@/blockchain/rpc.service';
import { calculateClaimedMarkerPDA, calculateVaultPDA } from '@/blockchain/svm/pda-manager';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { portalAbi } from '@/commons/abis/portal.abi';
import { ChainConfig, ChainType, UniversalAddress } from '@/shared/types';

import {
  computeOwnerDeltas,
  isNativeReward,
  positiveBalanceDebit,
  SvmTokenBalanceEntry,
} from './matrix.util';

const nativeEvmVaultAbi = parseAbi([
  'function publishAndFund(uint64 destination, bytes route, (uint64 deadline, address creator, address prover, uint256 nativeAmount, (address token, uint256 amount)[] tokens) reward, bool allowPartial) payable returns (bytes32 intentHash, address vault)',
  'function intentVaultAddress(uint64 destination, bytes route, (uint64 deadline, address creator, address prover, uint256 nativeAmount, (address token, uint256 amount)[] tokens) reward) view returns (address)',
]);
const SVM_INTENT_WITHDRAWN_DISCRIMINATOR = Buffer.from([28, 22, 16, 41, 101, 254, 123, 228]);

/** Extracted withdrawal facts for one settlement tx (reward mint/token only). */
export interface WithdrawalFacts {
  /** Raw smallest-unit amount credited to the claimant. */
  withdrawnAmount: bigint;
  /** Address the reward settled to. */
  claimant: string;
  /** Independent "withdrawn" signal: SVM claimed-marker PDA present (SVM only). */
  claimedMarkerPresent?: boolean;
  error?: string;
}

@Injectable()
export class WithdrawalVerifierService {
  constructor(private readonly rpc: RpcService) {}

  async verify(
    chain: ChainConfig,
    intentHash: string,
    settlementTxHash: string,
    rewardToken: string,
    publishTxHash?: string,
    expectedAmount?: bigint
  ): Promise<WithdrawalFacts | { error: string }> {
    try {
      if (chain.type === ChainType.SVM) {
        return await this.verifySvm(chain, intentHash, settlementTxHash, rewardToken);
      }
      if (chain.type === ChainType.EVM) {
        return await this.verifyEvm(
          chain,
          intentHash,
          settlementTxHash,
          rewardToken,
          publishTxHash,
          expectedAmount
        );
      }
      return { error: `withdrawal verification not supported for ${chain.type}` };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * SVM: scan meta.pre/postTokenBalances for the reward mint, compute per-owner
   * raw deltas from `uiTokenAmount.amount`, and pick the positive-delta owner
   * that is NOT the vault PDA as the claimant. Also confirm the claimed-marker
   * PDA exists as an independent "withdrawn" signal.
   */
  private async verifySvm(
    chain: ChainConfig,
    intentHash: string,
    txHash: string,
    rewardToken: string
  ): Promise<WithdrawalFacts | { error: string }> {
    const connection = new Connection(this.rpc.getUrl(chain), 'confirmed');
    const tx = await connection.getTransaction(txHash, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta) return { error: 'SVM settlement tx meta unavailable' };

    const pre = (tx.meta.preTokenBalances ?? []) as unknown as SvmTokenBalanceEntry[];
    const post = (tx.meta.postTokenBalances ?? []) as unknown as SvmTokenBalanceEntry[];

    const portalProgramId = this.svmPortalProgramId(chain);
    const vaultOwner = calculateVaultPDA(intentHash, portalProgramId).toBase58();
    const claimant = this.svmWithdrawalClaimant(tx.meta.logMessages ?? [], intentHash);
    if (!claimant) {
      return { error: `no matching IntentWithdrawn event for ${intentHash}` };
    }

    let withdrawnAmount: bigint;
    if (isNativeReward(chain.type, rewardToken)) {
      const accountKeys = tx.transaction.message.getAccountKeys({
        accountKeysFromLookups: tx.meta.loadedAddresses,
      });
      let vaultIndex = -1;
      for (let index = 0; index < accountKeys.length; index++) {
        if (accountKeys.get(index)?.toBase58() === vaultOwner) {
          vaultIndex = index;
          break;
        }
      }
      if (vaultIndex < 0) {
        return { error: `native intent vault ${vaultOwner} not in settlement tx` };
      }
      const before = tx.meta.preBalances[vaultIndex];
      const after = tx.meta.postBalances[vaultIndex];
      if (before === undefined || after === undefined) {
        return { error: `native intent vault ${vaultOwner} balance unavailable` };
      }
      const debit = positiveBalanceDebit(BigInt(before), BigInt(after));
      if (debit === null) {
        return { error: `native intent vault ${vaultOwner} did not decrease` };
      }
      withdrawnAmount = debit;
    } else {
      const deltas = computeOwnerDeltas(rewardToken, pre, post);
      const claimantDelta = deltas.find(entry => entry.owner === claimant && entry.delta > 0n);
      if (!claimantDelta) {
        return {
          error: `withdrawal claimant ${claimant} received no reward mint ${rewardToken}`,
        };
      }
      withdrawnAmount = claimantDelta.delta;
    }

    const claimedMarker = calculateClaimedMarkerPDA(intentHash, portalProgramId);
    const markerInfo = await connection.getAccountInfo(claimedMarker);

    return {
      withdrawnAmount,
      claimant,
      claimedMarkerPresent: markerInfo !== null,
    };
  }

  /**
   * EVM: from the settlement tx receipt, decode the reward-token ERC20 `Transfer`
   * whose `to` is the claimant. The claimant is the Withdrawal recipient (EVM
   * getStatus already surfaces it via IntentFulfilled.claimant), and the reward
   * amount is that Transfer's value.
   */
  private async verifyEvm(
    chain: ChainConfig,
    intentHash: string,
    txHash: string,
    rewardToken: string,
    publishTxHash?: string,
    expectedAmount?: bigint
  ): Promise<WithdrawalFacts | { error: string }> {
    const viemChain = Object.values(viemChains).find((c: Chain) => c.id === Number(chain.id)) as
      | Chain
      | undefined;
    if (!viemChain) return { error: `chain ${chain.id} not in viem/chains` };

    const client = createPublicClient({
      chain: viemChain,
      transport: http(this.rpc.getUrl(chain)),
    });
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    if (!chain.portalAddress) {
      return { error: `No Portal address configured for chain ${chain.id}` };
    }
    const portalAddress = AddressNormalizer.denormalize(
      chain.portalAddress as UniversalAddress,
      ChainType.EVM
    );
    let claimant: string | undefined;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== portalAddress.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: portalAbi, data: log.data, topics: log.topics });
        if (decoded.eventName !== 'IntentWithdrawn') continue;
        const args = decoded.args as { intentHash: Hex; claimant: string };
        if (args.intentHash.toLowerCase() !== intentHash.toLowerCase()) continue;
        claimant = getAddress(args.claimant as Hex);
        break;
      } catch {
        continue;
      }
    }
    if (!claimant) {
      return { error: `no matching IntentWithdrawn event for ${intentHash}` };
    }

    if (isNativeReward(chain.type, rewardToken)) {
      if (!publishTxHash) {
        return { error: 'publish transaction hash required for native EVM verification' };
      }
      if (receipt.blockNumber === 0n) {
        return { error: 'cannot verify native vault balance at genesis block' };
      }

      const publishTx = await client.getTransaction({ hash: publishTxHash as Hex });
      if (!publishTx.to || publishTx.to.toLowerCase() !== portalAddress.toLowerCase()) {
        return { error: 'publish transaction target does not match configured Portal' };
      }

      let decodedPublish;
      try {
        decodedPublish = decodeFunctionData({
          abi: nativeEvmVaultAbi,
          data: publishTx.input,
        });
      } catch {
        return { error: 'could not decode native publishAndFund transaction' };
      }
      if (decodedPublish.functionName !== 'publishAndFund') {
        return { error: 'publish transaction is not publishAndFund' };
      }
      const [destination, route, reward] = decodedPublish.args;
      const vault = await client.readContract({
        address: portalAddress,
        abi: nativeEvmVaultAbi,
        functionName: 'intentVaultAddress',
        args: [destination, route, reward],
      });
      const before = await client.getBalance({
        address: vault,
        blockNumber: receipt.blockNumber - 1n,
      });
      const after = await client.getBalance({
        address: vault,
        blockNumber: receipt.blockNumber,
      });
      const withdrawnAmount = positiveBalanceDebit(before, after);
      if (withdrawnAmount === null) {
        return { error: `native intent vault ${vault} did not decrease` };
      }

      return { withdrawnAmount, claimant };
    }

    const rewardTokenAddr = getAddress(rewardToken).toLowerCase();
    let best: { to: string; value: bigint } | null = null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== rewardTokenAddr) continue;
      let decoded;
      try {
        decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
      } catch {
        continue;
      }
      if (decoded.eventName !== 'Transfer') continue;
      const { to, value } = decoded.args as { to: string; value: bigint };
      if (to.toLowerCase() !== claimant.toLowerCase()) continue;
      // Batched withdrawal transactions can contain several rewards of the same
      // token. The caller checks the exact child reward amount after extraction.
      if (expectedAmount !== undefined && value === expectedAmount) {
        best = { to, value };
        break;
      }
      if (!best || value > best.value) best = { to, value };
    }

    if (!best) {
      return { error: `no reward-token (${rewardToken}) Transfer in settlement tx` };
    }
    return { withdrawnAmount: best.value, claimant };
  }

  private svmPortalProgramId(chain: ChainConfig): PublicKey {
    if (!chain.portalAddress) {
      throw new Error(`No Portal address configured for chain ${chain.id}`);
    }
    return new PublicKey(
      AddressNormalizer.denormalize(chain.portalAddress as UniversalAddress, ChainType.SVM)
    );
  }

  private svmWithdrawalClaimant(logs: string[], intentHash: string): string | null {
    const expectedHash = Buffer.from(intentHash.replace(/^0x/, ''), 'hex');
    for (const log of logs) {
      if (!log.startsWith('Program data: ')) continue;
      let event: Buffer;
      try {
        event = Buffer.from(log.slice('Program data: '.length), 'base64');
      } catch {
        continue;
      }
      if (event.length < 72) continue;
      if (!event.subarray(0, 8).equals(SVM_INTENT_WITHDRAWN_DISCRIMINATOR)) continue;
      if (!event.subarray(8, 40).equals(expectedHash)) continue;
      return new PublicKey(event.subarray(40, 72)).toBase58();
    }
    return null;
  }
}
