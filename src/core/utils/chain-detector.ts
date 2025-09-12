/**
 * Chain Type Detection Utility
 */

import { ChainType } from '../interfaces/intent';

export class ChainTypeDetector {
  /**
   * Detects the chain type from a chain ID
   */
  static detect(chainId: number | bigint): ChainType {
    const id = Number(chainId);

    // Default heuristics
    if (id === 728126428 || id === 2494104990) {
      return ChainType.TVM; // Tron range
    }

    if (id === 999999999) {
      return ChainType.SVM; // Solana range
    }

    // Default to EVM for standard chain IDs
    return ChainType.EVM;
  }
}
