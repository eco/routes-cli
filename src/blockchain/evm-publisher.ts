/**
 * EVM Chain Publisher
 */

import {
  Address,
  Chain,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  Hex,
  http,
  maxUint256,
  parseEventLogs,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';

import { portalAbi } from '@/commons/abis/portal.abi';
import { getChainById } from '@/config/chains';
import { Intent } from '@/core/interfaces/intent';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { BasePublisher, PublishResult } from './base-publisher';

export class EvmPublisher extends BasePublisher {
  async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    privateKey: string,
    portalAddress?: UniversalAddress,
    proverAddress?: UniversalAddress
  ): Promise<PublishResult> {
    try {
      const account = privateKeyToAccount(
        '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as Hex
      );
      const chain = this.getChain(source);

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(this.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(this.rpcUrl),
      });

      // Get Portal address
      const sourceChainConfig = getChainById(source);
      const destinationChainConfig = getChainById(destination);

      const portalAddrUniversal = portalAddress ?? sourceChainConfig?.portalAddress;

      if (!portalAddrUniversal) {
        throw new Error(`No Portal address configured for chain ${source}`);
      }

      const finalPortalAddress = AddressNormalizer.denormalizeToEvm(portalAddrUniversal);

      if (!destinationChainConfig) {
        throw new Error(`Destination chain is not configured ${destination}`);
      }

      // Check native balance if required
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

      // Check and approve tokens for the reward
      if (reward.tokens.length > 0) {
        logger.info('Checking token balances and approvals...');
      }

      for (let i = 0; i < reward.tokens.length; i++) {
        const token = reward.tokens[i];
        const tokenAddress = AddressNormalizer.denormalizeToEvm(token.token);

        // Check token balance first
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

        // Check current allowance
        const allowance = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'allowance',
          args: [account.address, finalPortalAddress],
        });

        if (allowance < token.amount) {
          logger.spinner(`Approving token ${tokenAddress}...`);

          // Approve max amount to avoid future approvals
          const approveTx = await walletClient.writeContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [finalPortalAddress, maxUint256],
          });

          // Wait for approval confirmation
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

      // Prepare reward struct
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

      // Encode the function call
      const data = encodeFunctionData({
        abi: portalAbi,
        functionName: 'publishAndFund',
        args: [destination, encodedRoute as Hex, evmReward, false],
      });

      // Send transaction with native value if required
      logger.spinner('Publishing intent to Portal contract...');
      const hash = await walletClient.sendTransaction({
        to: finalPortalAddress,
        data,
        value: reward.nativeAmount,
      });

      // Wait for transaction receipt
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
    } catch (error: unknown) {
      logger.stopSpinner();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getBalance(address: string, chainId?: bigint): Promise<bigint> {
    // Use the provided chainId to get the correct chain configuration
    // If no chainId is provided, default to mainnet (though this shouldn't happen in normal usage)
    const chain = chainId ? this.getChain(chainId) : chains.mainnet;

    const publicClient = createPublicClient({
      chain,
      transport: http(this.rpcUrl),
    });

    return await publicClient.getBalance({ address: address as Address });
  }

  async validate(
    intent: Intent,
    senderAddress: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const chain = this.getChain(intent.sourceChainId);
      const publicClient = createPublicClient({
        chain,
        transport: http(this.rpcUrl),
      });

      // Check if sender has enough balance for reward native amount on the source chain
      if (intent.reward.nativeAmount > 0n) {
        const balance = await this.getBalance(senderAddress, intent.sourceChainId);

        if (balance < intent.reward.nativeAmount) {
          return {
            valid: false,
            error: `Insufficient native balance. Required: ${intent.reward.nativeAmount}, Available: ${balance}`,
          };
        }
      }

      // Check token balances
      for (const token of intent.reward.tokens) {
        const tokenAddress = AddressNormalizer.denormalizeToEvm(token.token);

        const tokenBalance = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [senderAddress as Address],
        });

        if (tokenBalance < token.amount) {
          return {
            valid: false,
            error: `Insufficient token balance for ${tokenAddress}. Required: ${token.amount}, Available: ${tokenBalance}`,
          };
        }
      }

      return { valid: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  private getChain(chainId: bigint) {
    const id = Number(chainId);

    // Find viem chain by ID
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
