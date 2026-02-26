/**
 * EVM Chain Publisher (NestJS injectable)
 */

import { Injectable } from '@nestjs/common';

import {
  Account,
  Address,
  Chain,
  encodeFunctionData,
  erc20Abi,
  Hex,
  maxUint256,
  parseEventLogs,
  type PublicClient,
  Transport,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';

import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { portalAbi } from '@/commons/abis/portal.abi';
import { KeyHandle } from '@/shared/security';
import { ChainConfig, Intent, UniversalAddress } from '@/shared/types';
import { logger } from '@/utils/logger';

import { BasePublisher, IntentStatus, PublishResult, ValidationResult } from '../base.publisher';
import { ChainRegistryService } from '../chain-registry.service';
import { ChainsService } from '../chains.service';

import { DefaultEvmClientFactory, EvmClientFactory } from './evm-client-factory';

@Injectable()
export class EvmPublisher extends BasePublisher {
  private readonly clientFactory: EvmClientFactory;
  private _publicClient?: PublicClient;

  constructor(
    rpcUrl: string,
    registry: ChainRegistryService,
    private readonly chains: ChainsService,
    clientFactory: EvmClientFactory = new DefaultEvmClientFactory()
  ) {
    super(rpcUrl, registry);
    this.clientFactory = clientFactory;
  }

  private getPublicClient(): PublicClient {
    if (!this._publicClient) {
      this._publicClient = this.clientFactory.createPublicClient({
        chain: chains.mainnet,
        rpcUrl: this.rpcUrl,
      });
    }
    return this._publicClient;
  }

  override async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    keyHandle: KeyHandle,
    portalAddress?: UniversalAddress,
    proverAddress?: UniversalAddress
  ): Promise<PublishResult> {
    this.runPreflightChecks(source);
    return keyHandle.useAsync(async rawKey => {
      const account = privateKeyToAccount(rawKey as Hex);
      return this.runSafely(async () => {
        const chain = this.getChain(source);

        const walletClient: WalletClient<Transport, Chain, Account> =
          this.clientFactory.createWalletClient({
            chain,
            rpcUrl: this.rpcUrl,
            account,
          });

        const publicClient = this.getPublicClient();

        const sourceChainConfig = this.chains.findChainById(source);
        const destinationChainConfig = this.chains.findChainById(destination);

        const portalAddrUniversal = portalAddress ?? sourceChainConfig?.portalAddress;

        if (!portalAddrUniversal) {
          throw new Error(`No Portal address configured for chain ${source}`);
        }

        const finalPortalAddress = AddressNormalizer.denormalizeToEvm(portalAddrUniversal);

        if (!destinationChainConfig) {
          throw new Error(`Destination chain is not configured ${destination}`);
        }

        if (reward.nativeAmount > 0n) {
          logger.spinner('Checking native balance...');
          const balance = await publicClient.getBalance({
            address: account.address,
          });

          if (balance < reward.nativeAmount) {
            logger.fail(
              `Insufficient native balance. Required: ${reward.nativeAmount}, Available: ${balance}`
            );
            throw new Error(
              `Insufficient native balance. Required: ${reward.nativeAmount}, Available: ${balance}`
            );
          }
          logger.succeed(`Native balance sufficient: ${balance} wei`);
        }

        if (reward.tokens.length > 0) {
          logger.info('Checking token balances and approvals...');
        }

        for (let i = 0; i < reward.tokens.length; i++) {
          const token = reward.tokens[i];
          const tokenAddress = AddressNormalizer.denormalizeToEvm(token.token);

          logger.spinner(
            `Checking balance for token ${i + 1}/${reward.tokens.length}: ${tokenAddress}`
          );

          const tokenBalance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [account.address],
          });

          if (tokenBalance < token.amount) {
            logger.fail(`Insufficient token balance for ${tokenAddress}`);
            throw new Error(
              `Insufficient token balance for ${tokenAddress}. Required: ${token.amount}, Available: ${tokenBalance}`
            );
          }

          logger.succeed(`Token balance sufficient: ${tokenBalance}`);

          const allowance = await publicClient.readContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [account.address, finalPortalAddress],
          });

          if (allowance < token.amount) {
            logger.spinner(`Approving token ${tokenAddress}...`);

            const approveTx = await walletClient.writeContract({
              address: tokenAddress,
              abi: erc20Abi,
              functionName: 'approve',
              args: [finalPortalAddress, maxUint256],
            });

            logger.updateSpinner('Waiting for approval confirmation...');
            const approvalReceipt = await publicClient.waitForTransactionReceipt({
              hash: approveTx,
              confirmations: 2,
            });

            if (approvalReceipt.status !== 'success') {
              logger.fail(`Token approval failed for ${tokenAddress}`);
              throw new Error(`Token approval failed for ${tokenAddress}`);
            }

            logger.succeed(`Token approved: ${tokenAddress}`);
          } else {
            logger.info(`Token already approved: ${tokenAddress}`);
          }
        }

        const evmReward = {
          deadline: reward.deadline,
          nativeAmount: reward.nativeAmount,
          creator: AddressNormalizer.denormalizeToEvm(reward.creator),
          prover: AddressNormalizer.denormalizeToEvm(proverAddress ?? reward.prover),
          tokens: reward.tokens.map(t => ({
            token: AddressNormalizer.denormalizeToEvm(t.token),
            amount: t.amount,
          })),
        };

        const data = encodeFunctionData({
          abi: portalAbi,
          functionName: 'publishAndFund',
          args: [destination, encodedRoute as Hex, evmReward, false],
        });

        logger.spinner('Publishing intent to Portal contract...');
        const hash = await walletClient.sendTransaction({
          to: finalPortalAddress,
          data,
          value: reward.nativeAmount,
        });

        logger.updateSpinner('Waiting for transaction confirmation...');
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        logger.succeed('Transaction confirmed');

        if (receipt.status === 'success') {
          const [intentPublishEvent] = parseEventLogs({
            abi: portalAbi,
            strict: true,
            eventName: 'IntentPublished',
            logs: receipt.logs,
          });

          return {
            success: true,
            transactionHash: hash,
            intentHash: intentPublishEvent.args.intentHash,
          };
        } else {
          return {
            success: false,
            error: 'Transaction failed',
          };
        }
      });
    });
  }

  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    return await this.getPublicClient().getBalance({ address: address as Address });
  }

  override async validate(
    reward: Intent['reward'],
    senderAddress: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    try {
      const publicClient = this.getPublicClient();

      if (reward.nativeAmount > 0n) {
        const balance = await publicClient.getBalance({ address: senderAddress as Address });
        if (balance < reward.nativeAmount) {
          errors.push(
            `Insufficient native balance. Required: ${reward.nativeAmount}, Available: ${balance}`
          );
        }
      }

      for (const token of reward.tokens) {
        const tokenAddress = AddressNormalizer.denormalizeToEvm(token.token);
        const tokenBalance = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [senderAddress as Address],
        });
        if (tokenBalance < token.amount) {
          errors.push(
            `Insufficient token balance for ${tokenAddress}. Required: ${token.amount}, Available: ${tokenBalance}`
          );
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      errors.push(message);
    }
    return { valid: errors.length === 0, errors };
  }

  override async getStatus(intentHash: string, chain: ChainConfig): Promise<IntentStatus> {
    if (!chain.portalAddress) {
      throw new Error(`No portal address configured for chain ${chain.id}`);
    }

    const portalAddress = AddressNormalizer.denormalizeToEvm(chain.portalAddress);
    const publicClient = this.getPublicClient();

    const events = await publicClient.getContractEvents({
      address: portalAddress,
      abi: portalAbi,
      eventName: 'IntentFulfilled',
      args: { intentHash: intentHash as Hex },
    });

    const event = events[0];
    if (!event) {
      return { fulfilled: false };
    }

    const status: IntentStatus = {
      fulfilled: true,
      solver: event.args.claimant,
      fulfillmentTxHash: event.transactionHash ?? undefined,
      blockNumber: event.blockNumber ?? undefined,
    };

    if (event.blockNumber) {
      const block = await publicClient.getBlock({ blockNumber: event.blockNumber });
      status.timestamp = Number(block.timestamp);
    }

    return status;
  }

  private getChain(chainId: bigint): Chain {
    const id = Number(chainId);
    const viemChain = Object.values(chains).find((chain: Chain) => chain.id === id);

    if (!viemChain) {
      throw new Error(
        `Chain ID ${id} is not supported. Please use a chain that exists in viem/chains. ` +
          `Popular chains include: Ethereum (1), Optimism (10), Base (8453), Arbitrum (42161), Polygon (137), BSC (56).`
      );
    }

    return viemChain;
  }
}
