/**
 * Universal Address Type System
 *
 * Provides a unified address representation system for cross-chain compatibility
 * in the Routes CLI. All addresses are normalized to 32-byte hex strings to
 * enable consistent handling across EVM, TVM, and SVM blockchains.
 *
 * The UniversalAddress format:
 * - Always 32 bytes (64 hex characters) plus 0x prefix
 * - Shorter addresses are zero-padded (EVM addresses are padded from 20 to 32 bytes)
 * - Longer addresses (Solana) use the full 32 bytes natively
 * - Provides type safety through TypeScript branded types
 *
 * @example
 * ```typescript
 * // EVM address normalized to UniversalAddress
 * const evmAddr = '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b';
 * const universal = toUniversalAddress(padTo32Bytes(evmAddr));
 * // Result: '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b'
 *
 * // Solana address (already 32 bytes)
 * const solanaAddr = 'So11111111111111111111111111111111111111112';
 * const publicKey = new PublicKey(solanaAddr);
 * const solanaUniversal = '0x' + Buffer.from(publicKey.toBytes()).toString('hex');
 * ```
 */

/**
 * Branded type for Universal Addresses.
 *
 * Represents a blockchain address normalized to 32-byte hex format for
 * cross-chain compatibility. The branded type provides compile-time safety
 * to ensure only properly normalized addresses are used in UniversalAddress contexts.
 *
 * Format: '0x' + 64 hexadecimal characters (32 bytes)
 */
export type UniversalAddress = string & { readonly __brand: 'UniversalAddress' };

/**
 * Type guard to check if a value is a valid UniversalAddress.
 *
 * Validates that the value is a string matching the exact UniversalAddress
 * format requirements (0x prefix + exactly 64 hexadecimal characters).
 *
 * @param value - Value to check
 * @returns True if value is a valid UniversalAddress format
 *
 * @example
 * ```typescript
 * const addr1 = '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b';
 * const addr2 = '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b'; // Too short
 *
 * console.log(isUniversalAddress(addr1)); // true
 * console.log(isUniversalAddress(addr2)); // false
 * ```
 */
export function isUniversalAddress(value: unknown): value is UniversalAddress {
  if (typeof value !== 'string') return false;
  // Check for normalized format: 0x + 64 hex characters
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Creates a UniversalAddress from a normalized hex string.
 *
 * Validates the input format and casts it to the UniversalAddress branded type.
 * Use this function to safely convert validated hex strings to UniversalAddress type.
 *
 * @param normalized - Hex string in UniversalAddress format (0x + 64 hex chars)
 * @returns UniversalAddress branded type
 * @throws {Error} When the input format is invalid
 *
 * @example
 * ```typescript
 * const hexString = '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b';
 * const universalAddr = toUniversalAddress(hexString);
 * // universalAddr is now typed as UniversalAddress
 * ```
 */
export function toUniversalAddress(normalized: string): UniversalAddress {
  if (!isUniversalAddress(normalized)) {
    throw new Error(
      `Invalid normalized address format: ${normalized}. Expected 0x + 64 hex characters`
    );
  }
  return normalized as UniversalAddress;
}

/**
 * Pads a hex string to 32 bytes (64 hex characters).
 *
 * Takes a hex string of any length and zero-pads it to reach exactly 32 bytes.
 * This is essential for creating UniversalAddress format from shorter addresses
 * like EVM addresses (20 bytes).
 *
 * @param hex - Hex string to pad (with or without 0x prefix)
 * @returns Padded hex string with 0x prefix and exactly 64 hex characters
 * @throws {Error} When input hex string is longer than 32 bytes
 *
 * @example
 * ```typescript
 * const evmAddr = '0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b';
 * const padded = padTo32Bytes(evmAddr);
 * // Result: '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b'
 *
 * // Works without 0x prefix too
 * const withoutPrefix = padTo32Bytes('742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b');
 * // Same result
 * ```
 */
export function padTo32Bytes(hex: string): string {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.substring(2) : hex;

  if (cleanHex.length > 64) {
    throw new Error(`Address too long to pad: ${hex}. Maximum 32 bytes allowed`);
  }

  // Pad with zeros to reach 64 characters
  const padded = cleanHex.padStart(64, '0');
  return '0x' + padded;
}

/**
 * Removes padding from a 32-byte hex string.
 *
 * Takes a UniversalAddress format hex string and removes leading zeros to
 * recover the original shorter address format. Includes special handling
 * for EVM addresses to ensure proper 20-byte format.
 *
 * @param hex - 32-byte hex string (with or without 0x prefix)
 * @returns Unpadded hex string with 0x prefix
 *
 * @example
 * ```typescript
 * const universal = '0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b';
 * const unpadded = unpadFrom32Bytes(universal);
 * // Result: '0x742d35cc6634c0532925a3b8d65c32c2b3f6de1b' (EVM format)
 *
 * // For longer addresses (like Solana), preserves full length
 * const solanaUniversal = '0x11111111254fb6c44bac0bed2854e76f90643097d395b1c8de5d3000000000000';
 * const solanaUnpadded = unpadFrom32Bytes(solanaUniversal);
 * // Result: '0x11111111254fb6c44bac0bed2854e76f90643097d395b1c8de5d3000000000000'
 * ```
 */
export function unpadFrom32Bytes(hex: string): string {
  // Remove 0x prefix if present
  const cleanHex = hex.startsWith('0x') ? hex.substring(2) : hex;

  // Remove leading zeros, but keep at least one character
  const unpadded = cleanHex.replace(/^0+/, '') || '0';

  // For EVM addresses, ensure it's 20 bytes (40 hex chars)
  if (unpadded.length <= 40) {
    return '0x' + unpadded.padStart(40, '0');
  }

  return '0x' + unpadded;
}
