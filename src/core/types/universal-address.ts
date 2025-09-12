/**
 * Universal Address Type System
 * Simplified version from the solver for CLI usage
 */

/**
 * Branded type for Universal Addresses
 * All addresses are stored as 32-byte hex strings (0x + 64 chars)
 */
export type UniversalAddress = string & { readonly __brand: 'UniversalAddress' };

/**
 * Type guard to check if a value is a UniversalAddress
 */
export function isUniversalAddress(value: unknown): value is UniversalAddress {
  if (typeof value !== 'string') return false;
  // Check for normalized format: 0x + 64 hex characters
  return /^0x[a-fA-F0-9]{64}$/.test(value);
}

/**
 * Creates a UniversalAddress from a normalized hex string
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
 * Pads a hex string to 32 bytes (64 hex characters)
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
 * Removes padding from a 32-byte hex string
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
