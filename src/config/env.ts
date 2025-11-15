/**
 * Environment Configuration
 */

import * as dotenv from 'dotenv';
import { Hex } from 'viem';

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

export function loadEnvConfig(): EnvConfig {
  return {
    evmPrivateKey: process.env.EVM_PRIVATE_KEY as Hex | undefined,
    tvmPrivateKey: process.env.TVM_PRIVATE_KEY,
    svmPrivateKey: process.env.SVM_PRIVATE_KEY,
    evmRpcUrl: process.env.EVM_RPC_URL,
    tvmRpcUrl: process.env.TVM_RPC_URL || 'https://api.trongrid.io',
    svmRpcUrl: process.env.SVM_RPC_URL || 'https://api.mainnet-beta.solana.com',
    solverUrl: process.env.SOLVER_URL,
  };
}
