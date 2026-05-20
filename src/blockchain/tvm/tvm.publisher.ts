/**
 * TVM (Tron) Chain Publisher (NestJS injectable)
 */

import { Injectable } from '@nestjs/common';

import { TronWeb } from 'tronweb';
import { erc20Abi, Hex } from 'viem';

import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { portalAbi } from '@/commons/abis/portal.abi';
import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { ErrorCode, RoutesCliError } from '@/shared/errors';
import { KeyHandle } from '@/shared/security';
import { ChainConfig, ChainType, Intent, UniversalAddress } from '@/shared/types';
import { logger } from '@/utils/logger';

import { BasePublisher, IntentStatus, PublishResult, ValidationResult } from '../base.publisher';
import { ChainRegistryService } from '../chain-registry.service';
import { ChainsService } from '../chains.service';

import { DefaultTvmClientFactory, TvmClientFactory } from './tvm-client-factory';

@Injectable()
export class TvmPublisher extends BasePublisher {
  private readonly factory: TvmClientFactory;

  constructor(
    rpcUrl: string,
    registry: ChainRegistryService,
    private readonly chains: ChainsService,
    factory: TvmClientFactory = new DefaultTvmClientFactory()
  ) {
    super(rpcUrl, registry);
    this.factory = factory;
  }

  override async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    keyHandle: KeyHandle,
    _portalAddress?: UniversalAddress
  ): Promise<PublishResult> {
    this.runPreflightChecks(source);
    return keyHandle.useAsync(async rawKey => {
      const tronWeb: TronWeb = this.factory.createClient(this.rpcUrl);
      tronWeb.setPrivateKey(rawKey);
      const senderAddress = tronWeb.address.fromPrivateKey(rawKey);

      return this.runSafely(async () => {
        const chainConfig = this.chains.findChainById(source);
        const portalAddrUniversal = _portalAddress ?? chainConfig?.portalAddress;
        if (!portalAddrUniversal) {
          throw new Error(`No Portal address configured for chain ${source}`);
        }
        const portalAddress = AddressNormalizer.denormalize(portalAddrUniversal, ChainType.TVM);

        const destChainConfig = this.chains.findChainById(BigInt(destination));
        if (!destChainConfig) {
          throw new Error(`Unknown destination chain: ${destination}`);
        }

        for (const rewardToken of reward.tokens) {
          const tokenAddress = AddressNormalizer.denormalizeToTvm(rewardToken.token);
          const tokenContract = tronWeb.contract(erc20Abi, tokenAddress);
          logger.spinner(`Approving token ${tokenAddress}...`);
          const approvalTxId = await tokenContract
            .approve(portalAddress, rewardToken.amount)
            .send({ from: senderAddress });
          logger.updateSpinner('Waiting for approval confirmation...');
          const approved = await this.waitForTransaction(tronWeb, approvalTxId);
          if (!approved) {
            throw new RoutesCliError(
              ErrorCode.TRANSACTION_FAILED,
              `Approval failed for ${tokenAddress}`
            );
          }
          logger.succeed(`Token approved: ${tokenAddress}`);
        }

        const portalContract = tronWeb.contract(portalAbi, portalAddress);

        const tvmReward: Parameters<typeof portalContract.publishAndFund>[0][2] = [
          reward.deadline,
          AddressNormalizer.denormalize(reward.creator, ChainType.TVM),
          AddressNormalizer.denormalize(reward.prover, ChainType.TVM),
          reward.nativeAmount,
          reward.tokens.map(
            t => [AddressNormalizer.denormalize(t.token, ChainType.TVM), t.amount] as const
          ),
        ];

        logger.spinner('Publishing intent to Portal contract...');
        const tx = await portalContract
          .publishAndFund(destination, encodedRoute, tvmReward, false)
          .send({
            from: senderAddress,
            callValue: Number(reward.nativeAmount),
          });

        logger.updateSpinner('Waiting for transaction confirmation...');

        const { intentHash } = PortalHashUtils.getIntentHashFromReward(
          source,
          destination,
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
      });
    });
  }

  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    try {
      const tronWeb = this.factory.createClient(this.rpcUrl);
      const balance = await tronWeb.trx.getBalance(address);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }

  override async validate(
    reward: Intent['reward'],
    senderAddress: string,
    _chainId: bigint
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

    const tronWeb = this.factory.createClient(this.rpcUrl);
    for (const token of reward.tokens) {
      try {
        const tokenAddr = AddressNormalizer.denormalizeToTvm(token.token);
        const contract = tronWeb.contract(erc20Abi, tokenAddr);
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

  override getStatus(
    _intentHash: string,
    _chain: ChainConfig,
    _portalAddress?: UniversalAddress
  ): Promise<IntentStatus> {
    return Promise.reject(new Error('getStatus not yet implemented for TVM'));
  }

  private async waitForTransaction(tronWeb: TronWeb, txId: string): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const txInfo = await tronWeb.trx.getTransactionInfo(txId);
      if (txInfo && txInfo.blockNumber && txInfo.receipt?.result === 'SUCCESS') {
        return true;
      }

      if (txInfo?.receipt?.result === 'FAILED') {
        throw new Error(
          `Transaction failed: ${txInfo.receipt.result || 'Unknown error'}. txId: ${txId}. Received: ${JSON.stringify(txInfo.receipt)}`
        );
      }

      await new Promise(resolve => setTimeout(resolve, 4_000));
    }
    return false;
  }
}
