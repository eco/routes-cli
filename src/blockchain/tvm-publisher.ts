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
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { DefaultTvmClientFactory, TvmClientFactory } from './tvm/tvm-client-factory';
import { BasePublisher, PublishResult, ValidationResult } from './base-publisher';

export class TvmPublisher extends BasePublisher {
  private tronWeb: TronWeb;

  constructor(rpcUrl: string, factory: TvmClientFactory = new DefaultTvmClientFactory()) {
    super(rpcUrl);
    this.tronWeb = factory.createClient(rpcUrl);
  }

  override async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    privateKey: string,
    _portalAddress?: UniversalAddress
  ): Promise<PublishResult> {
    return this.runSafely(async () => {
      // Set private key — always cleared in finally block below
      this.tronWeb.setPrivateKey(privateKey);
      try {
        const senderAddress = this.tronWeb.address.fromPrivateKey(privateKey);

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

  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    try {
      const balance = await this.tronWeb.trx.getBalance(address);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }

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
