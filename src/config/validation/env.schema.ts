import { z } from 'zod';

export const EnvSchema = z.object({
  EVM_PRIVATE_KEY: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
  TVM_PRIVATE_KEY: z
    .string()
    .regex(/^[a-fA-F0-9]{64}$/)
    .optional(),
  SVM_PRIVATE_KEY: z.string().min(1).optional(),

  TVM_RPC_URL: z.string().url().default('https://api.trongrid.io'),
  TVM_RPC_URL_2: z.string().url().default('https://tron.publicnode.com'),
  SVM_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SVM_RPC_URL_2: z.string().url().default('https://solana.publicnode.com'),

  // Quote source escape hatches (see ConfigService.getQuoteEndpoint for precedence).
  SOLVER_URL: z.string().url().optional(),
  QUOTES_API_URL: z.string().url().optional(),
  QUOTES_PREPROD: z.string().optional(),

  // Eco API gateway — the default quote source: host by env, optional override + key.
  ECO_ENV: z.enum(['production', 'staging']).default('production'),
  ECO_API_URL: z.string().url().optional(),
  ECO_API_KEY: z.string().min(1).optional(),

  NODE_CHAINS_ENV: z.enum(['production', 'development']).default('production'),
  DEBUG: z.string().optional(),

  DAPP_ID: z.string().default('eco-routes-cli'),
  DEADLINE_OFFSET_SECONDS: z.coerce.number().positive().default(9000),
  // Gap between the manual-fallback route deadline and reward deadline. Must be
  // at least the destination prover's proving buffer (Polymer Tron corridors run
  // 86400s) or the solver permanently rejects the intent at ExpirationValidation.
  REWARD_DEADLINE_BUFFER_SECONDS: z.coerce.number().positive().default(87000),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
