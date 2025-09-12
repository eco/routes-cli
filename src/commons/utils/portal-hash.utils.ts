/**
 * Portal Hash Utilities
 *
 * Provides hash calculation and vault derivation utilities for the Portal contract system.
 * Implements the content-addressable hashing scheme with chain-specific encoding.
 */

import { encodePacked, Hex, keccak256 } from 'viem';
import { Intent } from '@/core/interfaces/intent';
import { ChainTypeDetector } from '@/core/utils/chain-detector';
import { PortalEncoder } from '@/core/utils/portal-encoder';

export class PortalHashUtils {
  static getIntentHash(intent: Intent): { intentHash: Hex; routeHash: Hex; rewardHash: Hex } {
    const routeHash = PortalHashUtils.computeRouteHash(intent.route, intent.destination);
    const rewardHash = PortalHashUtils.computeRewardHash(intent.reward, intent.sourceChainId);

    // Compute the intent hash using encodePacked
    // intentHash = keccak256(abi.encodePacked(destination, routeHash, rewardHash))
    const intentHash = keccak256(
      encodePacked(['uint64', 'bytes32', 'bytes32'], [intent.destination, routeHash, rewardHash])
    );

    return {
      intentHash,
      routeHash,
      rewardHash,
    };
  }

  /**
   * Computes route hash using source chain encoding
   * Accepts both Intent route (with UniversalAddress) and EVMIntent route
   *
   * @param route - Route data structure
   * @param destination - Destination chain id
   * @returns Route hash as Hex
   */
  static computeRouteHash(route: Intent['route'], destination: bigint): Hex {
    const chainType = ChainTypeDetector.detect(destination);
    const routeEncoded = PortalEncoder.encode(route, chainType);
    return keccak256(routeEncoded);
  }

  /**
   * Computes reward hash using source chain encoding
   * Accepts both Intent reward (with UniversalAddress)
   *
   * @param reward - Reward data structure
   * @param sourceChainId - Source chain ID to determine encoding type
   * @returns Reward hash as Hex
   */
  static computeRewardHash(reward: Intent['reward'], sourceChainId: bigint): Hex {
    const chainType = ChainTypeDetector.detect(sourceChainId);
    const rewardEncoded = PortalEncoder.encode(reward, chainType);
    return keccak256(rewardEncoded);
  }
}
