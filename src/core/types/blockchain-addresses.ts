/**
 * Blockchain-specific address types
 * Imported from the solver for type safety
 */

import { Address } from 'viem';

// EVM Address type (from viem)
export type EvmAddress = Address;

// Tron address in base58 format (starts with 'T')
export type TronAddress = `T${string}` & { readonly _brand: 'TronAddress' };

// Solana address (base58 public key)
export type SolanaAddress = string;

// Union type for all blockchain addresses
export type BlockchainAddress = EvmAddress | TronAddress | SolanaAddress;
