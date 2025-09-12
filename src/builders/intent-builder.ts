/**
 * Intent Builder
 * Builder pattern for creating intents
 */

import { Hex, keccak256, encodePacked } from 'viem';
import { Intent } from '../core/interfaces/intent';
import { UniversalAddress } from '../core/types/universal-address';
import { AddressNormalizer } from '../core/utils/address-normalizer';
import { ChainTypeDetector } from '../core/utils/chain-detector';

export class IntentBuilder {
  private intent: Partial<Intent> = {};

  constructor() {
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

  private generateSalt(): Hex {
    const randomBytes = new Uint8Array(32);
    const crypto = require('crypto');
    crypto.randomFillSync(randomBytes);
    return ('0x' + Buffer.from(randomBytes).toString('hex')) as Hex;
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

  addCall(target: UniversalAddress, data: Hex, value: bigint = 0n): IntentBuilder {
    if (this.intent.route) {
      this.intent.route.calls.push({ target, data, value });
    }
    return this;
  }

  generateIntentHash(): Hex {
    if (!this.isValid()) {
      throw new Error('Intent is not complete');
    }

    const intent = this.intent as Intent;

    // Generate hash based on key intent properties
    const hashInput = encodePacked(
      ['bytes32', 'uint256', 'uint256', 'address', 'address'],
      [
        intent.route.salt,
        intent.sourceChainId,
        intent.destination,
        AddressNormalizer.denormalizeToEvm(intent.route.portal),
        AddressNormalizer.denormalizeToEvm(intent.reward.creator),
      ]
    );

    return keccak256(hashInput);
  }

  build(): Intent {
    if (!this.isValid()) {
      throw new Error('Intent is not complete. Missing required fields.');
    }

    const intent = this.intent as Intent;
    intent.intentHash = this.generateIntentHash();

    return intent;
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
