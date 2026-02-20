/**
 * Environment Configuration
 */

import * as dotenv from 'dotenv';
import { Hex } from 'viem';
import { z } from 'zod';

import { RoutesCliError } from '@/core/errors';

// Load environment variables
dotenv.config();

/**
 * Runtime environment configuration loaded from `process.env` (and `.env` via dotenv).
 *
 * All private-key fields are optional at the interface level; at runtime, publishing
 * to a given chain type requires the corresponding key to be set.
 */
export interface EnvConfig {
  /** EVM private key (`0x` + 64 hex chars). Required for EVM chain publishing. */
  evmPrivateKey?: Hex;
  /** Tron private key (64 hex chars, no `0x` prefix). Required for TVM publishing. */
  tvmPrivateKey?: string;
  /**
   * Solana private key in one of three accepted formats:
   * - Base58 string (default Phantom/Solana export format)
   * - JSON byte array: `[1,2,3,...]`
   * - Comma-separated bytes: `1,2,3,...`
   *
   * Required for SVM publishing.
   */
  svmPrivateKey?: string;
  /** Optional EVM RPC URL override. Falls back to the chain's default when omitted. */
  evmRpcUrl?: string;
  /** TVM RPC URL. Defaults to `https://api.trongrid.io` when `TVM_RPC_URL` is not set. */
  tvmRpcUrl?: string;
  /** SVM RPC URL. Defaults to `https://api.mainnet-beta.solana.com` when `SVM_RPC_URL` is not set. */
  svmRpcUrl?: string;
  /** Optional solver URL for route quote resolution (`SOLVER_URL` env var). */
  solverUrl?: string;
}

const EnvSchema = z.object({
  EVM_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, {
      message: 'EVM_PRIVATE_KEY must be 0x followed by 64 hex characters (e.g. 0xabc...def)',
    })
    .optional(),
  TVM_PRIVATE_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/, {
      message: 'TVM_PRIVATE_KEY must be 64 hex characters without 0x prefix',
    })
    .optional(),
  // SVM key can be base58, byte array [1,2,...] or comma-separated — just verify non-empty
  SVM_PRIVATE_KEY: z.string().min(1, { message: 'SVM_PRIVATE_KEY must not be empty' }).optional(),
  EVM_RPC_URL: z.string().url({ message: 'EVM_RPC_URL must be a valid URL' }).optional(),
  TVM_RPC_URL: z.string().url({ message: 'TVM_RPC_URL must be a valid URL' }).optional(),
  SVM_RPC_URL: z.string().url({ message: 'SVM_RPC_URL must be a valid URL' }).optional(),
  SOLVER_URL: z.string().url({ message: 'SOLVER_URL must be a valid URL' }).optional(),
});

/**
 * Loads and validates environment configuration from `process.env` and `.env`.
 *
 * Uses a zod schema to validate every variable before returning the typed config.
 * Provides sensible defaults for optional RPC URLs (`tvmRpcUrl`, `svmRpcUrl`).
 *
 * @returns A fully validated {@link EnvConfig} object.
 * @throws {@link RoutesCliError} with code `CONFIGURATION_ERROR` when any variable
 *   fails validation — the error message names the offending variable and
 *   the expected format so the user can correct their `.env` file.
 *
 * @example
 * ```ts
 * const env = loadEnvConfig();
 * // env.tvmRpcUrl === 'https://api.trongrid.io' (default)
 * ```
 */
export function loadEnvConfig(): EnvConfig {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    const messages = result.error.issues
      .map(issue => `  ${String(issue.path[0])}: ${issue.message}`)
      .join('\n');
    throw RoutesCliError.configurationError(
      `Invalid environment configuration:\n${messages}\n\nCheck your .env file or environment variables.`
    );
  }

  const env = result.data;
  return {
    evmPrivateKey: env.EVM_PRIVATE_KEY as Hex | undefined,
    tvmPrivateKey: env.TVM_PRIVATE_KEY,
    svmPrivateKey: env.SVM_PRIVATE_KEY,
    evmRpcUrl: env.EVM_RPC_URL,
    tvmRpcUrl: env.TVM_RPC_URL || 'https://api.trongrid.io',
    svmRpcUrl: env.SVM_RPC_URL || 'https://api.mainnet-beta.solana.com',
    solverUrl: env.SOLVER_URL,
  };
}
