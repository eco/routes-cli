/**
 * Portal Hash Utilities
 *
 * Provides hash calculation and vault derivation utilities for the Portal contract system.
 * Implements the content-addressable hashing scheme with chain-specific encoding.
 */

import { encodePacked, Hex, keccak256 } from 'viem';

import { PortalEncoder } from '@/blockchain/utils/portal-encoder';
import { ChainType, Intent } from '@/shared/types';

const TVM_CHAIN_IDS = new Set([728126428, 2494104990]);
const SVM_CHAIN_IDS = new Set([1399811149, 1399811150, 1399811151]);

function detectChainType(chainId: bigint): ChainType {
  const id = Number(chainId);
  if (TVM_CHAIN_IDS.has(id)) return ChainType.TVM;
  if (SVM_CHAIN_IDS.has(id)) return ChainType.SVM;
  return ChainType.EVM;
}

export class PortalHashUtils {
  static getIntentHash(intent: Intent): { intentHash: Hex; routeHash: Hex; rewardHash: Hex } {
    const routeHash = PortalHashUtils.computeRouteHash(intent.route, intent.destination);
    const rewardHash = PortalHashUtils.computeRewardHash(intent.reward, intent.sourceChainId);

    const intentHash = keccak256(
      encodePacked(['uint64', 'bytes32', 'bytes32'], [intent.destination, routeHash, rewardHash])
    );

    return { intentHash, routeHash, rewardHash };
  }

  static getIntentHashFromReward(
    source: bigint,
    destination: bigint,
    encodedRoute: Hex,
    reward: Intent['reward']
  ): { intentHash: Hex; routeHash: Hex; rewardHash: Hex } {
    const routeHash = keccak256(encodedRoute);
    const rewardHash = PortalHashUtils.computeRewardHash(reward, source);

    const intentHash = keccak256(
      encodePacked(['uint64', 'bytes32', 'bytes32'], [destination, routeHash, rewardHash])
    );

    return { intentHash, routeHash, rewardHash };
  }

  static computeRouteHash(route: Intent['route'], destination: bigint): Hex {
    const chainType = detectChainType(destination);
    const routeEncoded = PortalEncoder.encode(route, chainType);
    return keccak256(routeEncoded);
  }

  static computeRewardHash(reward: Intent['reward'], sourceChainId: bigint): Hex {
    const chainType = detectChainType(sourceChainId);
    const rewardEncoded = PortalEncoder.encode(reward, chainType);
    return keccak256(rewardEncoded);
  }
}
