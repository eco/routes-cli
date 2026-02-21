import { z } from 'zod';

export const EvmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/, {
  message: 'EVM address must be 0x followed by 40 hex characters',
});

export const UniversalAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, {
  message: 'Universal address must be 0x followed by 64 hex characters',
});

// Accepts base58 (T...) or Tron hex (0x41... or 41...) format
export const TvmAddressSchema = z.union([
  z.string().regex(/^T[A-Za-z0-9]{33}$/, {
    message: 'Tron base58 address must start with T and be 34 characters',
  }),
  z.string().regex(/^(0x)?41[a-fA-F0-9]{40}$/, {
    message: 'Tron hex address must start with 41 or 0x41 followed by 40 hex characters',
  }),
]);

// Solana base58 public key: 32–44 base58 characters
export const SvmAddressSchema = z
  .string()
  .min(32, { message: 'Solana address must be at least 32 characters' })
  .max(44, { message: 'Solana address must be at most 44 characters' })
  .regex(/^[1-9A-HJ-NP-Za-km-z]+$/, {
    message: 'Solana address must be base58 encoded',
  });

export const EvmPrivateKeySchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/, {
  message: 'EVM private key must be 0x followed by 64 hex characters',
});

export const TvmPrivateKeySchema = z.string().regex(/^[a-fA-F0-9]{64}$/, {
  message: 'TVM private key must be 64 hex characters (no 0x prefix)',
});

export const TokenAmountSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, { message: 'Amount must be a positive number (e.g. "10" or "0.5")' })
  .refine(v => parseFloat(v) > 0, { message: 'Amount must be greater than zero' });

export const ChainIdSchema = z.bigint().positive({ message: 'Chain ID must be a positive bigint' });
