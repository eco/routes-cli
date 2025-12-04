/**
 * Scanner Module
 *
 * Factory and exports for creating chain-specific event scanners.
 * Supports scanning for fulfillments, proofs, and withdrawals.
 */

import { ChainType } from '@/core/interfaces/intent';

import { BaseScanner, ScannerConfig } from './base-scanner';
import { EvmScanner } from './evm-scanner';

export * from './base-scanner';

/**
 * Creates a scanner appropriate for the given chain type.
 */
export function createScanner(config: ScannerConfig): BaseScanner {
  switch (config.chainType) {
    case ChainType.EVM:
      return new EvmScanner(config);

    case ChainType.SVM:
      throw new Error(`SVM scanning not yet implemented. Intent: ${config.intentHash}`);

    case ChainType.TVM:
      throw new Error(`TVM scanning not yet implemented. Intent: ${config.intentHash}`);

    default:
      throw new Error(`Unsupported chain type: ${config.chainType}`);
  }
}

/**
 * Check if scanning is supported for a chain type
 */
export function isScanningSupported(chainType: ChainType): boolean {
  return chainType === ChainType.EVM;
}
