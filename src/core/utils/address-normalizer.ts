/**
 * Address Normalization Utility
 *
 * Provides utilities for converting between chain-native address formats and the normalized
 * UniversalAddress format used throughout the Routes CLI system. This enables cross-chain
 * compatibility by providing a unified 32-byte address representation.
 *
 * Supported blockchain types:
 * - EVM: Ethereum Virtual Machine chains (Ethereum, Optimism, Base, etc.)
 * - TVM: Tron Virtual Machine (Tron blockchain)
 * - SVM: Solana Virtual Machine (Solana blockchain)
 *
 * @example
 * ```typescript
 * // Normalize an EVM address
 * const evmAddress = '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b';
 * const universal = AddressNormalizer.normalize(evmAddress, ChainType.EVM);
 *
 * // Denormalize back to EVM format
 * const original = AddressNormalizer.denormalize(universal, ChainType.EVM);
 * ```
 */

import { PublicKey } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import { getAddress, isAddress as isViemAddress } from 'viem';

import { getErrorMessage } from '@/commons/utils/error-handler';
import { ChainType } from '@/core/interfaces/intent';
import {
  BlockchainAddress,
  EvmAddress,
  SvmAddress,
  TronAddress,
} from '@/core/types/blockchain-addresses';
import { padTo32Bytes, UniversalAddress, unpadFrom32Bytes } from '@/core/types/universal-address';

