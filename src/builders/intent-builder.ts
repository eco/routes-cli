/**
 * Intent Builder
 * Builder pattern for creating intents
 */

import { Hex } from 'viem';

import { ChainType, Intent } from '@/core/interfaces/intent';
import { UniversalAddress } from '@/core/types/universal-address';
import { ChainTypeDetector } from '@/core/utils/chain-detector';
import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { evmCallsBuilder } from '@/builders/call-builders/evm-call-builder';
import { svmCallsBuilder } from '@/builders/call-builders/svm-call-builder';
import { ChainConfig } from '@/config/chains';

export class IntentBuilder {
  private intent: Partial<Intent> = {};
  private recipient: UniversalAddress | undefined;

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

  setRecipient(recipient: UniversalAddress): IntentBuilder {
    this.recipient = recipient;
    return this;
  }

  setSourceChain(chainId: bigint): IntentBuilder {
    this.intent.sourceChainId = chainId;
    return this;
  }

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
    const crypto = require('crypto');
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
