/**
 * TVM (Tron) Chain Publisher
 */

import { TronWeb } from 'tronweb';
import { erc20Abi, Hex } from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';
import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { getChainById } from '@/config/chains';
import { ErrorCode, RoutesCliError } from '@/core/errors';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { KeyHandle } from '@/core/security';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { DefaultTvmClientFactory, TvmClientFactory } from './tvm/tvm-client-factory';
import { BasePublisher, PublishResult, ValidationResult } from './base-publisher';

/**
 * Publisher for the Tron blockchain (TVM).
 *
 * Uses TronWeb for all chain interactions. The TronWeb instance is created once
 * in the constructor and reused; the private key is set immediately before signing
 * and always cleared in a `finally` block to minimise in-memory key exposure.
 *
 * Inject a custom {@link TvmClientFactory} to unit-test without live RPC access.
 */
export class TvmPublisher extends BasePublisher {
  private tronWeb: TronWeb;

  /**
   * @param rpcUrl - TronGrid (or compatible) RPC endpoint,
   *   e.g. `https://api.trongrid.io`.
   * @param factory - Optional TronWeb factory; defaults to {@link DefaultTvmClientFactory}.
   */
  constructor(rpcUrl: string, factory: TvmClientFactory = new DefaultTvmClientFactory()) {
    super(rpcUrl);
    this.tronWeb = factory.createClient(rpcUrl);
  }

