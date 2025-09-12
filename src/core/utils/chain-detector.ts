/**
 * Chain Type Detector Utility
 *
 * Determines the blockchain type (EVM, TVM, SVM) based on chain ID or network identifier.
 * Used for Portal contract encoding/decoding operations.
 */

import { ChainType } from '@/core/interfaces/intent';

/**
 * Chain ID ranges and specific identifiers for different blockchain types
 */
const CHAIN_TYPE_MAPPINGS = {
  // TVM chain IDs (Tron-specific)
  TVM_CHAIN_IDS: [
    728126428, // Tron mainnet
    2494104990, // Tron Shasta testnet
    // Add more TVM chain IDs as needed
  ],

  // SVM chain IDs (Solana-specific numeric IDs)
  SVM_CHAIN_IDS: [
    1399811149, // Solana mainnet
    1399811150, // Solana devnet
    1399811151, // Solana testnet
  ],
};

export class ChainTypeDetector {
  /**
   * Detects chain type from numeric chain ID
   *
   * @param chainIdentifier - Chain ID (number/bigint)
   * @returns ChainType enum value
   * @throws Error if chain type cannot be determined
   */
  static detect(chainIdentifier: bigint | number | string): ChainType {
    // Handle legacy string identifiers (deprecated - should be numeric)
    if (typeof chainIdentifier === 'string') {
      throw new Error(
        `String chain identifiers are deprecated. Use numeric chain IDs instead: ${chainIdentifier}`
      );
    }

    // Convert bigint to number for comparison
    const chainId = typeof chainIdentifier === 'bigint' ? Number(chainIdentifier) : chainIdentifier;

    // Check SVM chains first
    if (CHAIN_TYPE_MAPPINGS.SVM_CHAIN_IDS.includes(chainId)) {
      return ChainType.SVM;
    }

    // Check TVM chains
    if (CHAIN_TYPE_MAPPINGS.TVM_CHAIN_IDS.includes(chainId)) {
      return ChainType.TVM;
    }

    // Default heuristics for unknown chains (likely EVM)
    if (this.isLikelyEvmChainId(chainId)) {
      return ChainType.EVM;
    }

    throw new Error(`Cannot determine chain type for chain ID: ${chainId}`);
  }

  /**
   * Gets the native address format for a chain type
   *
   * @param chainType - The chain type
   * @returns Address format description
   */
  static getAddressFormat(chainType: ChainType): string {
    switch (chainType) {
      case ChainType.EVM:
        return 'hex (0x prefixed, 20 bytes)';
      case ChainType.TVM:
        return 'base58 (Tron format)';
      case ChainType.SVM:
        return 'base58 (Solana format, 32 bytes)';
      default:
        throw new Error(`Unknown chain type: ${chainType}`);
    }
  }

  /**
   * Validates if an address format matches the expected chain type
   *
   * @param address - Address string to validate
   * @param chainType - Expected chain type
   * @returns true if address format matches chain type
   */
  static isValidAddressForChain(address: string, chainType: ChainType): boolean {
    switch (chainType) {
      case ChainType.EVM:
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case ChainType.TVM:
        // Tron addresses start with T and are 34 characters long
        return /^T[A-Za-z0-9]{33}$/.test(address);
      case ChainType.SVM:
        // Solana addresses are base58 encoded, typically 32-44 characters
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  }

  /**
   * Checks if a chain ID follows EVM conventions
   * EVM chain IDs are typically positive integers within reasonable ranges
   *
   * @param chainId - Numeric chain ID
   * @returns true if likely an EVM chain
   */
  private static isLikelyEvmChainId(chainId: number): boolean {
    // EVM chain IDs are typically:
    // - Positive integers
    // - Less than 2^32 (4,294,967,296)
    return (
      Number.isInteger(chainId) &&
      chainId > 0 &&
      chainId < 4_294_967_296 &&
      !CHAIN_TYPE_MAPPINGS.TVM_CHAIN_IDS.includes(chainId)
    );
  }
}