export class AddressNormalizer {
  /**
   * Normalizes a chain-native address to UniversalAddress format.
   *
   * This method converts addresses from their native blockchain format to a standardized
   * 32-byte hexadecimal representation that can be used across all supported chains.
   *
   * @param address - The address in chain-native format (EVM hex, Tron base58, or Solana base58)
   * @param chainType - The blockchain type indicating the source format
   * @returns Normalized UniversalAddress (0x prefix + 64 hex characters)
   * @throws {Error} When the chain type is unsupported or address format is invalid
   *
   * @example
   * ```typescript
   * // EVM address
   * const evmUniversal = AddressNormalizer.normalize(
   *   '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b',
   *   ChainType.EVM
   * );
   *
   * // Tron address
   * const tronUniversal = AddressNormalizer.normalize(
   *   'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH',
   *   ChainType.TVM
   * );
   *
   * // Solana address
   * const solanaUniversal = AddressNormalizer.normalize(
   *   'So11111111111111111111111111111111111111112',
   *   ChainType.SVM
   * );
   * ```
   */
  static normalize(address: BlockchainAddress, chainType: ChainType): UniversalAddress {
    switch (chainType) {
      case ChainType.EVM:
        return this.normalizeEvm(address as EvmAddress);
      case ChainType.TVM:
        return this.normalizeTvm(address as TronAddress);
      case ChainType.SVM:
        return this.normalizeSvm(address as SvmAddress);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Denormalizes a UniversalAddress to chain-native format.
   *
   * This method converts a standardized 32-byte UniversalAddress back to the native
   * address format expected by the target blockchain. This is essential when making
   * actual blockchain calls or displaying addresses to users.
   *
   * @param address - The normalized UniversalAddress to convert
   * @param chainType - The target blockchain type for the output format
   * @returns Address in the chain-native format (EVM hex, Tron base58, or Solana base58)
   * @throws {Error} When the chain type is unsupported or address is invalid
   *
   * @example
   * ```typescript
   * const universal = '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b';
   *
   * // Convert to EVM format
   * const evmAddr = AddressNormalizer.denormalize(universal, ChainType.EVM);
   * // Returns: '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b'
   *
   * // Convert to Tron format
   * const tronAddr = AddressNormalizer.denormalize(universal, ChainType.TVM);
   * // Returns: 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH'
   * ```
   */
  static denormalize<
    chainType extends ChainType,
    Addr extends chainType extends ChainType.TVM
      ? TronAddress
      : chainType extends ChainType.EVM
        ? EvmAddress
        : chainType extends ChainType.SVM
          ? SvmAddress
          : never,
  >(address: UniversalAddress, chainType: chainType): Addr {
    switch (chainType) {
      case ChainType.EVM:
        return this.denormalizeToEvm(address) as Addr;
      case ChainType.TVM:
        return this.denormalizeToTvm(address) as Addr;
      case ChainType.SVM:
        return this.denormalizeToSvm(address) as Addr;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Denormalizes a UniversalAddress to EVM (Ethereum) format.
   *
   * Converts a 32-byte universal address to a 20-byte EVM address with proper
   * checksumming according to EIP-55 specification.
   *
   * @param address - The UniversalAddress to convert
   * @returns EVM address in checksummed hex format (0x + 40 hex characters)
   * @throws {Error} When the resulting address is invalid
   *
   * @example
   * ```typescript
   * const universal = '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b';
   * const evmAddr = AddressNormalizer.denormalizeToEvm(universal);
   * // Returns: '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b'
   * ```
   */
  static denormalizeToEvm(address: UniversalAddress): EvmAddress {
    // Remove padding (the last 24 characters are padding for 20-byte EVM addresses)
    const unpadded = unpadFrom32Bytes(address);

    // Take only the last 40 hex characters (20 bytes)
    const cleanHex = unpadded.substring(2); // Remove 0x
    const evmHex = cleanHex.length > 40 ? cleanHex.substring(cleanHex.length - 40) : cleanHex;

    // Validate and return checksum address
    const evmAddress = '0x' + evmHex;
    if (!isViemAddress(evmAddress)) {
      throw new Error(`Invalid EVM address after denormalization: ${evmAddress}`);
    }

    return getAddress(evmAddress);
  }

  /**
   * Denormalizes a UniversalAddress to TVM (Tron) format.
   *
   * Converts a 32-byte universal address to a Tron address in base58 format.
   * Handles both hex and base58 representations internally and validates the result.
   *
   * @param address - The UniversalAddress to convert
   * @returns Tron address in base58 format (starting with 'T')
   * @throws {Error} When conversion fails or the resulting address is invalid
   *
   * @example
   * ```typescript
   * const universal = '0x41c4a8f8b915b8c0e6a5e6c8b2c4d3f2a8b9c7d6e5f4a3b2c1d0e9f8a7b6c5d4';
   * const tronAddr = AddressNormalizer.denormalizeToTvm(universal);
   * // Returns: 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH'
   * ```
   */
  static denormalizeToTvm(address: UniversalAddress): TronAddress {
    try {
      // Remove padding
      const unpadded = unpadFrom32Bytes(address);

      // Remove 0x prefix
      const hexAddress = unpadded.startsWith('0x41')
        ? unpadded.substring(2)
        : '41' + unpadded.substring(2);

      // Convert to base58 Tron address
      const base58Address = TronWeb.address.fromHex(hexAddress);

      if (!TronWeb.isAddress(base58Address)) {
        throw new Error(`Invalid Tron address after denormalization: ${base58Address}`);
      }

      return base58Address as TronAddress;
    } catch (error) {
      throw new Error(`Failed to denormalize to TVM address: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Denormalizes a UniversalAddress to SVM (Solana) format.
   *
   * Converts a 32-byte universal address to a Solana address in base58 format.
   * Solana addresses are naturally 32 bytes, so no padding removal is needed.
   *
   * @param address - The UniversalAddress to convert
   * @returns Solana address in base58 format
   * @throws {Error} When the address length is invalid or conversion fails
   *
   * @example
   * ```typescript
   * const universal = '0x11111111254fb6c44bAC0beD2854e76F90643097d395B1c8de5D3000000000000';
   * const solanaAddr = AddressNormalizer.denormalizeToSvm(universal);
   * // Returns: 'So11111111111111111111111111111111111111112'
   * ```
   */
  static denormalizeToSvm(address: UniversalAddress): SvmAddress {
    try {
      // Remove 0x prefix
      const hex = address.startsWith('0x') ? address.slice(2) : address;

      // Convert hex to bytes (Solana addresses are 32 bytes, no unpadding needed)
      const bytes = Buffer.from(hex, 'hex');

      if (bytes.length !== 32) {
        throw new Error(`Expected 32 bytes, got ${bytes.length}`);
      }

      // Create PublicKey from bytes
      const publicKey = new PublicKey(bytes);

      // Return base58 encoded address
      return publicKey.toBase58() as SvmAddress;
    } catch (error) {
      throw new Error(`Failed to denormalize to SVM address: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Normalizes an EVM address to UniversalAddress format.
   *
   * Takes a 20-byte EVM address and pads it to 32 bytes for universal representation.
   * The address is validated and checksummed before normalization.
   *
   * @param address - The EVM address to normalize (0x + 40 hex characters)
   * @returns UniversalAddress with zero-padding (0x + 64 hex characters)
   * @throws {Error} When the EVM address format is invalid
   *
   * @example
   * ```typescript
   * const evmAddr = '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b';
   * const universal = AddressNormalizer.normalizeEvm(evmAddr);
   * // Returns: '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b'
   * ```
   */
  static normalizeEvm(address: EvmAddress): UniversalAddress {
    // Validate and checksum the address
    if (!isViemAddress(address)) {
      throw new Error(`Invalid EVM address: ${address}`);
    }

    // Get checksummed address
    const checksummed = getAddress(address);

    // Pad to 32 bytes (EVM addresses are 20 bytes, so we pad with 12 bytes of zeros)
    return padTo32Bytes(checksummed) as UniversalAddress;
  }

  /**
   * Normalizes a Tron address to UniversalAddress format.
   *
   * Accepts Tron addresses in both base58 format (e.g., 'TLyqz...') and hex format.
   * Validates the address and converts it to the universal 32-byte representation.
   *
   * @param address - The Tron address to normalize (base58 or hex format)
   * @returns UniversalAddress with proper padding (0x + 64 hex characters)
   * @throws {Error} When the Tron address format is invalid or conversion fails
   *
   * @example
   * ```typescript
   * // Base58 format
   * const tronAddr = 'TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH';
   * const universal = AddressNormalizer.normalizeTvm(tronAddr);
   *
   * // Hex format also supported
   * const hexAddr = '0x41c4a8f8b915b8c0e6a5e6c8b2c4d3f2a8b9c7d6';
   * const universal2 = AddressNormalizer.normalizeTvm(hexAddr);
   * ```
   */
  static normalizeTvm(address: TronAddress): UniversalAddress {
    try {
      let hexAddress: string;

      // Check if it's already hex format
      if (address.startsWith('0x')) {
        const hexTronAddr = address.startsWith('0x41') ? address : '0x41' + address.substring(2);

        // Validate it's a proper Tron hex address
        const base58 = TronWeb.address.fromHex(hexTronAddr.substring(2));
        if (!TronWeb.isAddress(base58)) {
          throw new Error(`Invalid Tron hex address: ${address}`);
        }
        hexAddress = hexTronAddr.toLowerCase();
      } else {
        // Assume it's base58 format
        if (!TronWeb.isAddress(address)) {
          throw new Error(`Invalid Tron base58 address: ${address}`);
        }
        // Convert to hex (Tron addresses are 21 bytes, first byte is 0x41)
        const tronHex = TronWeb.address.toHex(address);
        hexAddress = '0x' + tronHex.toLowerCase();
      }

      // Pad to 32 bytes
      return padTo32Bytes(hexAddress) as UniversalAddress;
    } catch (error) {
      throw new Error(`Failed to normalize TVM address ${address}: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Normalizes a Solana address to UniversalAddress format.
   *
   * Accepts Solana addresses in base58 format or as PublicKey objects.
   * Since Solana addresses are naturally 32 bytes, no padding is required.
   *
   * @param address - The Solana address to normalize (base58 string or PublicKey object)
   * @returns UniversalAddress in hex format (0x + 64 hex characters)
   * @throws {Error} When the Solana address format is invalid or conversion fails
   *
   * @example
   * ```typescript
   * // Base58 format
   * const solanaAddr = 'So11111111111111111111111111111111111111112';
   * const universal = AddressNormalizer.normalizeSvm(solanaAddr);
   *
   * // PublicKey object also supported
   * const publicKey = new PublicKey(solanaAddr);
   * const universal2 = AddressNormalizer.normalizeSvm(publicKey);
   * ```
   */
  static normalizeSvm(address: SvmAddress | PublicKey): UniversalAddress {
    try {
      // Create PublicKey from the address
      const publicKey = address instanceof PublicKey ? address : new PublicKey(address);

      // Convert to bytes and then to hex
      const bytes = publicKey.toBytes();
      const hex = '0x' + Buffer.from(bytes).toString('hex');

      // Solana addresses are already 32 bytes, so no padding needed
      return hex as UniversalAddress;
    } catch (error) {
      throw new Error(`Failed to normalize SVM address ${address}: ${getErrorMessage(error)}`);
    }
  }
}
