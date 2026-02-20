/**
 * EVM Chain Publisher
 */

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

import { portalAbi } from '@/commons/abis/portal.abi';
import { getChainById } from '@/config/chains';
import { Intent } from '@/core/interfaces/intent';
import { KeyHandle } from '@/core/security';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { DefaultEvmClientFactory, EvmClientFactory } from './evm/evm-client-factory';
import { BasePublisher, PublishResult, ValidationResult } from './base-publisher';

/**
 * Publisher for EVM-compatible chains (Ethereum, Base, Optimism, Arbitrum, …).
 *
 * Uses viem under the hood. A single {@link PublicClient} is created lazily and
 * reused across all read operations to avoid unnecessary connection overhead.
 * A fresh {@link WalletClient} is created per {@link publish} call because the
 * signing account may differ between calls.
 *
 * Inject a custom {@link EvmClientFactory} to unit-test without live RPC access.
 */
export class EvmPublisher extends BasePublisher {
  private readonly clientFactory: EvmClientFactory;
  /**
   * Cached public client — initialized once and reused across getBalance/validate/publish calls.
   * Uses chains.mainnet as a placeholder chain object; actual RPC calls go to this.rpcUrl.
   */
  private _publicClient?: PublicClient;

  /**
   * @param rpcUrl - HTTP or WebSocket RPC endpoint for the source chain.
   * @param clientFactory - Optional viem client factory; defaults to
   *   {@link DefaultEvmClientFactory}. Override in tests to inject mocks.
   */
  constructor(rpcUrl: string, clientFactory: EvmClientFactory = new DefaultEvmClientFactory()) {
    super(rpcUrl);
    this.clientFactory = clientFactory;
  }

  /**
   * Returns the cached PublicClient, creating it on first call.
   * All read-only RPC methods (eth_getBalance, eth_call, etc.) are transport-driven
   * and don't depend on the chain metadata object.
   */
  private getPublicClient(): PublicClient {
    if (!this._publicClient) {
      this._publicClient = this.clientFactory.createPublicClient({
        chain: chains.mainnet,
        rpcUrl: this.rpcUrl,
      });
    }
    return this._publicClient;
  }

  /**
   * Publishes a cross-chain intent to the EVM Portal contract (`publishAndFund`).
   *
   * Steps:
   * 1. Checks native ETH balance (if `reward.nativeAmount > 0`).
   * 2. Checks ERC-20 balances and approves the Portal for each reward token.
   * 3. ABI-encodes and broadcasts the `publishAndFund` transaction.
   * 4. Waits for confirmation and parses the `IntentPublished` event.
   *
   * @param source - Source chain ID.
   * @param destination - Destination chain ID.
   * @param reward - Reward struct with creator, prover, tokens, and deadline.
   * @param encodedRoute - ABI-encoded route bytes produced by {@link PortalEncoder}.
   * @param privateKey - Signing key in `0x` + 64 hex format.
   * @param portalAddress - Optional Universal Address of the Portal contract.
   *   Falls back to `CHAIN_CONFIGS[source].portalAddress`.
   * @param proverAddress - Optional Universal Address override for the prover.
   *   Falls back to `reward.prover`.
   * @returns A {@link PublishResult} with `success`, `transactionHash`, and `intentHash`
   *   on success, or `success: false` with an `error` message on failure.
   */
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
    // Derive account synchronously; buffer is zeroized immediately after use()
    const account = keyHandle.use(key => privateKeyToAccount(key as Hex));
    return this.runSafely(async () => {
      const chain = this.getChain(source);

      // Wallet client is created fresh per publish (account may differ across calls)
      const walletClient: WalletClient<Transport, Chain, Account> =
        this.clientFactory.createWalletClient({
          chain,
          rpcUrl: this.rpcUrl,
          account,
        });

      // Reuse cached public client for all read operations
      const publicClient = this.getPublicClient();

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
    });
  }

  /**
   * Returns the native ETH balance of an address in wei.
   *
   * @param address - EVM checksummed or lowercase hex address.
   * @param _chainId - Unused; present to satisfy the {@link BasePublisher} signature.
   * @returns Balance in wei as a `bigint`.
   */
  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    return await this.getPublicClient().getBalance({ address: address as Address });
  }

  /**
   * Pre-publish validation: checks native ETH and ERC-20 token balances.
   *
   * Does not submit any transaction. Safe to call multiple times.
   *
   * @param reward - Reward struct specifying required amounts.
   * @param senderAddress - EVM address that will sign the publish transaction.
   * @returns A {@link ValidationResult} with `valid: true` when all balances are
   *   sufficient, or `valid: false` with a descriptive `errors` array.
   *
   * @example
   * ```ts
   * const result = await publisher.validate(reward, walletAddress);
   * if (!result.valid) console.error(result.errors);
   * ```
   */
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

  private getChain(chainId: bigint): Chain {
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
