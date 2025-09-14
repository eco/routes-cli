/**
 * Intent Converter Utility
 *
 * Provides conversion functions to transform Intent objects with UniversalAddresses
 * into blockchain-specific formats. This is primarily used by publishers before
 * encoding data for blockchain transactions.
 *
 * The converter handles address denormalization from UniversalAddress format to
 * chain-native formats (EVM hex, Tron base58, Solana base58) while preserving
 * all other intent data intact.
 *
 * @example
 * ```typescript
 * // Convert intent to EVM-compatible format
 * const evmIntent = toEVMIntent(universalIntent);
 *
 * // Convert individual components
 * const evmRoute = toRouteEVMIntent(universalIntent.route);
 * const evmReward = toRewardEVMIntent(universalIntent.reward);
 * ```
 */

import { Intent } from '../interfaces/intent';

import { AddressNormalizer } from './address-normalizer';

/**
 * Converts a normalized Intent to EVM-specific intent format.
 *
 * Takes an Intent with UniversalAddresses and converts all addresses to EVM format
 * (checksummed hex strings). The intent structure remains the same, but all
 * addresses are denormalized for EVM blockchain compatibility.
 *
 * @param intent - Intent object with UniversalAddresses
 * @returns Intent object with EVM-format addresses
 *
 * @example
 * ```typescript
 * const universalIntent = {
 *   intentHash: '0x123...',
 *   destination: ChainType.EVM,
 *   sourceChainId: 1n,
 *   route: { portal: '0x000...742d35cc...', ... },
 *   reward: { creator: '0x000...567abc...', ... }
 * };
 *
 * const evmIntent = toEVMIntent(universalIntent);
 * // evmIntent.route.portal is now '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b'
 * ```
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

/**
 * Converts a reward object to EVM-specific format.
 *
 * Denormalizes all addresses in the reward structure from UniversalAddress
 * format to EVM hex format. Used when preparing reward data for EVM chains.
 *
 * @param reward - Reward object with UniversalAddresses
 * @returns Reward object with EVM-format addresses
 *
 * @example
 * ```typescript
 * const reward = {
 *   creator: '0x000...742d35cc...',  // UniversalAddress
 *   prover: '0x000...567abc...',     // UniversalAddress
 *   tokens: [{ token: '0x000...def123...', amount: 1000n }],
 *   // ... other properties
 * };
 *
 * const evmReward = toRewardEVMIntent(reward);
 * // evmReward.creator is now '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b'
 * ```
 */
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

/**
 * Converts a route object to EVM-specific format.
 *
 * Denormalizes all addresses in the route structure from UniversalAddress
 * format to EVM hex format. This includes portal address, token addresses,
 * and call target addresses.
 *
 * @param route - Route object with UniversalAddresses
 * @returns Route object with EVM-format addresses
 *
 * @example
 * ```typescript
 * const route = {
 *   portal: '0x000...742d35cc...',     // UniversalAddress
 *   tokens: [{ token: '0x000...def123...', amount: 1000n }],
 *   calls: [{ target: '0x000...abc456...', data: '0x', value: 0n }],
 *   // ... other properties
 * };
 *
 * const evmRoute = toRouteEVMIntent(route);
 * // evmRoute.portal is now '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b'
 * // evmRoute.calls[0].target is now in EVM hex format
 * ```
 */
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
