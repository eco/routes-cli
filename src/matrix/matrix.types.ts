/**
 * Types for the config-driven same-chain (local) swap matrix runner.
 *
 * A "pair" is one same-chain swap to exercise: the funder locks `inputToken`
 * as the reward on `chainId`, and the recipient receives `outputToken` on the
 * same chain (source == destination == chainId). Local swaps settle
 * fulfill+prove+withdraw atomically in a single tx, so the fulfillment tx IS
 * the settlement.
 */

/** One configured same-chain swap. `amount` is a HUMAN-decimal string, e.g. "0.1". */
export interface MatrixPairConfig {
  chainId: number;
  /** Reward token the funder locks (native per-chain address). */
  inputToken: string;
  /** Route token the recipient receives (native per-chain address). */
  outputToken: string;
  /** Human-decimal amount, converted with `inputDecimals` via parseUnits. */
  amount: string;
  label: string;
  /** Decimals of `inputToken` for parseUnits. Defaults to 6 (USDC/USDG/AUSD). */
  inputDecimals?: number;
  /** Optional per-pair slippage override (bps). */
  slippageBps?: number;
}

export interface MatrixConfigFile {
  pairs: MatrixPairConfig[];
}

/** Terminal phase state for a pair. */
export type MatrixPhase =
  | 'PENDING'
  | 'QUOTE_FAILED'
  | 'PUBLISH_FAILED'
  | 'SUBMITTED'
  | 'FULFILLED'
  | 'TIMEOUT'
  | 'POLL_UNSUPPORTED';

export interface GasCost {
  /** Native token amount spent on the settlement tx (e.g. ETH, SOL), as a decimal string. */
  native?: string;
  /** Native currency symbol (ETH, SOL, ...). */
  symbol?: string;
  /** Raw smallest-unit cost (wei / lamports) as a string. */
  raw?: string;
  /** Reason gas could not be fetched (never fails the row). */
  unavailable?: string;
}

export interface MatrixRow {
  label: string;
  chainId: number;
  chainName: string;
  chainType: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  phase: MatrixPhase;
  quoteOk: boolean;
  intentHash?: string;
  publishTxHash?: string;
  submitTimeMs?: number; // epoch ms when publish confirmed
  /** Local swaps settle atomically — the fulfillment tx is the settlement tx. */
  fulfilled: boolean;
  /** Mirrors `fulfilled`: a local swap that is fulfilled is also proven+withdrawn (atomic). */
  proven: boolean;
  withdrawn: boolean;
  fulfillmentTxHash?: string;
  fulfillmentBlock?: string;
  fulfillmentTimestamp?: number;
  timeToFulfillSec?: number;
  gasCost?: GasCost;
  error?: string;
}

export interface MatrixAggregate {
  total: number;
  submitted: number;
  fulfilled: number;
  quoteFailures: number;
  publishFailures: number;
  /** fulfilled / submitted. */
  successRate: number;
  p50TimeToFulfillSec?: number;
  p95TimeToFulfillSec?: number;
  /** Sum of native gas across rows that reported a numeric gas cost, per symbol. */
  totalGasBySymbol: Record<string, string>;
  avgGasBySymbol: Record<string, string>;
}

export interface MatrixReport {
  runId: string;
  configPath: string;
  timeoutSec: number;
  startedAt: string;
  updatedAt: string;
  rows: MatrixRow[];
  aggregate: MatrixAggregate;
}
