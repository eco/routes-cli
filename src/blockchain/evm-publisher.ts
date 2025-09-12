/**
 * EVM Chain Publisher
 */

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  Hex,
  http,
  parseEventLogs,
  erc20Abi,
  maxUint256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';
import { BasePublisher, PublishResult } from './base-publisher';
import { ChainType, Intent } from '../core/interfaces/intent';
import { AddressNormalizer } from '../core/utils/address-normalizer';
import { PortalEncoder } from '../core/utils/portal-encoder';
import { getChainById } from '../config/chains';
import { portalAbi } from '../commons/abis/portal.abi';
import { logger } from '../utils/logger';

export class EvmPublisher extends BasePublisher {
  async publish(intent: Intent, privateKey: string): Promise<PublishResult> {
    try {
      const account = privateKeyToAccount(privateKey as Hex);
      const chain = this.getChain(intent.sourceChainId);

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
      const chainConfig = getChainById(intent.sourceChainId);
      if (!chainConfig?.portalAddress) {
        throw new Error(`No Portal address configured for chain ${intent.sourceChainId}`);
      }

      const portalAddress = AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.EVM);

      // Check native balance if required
      if (intent.reward.nativeAmount > 0n) {
        const balanceSpinner = logger.spinner('Checking native balance...');
        const balance = await publicClient.getBalance({
          address: account.address,
        });

        if (balance < intent.reward.nativeAmount) {
          logger.fail(
            `Insufficient native balance. Required: ${intent.reward.nativeAmount}, Available: ${balance}`
          );
          throw new Error(
            `Insufficient native balance. Required: ${intent.reward.nativeAmount}, Available: ${balance}`
          );
        }
        logger.succeed(`Native balance sufficient: ${balance} wei`);
      }

      // Check and approve tokens for the reward
      if (intent.reward.tokens.length > 0) {
        logger.info('Checking token balances and approvals...');
      }

      for (let i = 0; i < intent.reward.tokens.length; i++) {
        const token = intent.reward.tokens[i];
        const tokenAddress = AddressNormalizer.denormalize(token.token, ChainType.EVM) as Hex;

        // Check token balance first
        const tokenSpinner = logger.spinner(
          `Checking balance for token ${i + 1}/${intent.reward.tokens.length}: ${tokenAddress}`
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
          args: [account.address, portalAddress as Hex],
        });

        if (allowance < token.amount) {
          const approveSpinner = logger.spinner(`Approving token ${tokenAddress}...`);

          // Approve max amount to avoid future approvals
          const approveTx = await walletClient.writeContract({
            address: tokenAddress,
            abi: erc20Abi,
            functionName: 'approve',
            args: [portalAddress as Hex, maxUint256],
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

      // Encode route for destination chain type
      const destChainType = chainConfig.type;
      const routeEncoded = PortalEncoder.encodeRoute(intent.route, destChainType);

      // Prepare reward struct
      const reward = {
        deadline: intent.reward.deadline,
        creator: AddressNormalizer.denormalize(
          intent.reward.creator,
          ChainType.EVM
        ) as `0x${string}`,
        prover: AddressNormalizer.denormalize(intent.reward.prover, ChainType.EVM) as `0x${string}`,
        nativeAmount: intent.reward.nativeAmount,
        tokens: intent.reward.tokens.map(t => ({
          token: AddressNormalizer.denormalize(t.token, ChainType.EVM) as `0x${string}`,
          amount: t.amount,
        })),
      };

      // Encode the function call
      const data = encodeFunctionData({
        abi: portalAbi,
        functionName: 'publishAndFund',
        args: [intent.destination, ('0x' + routeEncoded.toString('hex')) as Hex, reward, false],
      });

      // Send transaction with native value if required
      const publishSpinner = logger.spinner('Publishing intent to Portal contract...');
      const hash = await walletClient.sendTransaction({
        to: portalAddress as Hex,
        data,
        value: intent.reward.nativeAmount,
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
    } catch (error: any) {
      logger.stopSpinner();
      return {
        success: false,
        error: error.message || 'Unknown error',
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

    return await publicClient.getBalance({
      address: address as Hex,
    });
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
        const tokenAddress = AddressNormalizer.denormalize(token.token, ChainType.EVM) as Hex;

        const tokenBalance = await publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: 'balanceOf',
          args: [senderAddress as Hex],
        });

        if (tokenBalance < token.amount) {
          return {
            valid: false,
            error: `Insufficient token balance for ${tokenAddress}. Required: ${token.amount}, Available: ${tokenBalance}`,
          };
        }
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Validation failed',
      };
    }
  }

  private getChain(chainId: bigint) {
    const id = Number(chainId);

    // Find viem chain by ID
    const viemChain = Object.values(chains).find((chain: any) => chain.id === id);

    if (!viemChain) {
      throw new Error(
        `Chain ID ${id} is not supported. Please use a chain that exists in viem/chains. ` +
          `Popular chains include: Ethereum (1), Optimism (10), Base (8453), Arbitrum (42161), Polygon (137), BSC (56).`
      );
    }

    return viemChain;
  }
}
