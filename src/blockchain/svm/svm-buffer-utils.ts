/**
 * SVM Buffer Utility Functions
 * Centralizes buffer operations for consistency and maintainability
 */

import { Hex } from 'viem';

/**
 * Converts a hex string to a Buffer, removing the '0x' prefix if present
 */
export function hexToBuffer(hex: string | Hex): Buffer {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Converts a hex string to a Buffer, removing the '0x' prefix if present
 */
export function hexToArray(hex: string | Hex): number[] {
  return Array.from(hexToBuffer(hex));
}

/**
 * Creates a Buffer from a UTF-8 string
 */
export function stringToBuffer(str: string): Buffer {
  return Buffer.from(str);
}

/**
 * Converts buffer to hex string with '0x' prefix
 */
export function bufferToHex(buffer: Buffer): Hex {
  return `0x${buffer.toString('hex')}` as Hex;
}

/**
 * Converts a hex string to a Buffer, removing the '0x' prefix if present
 */
export function arrayToHex(numbers: number[]): Hex {
  return bufferToHex(Buffer.from(numbers));
}

/**
 * Creates a buffer for a PDA seed
 */
export function createPdaSeedBuffer(seed: string): Buffer {
  return stringToBuffer(seed);
}