  /**
   * Publishes a cross-chain intent to the Tron Portal contract (`publishAndFund`).
   *
   * Steps:
   * 1. Sets private key on TronWeb (always cleared in `finally`).
   * 2. Approves all `reward.tokens` via TRC-20 `approve` calls (loop matches EVM).
   * 3. Calls `publishAndFund` on the Portal contract.
   * 4. Returns the intent hash computed locally (TVM events are not parsed on-chain).
   *
   * @param source - Source chain ID (Tron mainnet: `728126428n`).
   * @param destination - Destination chain ID.
   * @param reward - Reward struct with creator, prover, tokens, and deadline.
   * @param encodedRoute - ABI-encoded route bytes.
   * @param privateKey - Tron private key (64 hex chars, no `0x` prefix).
   * @param _portalAddress - Optional Universal Address of the Portal. Falls back to chain config.
   * @returns A {@link PublishResult} with `transactionHash` and `intentHash` on success.
   */
  override async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    keyHandle: KeyHandle,
    _portalAddress?: UniversalAddress
  ): Promise<PublishResult> {
    this.runPreflightChecks(source);
    return this.runSafely(async () => {
      // Set key on TronWeb and capture sender address; buffer zeroized after use()
      const senderAddress = keyHandle.use(key => {
        this.tronWeb.setPrivateKey(key);
        return this.tronWeb.address.fromPrivateKey(key);
      });
      try {
        // Get Portal address
        const chainConfig = getChainById(source);
        const portalAddrUniversal = _portalAddress ?? chainConfig?.portalAddress;
        if (!portalAddrUniversal) {
          throw new Error(`No Portal address configured for chain ${source}`);
        }
        const portalAddress = AddressNormalizer.denormalize(portalAddrUniversal, ChainType.TVM);

        // Encode route for destination chain type
        const destChainConfig = getChainById(BigInt(destination));
        if (!destChainConfig) {
          throw new Error(`Unknown destination chain: ${destination}`);
        }

        // Approve all reward tokens (loop matches EVM behavior)
        for (const rewardToken of reward.tokens) {
          const tokenAddress = AddressNormalizer.denormalizeToTvm(rewardToken.token);
          const tokenContract = this.tronWeb.contract(erc20Abi, tokenAddress);
          logger.spinner(`Approving token ${tokenAddress}...`);
          const approvalTxId = await tokenContract
            .approve(portalAddress, rewardToken.amount)
            .send({ from: senderAddress });
          logger.updateSpinner('Waiting for approval confirmation...');
          const approved = await this.waitForTransaction(approvalTxId);
          if (!approved) {
            throw new RoutesCliError(
              ErrorCode.TRANSACTION_FAILED,
              `Approval failed for ${tokenAddress}`
            );
          }
          logger.succeed(`Token approved: ${tokenAddress}`);
        }

        const portalContract = this.tronWeb.contract(portalAbi, portalAddress);

        // Prepare parameters - TronWeb expects strings for numbers
        const tvmReward: Parameters<typeof portalContract.publishAndFund>[0][2] = [
          reward.deadline,
          AddressNormalizer.denormalize(reward.creator, ChainType.TVM),
          AddressNormalizer.denormalize(reward.prover, ChainType.TVM),
          reward.nativeAmount,
          reward.tokens.map(
            t => [AddressNormalizer.denormalize(t.token, ChainType.TVM), t.amount] as const
          ),
        ];

        // Call publish function
        logger.spinner('Publishing intent to Portal contract...');
        const tx = await portalContract
          .publishAndFund(destination, encodedRoute, tvmReward, false)
          .send({
            from: senderAddress,
            callValue: Number(reward.nativeAmount), // TRX amount in sun
          });

        logger.updateSpinner('Waiting for transaction confirmation...');

        const { intentHash } = PortalHashUtils.getIntentHashFromReward(
          destination,
          source,
          encodedRoute as Hex,
          reward
        );

        if (tx) {
          logger.succeed('Transaction confirmed');
          return {
            success: true,
            transactionHash: tx,
            intentHash,
          };
        } else {
          logger.fail('Transaction failed');
          return {
            success: false,
            error: 'Transaction failed',
          };
        }
      } finally {
        // Clear key from TronWeb instance regardless of outcome
        this.tronWeb.setPrivateKey('');
      }
    });
  }

  /**
   * Returns the native TRX balance of an address in sun (1 TRX = 1 000 000 sun).
   *
   * @param address - Tron base58 address.
   * @param _chainId - Unused; present to satisfy the {@link BasePublisher} signature.
   * @returns Balance in sun as a `bigint`, or `0n` on RPC error.
   */
  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    try {
      const balance = await this.tronWeb.trx.getBalance(address);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }

  /**
   * Pre-publish validation: checks TRX (native) and TRC-20 token balances.
   *
   * Also enforces the TVM-specific invariant that at least one reward token must
   * be present (Tron Portal requires token-funded intents).
   *
   * @param reward - Reward struct specifying required amounts.
   * @param senderAddress - Tron base58 sender address.
   * @returns A {@link ValidationResult} with an `errors` array (empty = valid).
   */
  override async validate(
    reward: Intent['reward'],
    senderAddress: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (reward.tokens.length === 0) {
      errors.push('TVM requires at least one reward token');
    }

    if (reward.nativeAmount > 0n) {
      const balance = await this.getBalance(senderAddress);
      if (balance < reward.nativeAmount) {
        errors.push(
          `Insufficient TRX balance. Required: ${reward.nativeAmount}, Available: ${balance}`
        );
      }
    }

    for (const token of reward.tokens) {
      try {
        const tokenAddr = AddressNormalizer.denormalizeToTvm(token.token);
        const contract = this.tronWeb.contract(erc20Abi, tokenAddr);
        const balance: bigint = await contract.balanceOf(senderAddress).call();
        if (BigInt(balance) < token.amount) {
          errors.push(
            `Insufficient token balance for ${tokenAddr}. Required: ${token.amount}, Available: ${balance}`
          );
        }
      } catch {
        // Skip token balance check if contract read fails
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Waits for a transaction to be confirmed on the blockchain
   * @param txId - Transaction ID to wait for
   * @returns true if confirmed, false if timeout
   */
  async waitForTransaction(txId: string): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const txInfo = await this.tronWeb.trx.getTransactionInfo(txId);
      if (txInfo && txInfo.blockNumber && txInfo.receipt?.result === 'SUCCESS') {
        return true;
      }

      if (txInfo?.receipt?.result === 'FAILED') {
        throw new Error(
          `Transaction failed: ${txInfo.receipt.result || 'Unknown error'}. txId: ${txId}. Received: ${JSON.stringify(txInfo.receipt)}`
        );
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, 4_000)); // Wait 4s
    }
    return false;
  }
}
