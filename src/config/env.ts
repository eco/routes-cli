/**
 * Environment Configuration
 */

import * as dotenv from 'dotenv';
import { Hex } from 'viem';
import { z } from 'zod';

import { RoutesCliError } from '@/core/errors';

// Load environment variables
dotenv.config();

export interface EnvConfig {
  evmPrivateKey?: Hex;
  tvmPrivateKey?: string;
  svmPrivateKey?: string;
  evmRpcUrl?: string;
  tvmRpcUrl?: string;
  svmRpcUrl?: string;
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
