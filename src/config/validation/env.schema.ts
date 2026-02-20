import { z } from 'zod';

export const EnvSchema = z.object({
  EVM_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  TVM_PRIVATE_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  SVM_PRIVATE_KEY: z.string().min(1).optional(),

  EVM_RPC_URL: z.string().url().optional(),
  TVM_RPC_URL: z.string().url().default('https://api.trongrid.io'),
  TVM_RPC_URL_2: z.string().url().default('https://tron.publicnode.com'),
  SVM_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SVM_RPC_URL_2: z.string().url().default('https://solana.publicnode.com'),

  SOLVER_URL: z.string().url().optional(),
  QUOTES_API_URL: z.string().optional(),
  QUOTES_PREPROD: z.string().optional(),

  NODE_CHAINS_ENV: z.enum(['production', 'development']).default('production'),
  DEBUG: z.string().optional(),

  DAPP_ID: z.string().default('eco-routes-cli'),
  DEADLINE_OFFSET_SECONDS: z.coerce.number().positive().default(9000),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
