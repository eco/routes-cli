/**
 * Intent Builder
 *
 * Implements the builder pattern for creating cross-chain intents in a fluent,
 * type-safe manner. Provides a convenient API for constructing complex Intent
 * objects with proper validation and automatic call generation.
 *
 * The builder handles:
 * - Default value initialization
 * - UniversalAddress management
 * - Chain-specific call generation
 * - Intent validation and hashing
 *
 * @example
 * ```typescript
 * const intent = await new IntentBuilder(sourceChain, destChain)
 *   .setRecipient(recipientAddress)
 *   .setCreator(creatorAddress)
 *   .setProver(proverAddress)
 *   .setPortal(portalAddress)
 *   .addRouteToken(tokenAddress, amount)
 *   .addRewardToken(rewardTokenAddress, rewardAmount)
 *   .build();
 * ```
 */

import { Hex } from 'viem';

import { evmCallsBuilder } from '@/builders/call-builders/evm-call-builder';
import { svmCallsBuilder } from '@/builders/call-builders/svm-call-builder';
import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { ChainConfig } from '@/config/chains';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { UniversalAddress } from '@/core/types/universal-address';
import { ChainTypeDetector } from '@/core/utils/chain-detector';

/**
 * Fluent builder for creating Intent objects.
 *
 * Provides a chain-able API for constructing cross-chain intents with validation
 * and automatic defaults. Works with UniversalAddress format throughout and
 * generates chain-specific calls during the build process.
 */
export class IntentBuilder {
  private intent: Partial<Intent> = {};
  private recipient: UniversalAddress | undefined;

  /**
   * Creates a new IntentBuilder instance.
   *
   * Initializes the builder with source and destination chain configurations
   * and sets up default values for route and reward structures.
   *
   * @param sourceChain - Configuration for the source blockchain
   * @param destinationChain - Configuration for the destination blockchain
   *
   * @example
   * ```typescript
   * const builder = new IntentBuilder(ethereumConfig, optimismConfig);
   * ```
   */
  constructor(
    private readonly sourceChain: ChainConfig,
    private readonly destinationChain: ChainConfig
  ) {
    // Initialize with default values
    this.intent.route = {
      salt: this.generateSalt(),
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      portal: ('0x' + '0'.repeat(64)) as UniversalAddress,
      nativeAmount: 0n,
      tokens: [],
      calls: [],
    };

    this.intent.reward = {
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600), // 1 hour from now
      creator: ('0x' + '0'.repeat(64)) as UniversalAddress,
      prover: ('0x' + '0'.repeat(64)) as UniversalAddress,
      nativeAmount: 0n,
      tokens: [],
    };
  }

  /**
   * Sets the recipient address for route transactions.
   *
   * @param recipient - UniversalAddress of the recipient on the destination chain
   * @returns This builder instance for method chaining
   *
   * @example
   * ```typescript
   * builder.setRecipient('0x742d35cc6634c0532925a3b8d65c32c2b3f6de1b000000000000000000000000');
   * ```
   */
  setRecipient(recipient: UniversalAddress): IntentBuilder {
    this.recipient = recipient;
    return this;
  }

  /**
   * Sets the source chain ID for the intent.
   *
   * @param chainId - Chain ID of the source blockchain
   * @returns This builder instance for method chaining
   */
  setSourceChain(chainId: bigint): IntentBuilder {
    this.intent.sourceChainId = chainId;
    return this;
  }

  /**
   * Sets the destination chain ID for the intent.
   *
   * @param chainId - Chain ID of the destination blockchain
   * @returns This builder instance for method chaining
   */
  setDestinationChain(chainId: bigint): IntentBuilder {
    this.intent.destination = chainId;
    return this;
  }

  setPortal(address: UniversalAddress): IntentBuilder {
    if (this.intent.route) {
      this.intent.route.portal = address;
    }
    return this;
  }

  setRouteDeadline(timestamp: bigint): IntentBuilder {
    if (this.intent.route) {
      this.intent.route.deadline = timestamp;
    }
    return this;
  }

  setRewardDeadline(timestamp: bigint): IntentBuilder {
    if (this.intent.reward) {
      this.intent.reward.deadline = timestamp;
    }
    return this;
  }

  setCreator(address: UniversalAddress): IntentBuilder {
    if (this.intent.reward) {
      this.intent.reward.creator = address;
    }
    return this;
  }

  setProver(address: UniversalAddress): IntentBuilder {
    if (this.intent.reward) {
      this.intent.reward.prover = address;
    }
    return this;
  }

  addRouteNativeAmount(amount: bigint): IntentBuilder {
    if (this.intent.route) {
      this.intent.route.nativeAmount = amount;
    }
    return this;
  }

  addRewardNativeAmount(amount: bigint): IntentBuilder {
    if (this.intent.reward) {
      this.intent.reward.nativeAmount = amount;
    }
    return this;
  }

  addRouteToken(token: UniversalAddress, amount: bigint): IntentBuilder {
    if (this.intent.route) {
      this.intent.route.tokens.push({ token, amount });
    }
    return this;
  }

  addRewardToken(token: UniversalAddress, amount: bigint): IntentBuilder {
    if (this.intent.reward) {
      this.intent.reward.tokens.push({ token, amount });
    }
    return this;
  }

  generateIntentHash(): Hex {
    if (!this.isValid()) {
      throw new Error('Intent is not complete');
    }

    return PortalHashUtils.getIntentHash(this.intent as Intent).intentHash;
  }

  async buildCalls() {
    const chainType = ChainTypeDetector.detect(this.intent.destination!);
    switch (chainType) {
      case ChainType.EVM:
      case ChainType.TVM:
        return evmCallsBuilder(this.intent.route as Intent['route'], this.recipient!);
      case ChainType.SVM:
        return await svmCallsBuilder(
          this.destinationChain,
          this.intent.route as Intent['route'],
          this.recipient!
        );
      default:
        throw new Error(`Unimplemented route call build for ${chainType}`);
    }
  }

  /**
   * Builds the final Intent object.
   *
   * Validates all required fields are set, generates chain-specific calls,
   * computes the intent hash, and returns the complete Intent object.
   *
   * @returns Promise resolving to the complete Intent object
   * @throws {Error} When required fields are missing or call generation fails
   *
   * @example
   * ```typescript
   * const intent = await builder
   *   .setRecipient(recipient)
   *   .setCreator(creator)
   *   .setProver(prover)
   *   .addRouteToken(token, amount)
   *   .build();
   *
   * console.log(`Intent hash: ${intent.intentHash}`);
   * ```
   */
  async build(): Promise<Intent> {
    if (!this.isValid()) {
      throw new Error('Intent is not complete. Missing required fields.');
    }

    const intent = this.intent as Intent;
    intent.route.calls = await this.buildCalls();
    intent.intentHash = this.generateIntentHash();

    return intent;
  }

  private generateSalt(): Hex {
    const randomBytes = new Uint8Array(32);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const crypto = require('node:crypto');
    crypto.randomFillSync(randomBytes);
    return ('0x' + Buffer.from(randomBytes).toString('hex')) as Hex;
  }

  private isValid(): boolean {
    return !!(
      this.intent.sourceChainId &&
      this.intent.destination &&
      this.intent.route &&
      this.intent.reward &&
      this.intent.route.portal &&
      this.intent.reward.creator &&
      this.intent.reward.prover
    );
  }
}
