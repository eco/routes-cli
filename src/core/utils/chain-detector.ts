/**
 * Chain Type Detector Utility
 *
 * Provides utilities for determining blockchain types (EVM, TVM, SVM) from chain identifiers
 * and validating address formats for cross-chain operations. This is essential for the
 * Routes CLI system to handle multi-chain intent publishing correctly.
 *
 * Supports:
 * - EVM chains: Ethereum, Optimism, Base, Arbitrum, etc.
 * - TVM chains: Tron mainnet and testnets
 * - SVM chains: Solana mainnet, devnet, and testnet
 *
 * @example
 * ```typescript
 * // Detect chain type from ID
 * const chainType = ChainTypeDetector.detect(1); // ChainType.EVM (Ethereum)
 * const solanaType = ChainTypeDetector.detect(1399811149); // ChainType.SVM
 *
 * // Validate address format
 * const isValid = ChainTypeDetector.isValidAddressForChain(
 *   '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b',
 *   ChainType.EVM
 * ); // true
 * ```
 */

import { ChainType } from '@/core/interfaces/intent';
import { Network } from '@/commons/idls/portal.idl';
import { getChainById } from '@/config/chains';

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
   * Detects chain type from numeric chain ID.
   *
   * Uses predefined mappings for known TVM and SVM chains, falling back to
   * EVM detection heuristics for unrecognized chain IDs. String identifiers
   * are deprecated in favor of numeric chain IDs.
   *
   * @param chainIdentifier - Chain ID as number, bigint, or deprecated string
   * @returns ChainType enum value (EVM, TVM, or SVM)
   * @throws {Error} When chain type cannot be determined or string identifier is used
   *
   * @example
   * ```typescript
   * // Ethereum mainnet
   * const ethType = ChainTypeDetector.detect(1); // ChainType.EVM
   *
   * // Tron mainnet
   * const tronType = ChainTypeDetector.detect(728126428); // ChainType.TVM
   *
   * // Solana mainnet
   * const solanaType = ChainTypeDetector.detect(1399811149); // ChainType.SVM
   *
   * // Bigint support
   * const chainType = ChainTypeDetector.detect(1n); // ChainType.EVM
   * ```
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
   * Gets the native address format description for a chain type.
   *
   * Provides human-readable descriptions of address formats used by different
   * blockchain types. Useful for user interfaces and validation messages.
   *
   * @param chainType - The blockchain type to get format for
   * @returns Human-readable address format description
   * @throws {Error} When chain type is unknown
   *
   * @example
   * ```typescript
   * const evmFormat = ChainTypeDetector.getAddressFormat(ChainType.EVM);
   * // Returns: 'hex (0x prefixed, 20 bytes)'
   *
   * const solanaFormat = ChainTypeDetector.getAddressFormat(ChainType.SVM);
   * // Returns: 'base58 (Solana format, 32 bytes)'
   * ```
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
   * Validates if an address format matches the expected chain type.
   *
   * Performs regex-based validation to check if an address string conforms
   * to the expected format for a given blockchain type. Does not validate
   * checksums or verify the address exists on-chain.
   *
   * @param address - Address string to validate
   * @param chainType - Expected blockchain type for validation
   * @returns True if address format matches the chain type, false otherwise
   *
   * @example
   * ```typescript
   * // Valid EVM address
   * const isValidEvm = ChainTypeDetector.isValidAddressForChain(
   *   '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b',
   *   ChainType.EVM
   * ); // true
   *
   * // Invalid EVM address (wrong format)
   * const isInvalid = ChainTypeDetector.isValidAddressForChain(
   *   'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH',
   *   ChainType.EVM
   * ); // false
   *
   * // Valid Tron address
   * const isValidTron = ChainTypeDetector.isValidAddressForChain(
   *   'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH',
   *   ChainType.TVM
   * ); // true
   * ```
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

  /**
   * Determines the network (mainnet/devnet) from chain configuration
   *
   * @param chainId - Chain ID to look up
   * @returns Network enum value
   * @throws Error if chain is not found
   */
  static getNetworkFromChainConfig(chainId: bigint): Network {
    const chainConfig = getChainById(chainId);
    if (!chainConfig) {
      throw new Error(`Unknown chain: ${chainId}`);
    }
    
    return chainConfig.env === 'production' ? Network.MAINNET : Network.DEVNET;
  }
}
