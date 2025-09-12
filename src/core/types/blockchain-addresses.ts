/**
 * Blockchain-specific address types
 * Imported from the solver for type safety
 */

import { Address } from 'viem';

// EVM Address type (from viem)
export type EvmAddress = Address;

// Tron address in base58 format (starts with 'T')
export type TronAddress = `T${string}`;

// Solana address (base58 public key)
export type SolanaAddress = string;

export type SvmAddress = `${string}` & { readonly _brand: 'SvmAddress' };

// Union type for all blockchain addresses
export type BlockchainAddress = EvmAddress | TronAddress | SvmAddress;
