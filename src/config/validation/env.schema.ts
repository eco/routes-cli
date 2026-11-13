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

  EVM_RPC_URL: z.string().url().optional(),
  EVM_RPC_URL_2: z.string().url().optional(),
  TVM_RPC_URL: z.string().url().optional(),
  TVM_RPC_URL_2: z.string().url().optional(),
  SVM_RPC_URL: z.string().url().optional(),
  SVM_RPC_URL_2: z.string().url().optional(),

  // Quote source escape hatches (see ConfigService.getQuoteEndpoint for precedence).
  SOLVER_URL: z.string().url().optional(),
  // An eco-quotes host (https://quotes.eco.com or https://quotes.stag.eco.com); the CLI
  // calls the keyless {host}/v4/quotes endpoint. Quote-service v3 URLs (/api/v3/...)
  // retire on 2026-12-01 and are rejected at configuration time.
  QUOTES_API_URL: z.string().url().optional(),
  QUOTES_PREPROD: z.undefined({
    error:
      'QUOTES_PREPROD was removed: the preprod quote service no longer exists. Use ' +
      'ECO_ENV=staging, or QUOTES_API_URL=https://quotes.stag.eco.com for keyless quotes v4.',
  }),

  // Eco API gateway — the default quote source: host by env, optional override + key.
  ECO_ENV: z.enum(['production', 'staging']).default('production'),
  ECO_API_URL: z.string().url().optional(),
  // Keys are per gateway environment: ECO_API_KEY_<ENV> wins, ECO_API_KEY is the fallback.
  // The gateway requires a key on production and staging (keyless calls get a 403);
  // QUOTES_API_URL=<eco-quotes host> is the keyless path.
  ECO_API_KEY: z.string().min(1).optional(),
  ECO_API_KEY_PRODUCTION: z.string().min(1).optional(),
  ECO_API_KEY_STAGING: z.string().min(1).optional(),

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
