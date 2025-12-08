/**
 * Sentinel Config Loader
 */

import * as fs from 'fs';
import * as path from 'path';

import * as yaml from 'js-yaml';
import { z } from 'zod';

import { SentinelConfig } from './types';

// Wallet schemas
const evmWalletsSchema = z.object({
  basic: z.object({
    type: z.literal('basic'),
    privateKey: z.string(),
  }),
});

const svmWalletsSchema = z.object({
  basic: z.object({
    type: z.literal('basic'),
    secretKey: z.string(),
  }),
});

const configSchema = z.object({
  service: z.object({
    name: z.string().default('sentinel'),
    environment: z.enum(['development', 'staging', 'production']).default('development'),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),
  chains: z.array(z.string()).min(1),
  tokens: z
    .array(
      z.object({
        symbol: z.string(),
        amount: z.string(),
      })
    )
    .min(1),
  routes: z.object({
    mode: z.enum(['all', 'explicit']).default('all'),
    exclude: z
      .array(
        z.object({
          source: z.string(),
          destination: z.string(),
        })
      )
      .optional(),
  }),
  scheduler: z.object({
    strategy: z.literal('periodic'),
    intervalMs: z.number().positive().default(60000),
  }),
  execution: z.object({
    parallelism: z.number().positive().default(1),
    timeoutMs: z.number().positive().default(300000),
    dryRun: z.boolean().default(false),
    retries: z.object({
      maxAttempts: z.number().nonnegative().default(2),
      backoffMs: z.number().nonnegative().default(5000),
    }),
  }),
  health: z.object({
    degradedAfterFailures: z.number().positive().default(2),
    failedAfterFailures: z.number().positive().default(5),
    healthyAfterSuccesses: z.number().positive().default(3),
    maxFulfillmentTimeMs: z.number().positive().default(180000),
  }),
  reporting: z.object({
    console: z.object({
      enabled: z.boolean().default(true),
      verbose: z.boolean().default(false),
      summaryIntervalMs: z.number().positive().default(300000),
    }),
  }),
  evm: z
    .object({
      wallets: evmWalletsSchema,
    })
    .optional(),
  svm: z
    .object({
      wallets: svmWalletsSchema,
    })
    .optional(),
});

export function loadConfig(configPath?: string): SentinelConfig {
  // Default config paths to try
  const paths = configPath
    ? [configPath]
    : [
        './sentinel.config.yaml',
        './sentinel.config.yml',
        './config/sentinel.config.yaml',
        path.join(__dirname, '../../sentinel.config.yaml'),
      ];

  let configFile: string | undefined;
  for (const p of paths) {
    if (fs.existsSync(p)) {
      configFile = p;
      break;
    }
  }

  if (!configFile) {
    throw new Error(`Config file not found. Tried: ${paths.join(', ')}`);
  }

  const rawConfig = yaml.load(fs.readFileSync(configFile, 'utf8'));
  const parsed = configSchema.parse(rawConfig);

  return parsed as SentinelConfig;
}
