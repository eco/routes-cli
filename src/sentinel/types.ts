/**
 * Sentinel Types
 */

// Wallet types - basic only for now
export interface BasicWallet {
  type: 'basic';
  privateKey: string;
}

export interface EvmWallets {
  basic: BasicWallet;
}

export interface SvmWallets {
  basic: {
    type: 'basic';
    secretKey: string;
  };
}

export interface SentinelConfig {
  service: {
    name: string;
    environment: 'development' | 'staging' | 'production';
    logLevel: 'debug' | 'info' | 'warn' | 'error';
  };
  chains: string[];
  tokens: Array<{
    symbol: string;
    amount: string;
  }>;
  routes: {
    mode: 'all' | 'explicit';
    exclude?: Array<{
      source: string;
      destination: string;
    }>;
  };
  scheduler: {
    strategy: 'periodic';
    intervalMs: number;
  };
  execution: {
    parallelism: number;
    timeoutMs: number;
    dryRun: boolean;
    retries: {
      maxAttempts: number;
      backoffMs: number;
    };
  };
  health: {
    degradedAfterFailures: number;
    failedAfterFailures: number;
    healthyAfterSuccesses: number;
    maxFulfillmentTimeMs: number;
  };
  reporting: {
    console: {
      enabled: boolean;
      verbose: boolean;
      summaryIntervalMs: number;
    };
  };
  evm?: {
    wallets: EvmWallets;
  };
  svm?: {
    wallets: SvmWallets;
  };
}

export type RouteStatus = 'healthy' | 'degraded' | 'failed' | 'unknown';

export interface RouteHealth {
  source: string;
  destination: string;
  token: string;
  status: RouteStatus;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastCheck?: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
  lastError?: string;
  avgFulfillTimeMs?: number;
  totalTests: number;
  totalSuccesses: number;
  totalFailures: number;
}

export interface TestResult {
  source: string;
  destination: string;
  token: string;
  success: boolean;
  intentHash?: string;
  txHash?: string;
  publishTimeMs: number;
  fulfillTimeMs?: number;
  error?: string;
  timestamp: Date;
}
