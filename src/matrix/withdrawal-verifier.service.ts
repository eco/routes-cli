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
import { Chain, createPublicClient, decodeEventLog, erc20Abi, getAddress, Hex, http } from 'viem';
import * as viemChains from 'viem/chains';

import { RpcService } from '@/blockchain/rpc.service';
import { calculateClaimedMarkerPDA, calculateVaultPDA } from '@/blockchain/svm/pda-manager';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { ChainConfig, ChainType, UniversalAddress } from '@/shared/types';

import { computeOwnerDeltas, pickSvmClaimant, SvmTokenBalanceEntry } from './matrix.util';

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
    rewardToken: string
  ): Promise<WithdrawalFacts | { error: string }> {
    try {
      if (chain.type === ChainType.SVM) {
        return await this.verifySvm(chain, intentHash, settlementTxHash, rewardToken);
      }
      if (chain.type === ChainType.EVM) {
        return await this.verifyEvm(chain, settlementTxHash, rewardToken);
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

    const deltas = computeOwnerDeltas(rewardToken, pre, post);
    const picked = pickSvmClaimant(deltas, vaultOwner);
    if (!picked) {
      return { error: `no positive reward-mint (${rewardToken}) delta outside the vault PDA` };
    }

    const claimedMarker = calculateClaimedMarkerPDA(intentHash, portalProgramId);
    const markerInfo = await connection.getAccountInfo(claimedMarker);

    return {
      withdrawnAmount: picked.withdrawnAmount,
      claimant: picked.claimant,
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
    txHash: string,
    rewardToken: string
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
      // The reward withdrawal is the largest reward-token Transfer in the tx.
      if (!best || value > best.value) best = { to, value };
    }

    if (!best) {
      return { error: `no reward-token (${rewardToken}) Transfer in settlement tx` };
    }
    return { withdrawnAmount: best.value, claimant: getAddress(best.to as Hex) };
  }

  private svmPortalProgramId(chain: ChainConfig): PublicKey {
    if (!chain.portalAddress) {
      throw new Error(`No Portal address configured for chain ${chain.id}`);
    }
    return new PublicKey(
      AddressNormalizer.denormalize(chain.portalAddress as UniversalAddress, ChainType.SVM)
    );
  }
}
