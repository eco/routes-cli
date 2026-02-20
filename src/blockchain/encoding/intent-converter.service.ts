import { Injectable } from '@nestjs/common';
import { Hex } from 'viem';

import { AddressNormalizerService } from '../address-normalizer.service';
import { Intent, EvmAddress } from '@/shared/types';

@Injectable()
export class IntentConverterService {
  constructor(private readonly addrNorm: AddressNormalizerService) {}

  toEVMIntent(intent: Intent): {
    intentHash: Hex | undefined;
    destination: bigint;
    sourceChainId: bigint;
    route: ReturnType<IntentConverterService['toRouteEVMIntent']>;
    reward: ReturnType<IntentConverterService['toRewardEVMIntent']>;
  } {
    return {
      intentHash: intent.intentHash,
      destination: intent.destination,
      sourceChainId: intent.sourceChainId,
      route: this.toRouteEVMIntent(intent.route),
      reward: this.toRewardEVMIntent(intent.reward),
    };
  }

  toRewardEVMIntent(reward: Intent['reward']): {
    deadline: bigint;
    creator: EvmAddress;
    prover: EvmAddress;
    nativeAmount: bigint;
    tokens: { amount: bigint; token: EvmAddress }[];
  } {
    return {
      deadline: reward.deadline,
      creator: this.addrNorm.denormalizeToEvm(reward.creator),
      prover: this.addrNorm.denormalizeToEvm(reward.prover),
      nativeAmount: reward.nativeAmount,
      tokens: reward.tokens.map(token => ({
        amount: token.amount,
        token: this.addrNorm.denormalizeToEvm(token.token),
      })),
    };
  }

  toRouteEVMIntent(route: Intent['route']): {
    salt: Hex;
    deadline: bigint;
    portal: EvmAddress;
    nativeAmount: bigint;
    tokens: { amount: bigint; token: EvmAddress }[];
    calls: { data: Hex; target: EvmAddress; value: bigint }[];
  } {
    return {
      salt: route.salt,
      deadline: route.deadline,
      portal: this.addrNorm.denormalizeToEvm(route.portal),
      nativeAmount: route.nativeAmount,
      tokens: route.tokens.map(token => ({
        amount: token.amount,
        token: this.addrNorm.denormalizeToEvm(token.token),
      })),
      calls: route.calls.map(call => ({
        data: call.data,
        target: this.addrNorm.denormalizeToEvm(call.target),
        value: call.value,
      })),
    };
  }
}
