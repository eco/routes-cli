import { Intent } from '../interfaces/intent';

import { AddressNormalizer } from './address-normalizer';

/**
 * Converts a normalized Intent to EVM-specific intent
 */
export function toEVMIntent(intent: Intent) {
  return {
    intentHash: intent.intentHash,
    destination: intent.destination,
    sourceChainId: intent.sourceChainId,
    route: toRouteEVMIntent(intent.route),
    reward: toRewardEVMIntent(intent.reward),
  };
}

export function toRewardEVMIntent(reward: Intent['reward']) {
  return {
    deadline: reward.deadline,
    creator: AddressNormalizer.denormalizeToEvm(reward.creator),
    prover: AddressNormalizer.denormalizeToEvm(reward.prover),
    nativeAmount: reward.nativeAmount,
    tokens: reward.tokens.map(token => ({
      amount: token.amount,
      token: AddressNormalizer.denormalizeToEvm(token.token),
    })),
  };
}

export function toRouteEVMIntent(route: Intent['route']) {
  return {
    salt: route.salt,
    deadline: route.deadline,
    portal: AddressNormalizer.denormalizeToEvm(route.portal),
    nativeAmount: route.nativeAmount,
    tokens: route.tokens.map(token => ({
      amount: token.amount,
      token: AddressNormalizer.denormalizeToEvm(token.token),
    })),
    calls: route.calls.map(call => ({
      data: call.data,
      target: AddressNormalizer.denormalizeToEvm(call.target),
      value: call.value,
    })),
  };
}
