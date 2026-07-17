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
  /** Stable scenario identifier, e.g. SS-1. */
  id?: string;
  /** Legacy same-chain shorthand. Required unless sourceChainId is provided. */
  chainId?: number;
  /** Explicit source chain for cross-chain quote matrices. */
  sourceChainId?: number;
  /** Explicit destination chain. Defaults to chainId/sourceChainId. */
  destinationChainId?: number;
  /** Reward token the funder locks (native per-chain address). */
  inputToken: string;
  /** Route token the recipient receives (native per-chain address). */
  outputToken: string;
  /** Human-decimal amount, converted with `inputDecimals` via parseUnits. */
  amount: string;
  label: string;
  /** Decimals of `inputToken` for parseUnits. Defaults to 6 (USDC/USDG/AUSD). */
  inputDecimals?: number;
  /** Decimals of `outputToken` for delivery reporting. Defaults to 6. */
  outputDecimals?: number;
  /** Optional per-pair slippage override (bps). */
  slippageBps?: number;
  /** Route classification used in quote-matrix reports. */
  path?: 'no-swap' | 'source-swap' | 'dest-swap' | 'any-to-any';
  /**
   * Expected reward claimant (the solver-controlled address the withdrawn reward
   * MUST settle to). Overrides the top-level `expectedClaimants[chainId]`.
   * Matched case-insensitively for EVM, exact base58 for SVM.
   */
  expectedClaimant?: string;
}

export interface MatrixConfigFile {
  pairs: MatrixPairConfig[];
  /** Public, non-signing identities used only to construct quote requests. */
  quoteActors?: {
    evm: string;
    svm: string;
    tvm?: string;
  };
  /** Per-chain default expected claimant, keyed by chainId (as a string). */
  expectedClaimants?: Record<string, string>;
}

/** Terminal phase state for a pair. */
export type MatrixPhase =
  | 'PENDING'
  | 'QUOTED'
  | 'QUOTE_FAILED'
  | 'PUBLISH_FAILED'
  | 'SUBMITTED'
  | 'FULFILLED'
  | 'SOURCE_FAILED'
  | 'SOURCE_WITHDRAWN'
  | 'CHILD_PENDING'
  | 'DELIVERED_PENDING_WITHDRAWAL'
  | 'WITHDRAWAL_PENDING'
  | 'DELIVERY_MISMATCH'
  | 'SUCCEEDED'
  | 'WITHDRAWAL_MISMATCH'
  | 'TIMEOUT'
  | 'POLL_UNSUPPORTED'
  | 'POLL_ERROR';

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
  id?: string;
  label: string;
  path?: MatrixPairConfig['path'];
  chainId: number;
  destinationChainId?: number;
  destinationChainName?: string;
  chainName: string;
  chainType: string;
  inputToken: string;
  outputToken: string;
  amount: string;
  phase: MatrixPhase;
  quoteOk: boolean;
  quoteLatencyMs?: number;
  quoteHttpStatus?: number;
  quoteResponseBody?: unknown;
  quoteId?: string;
  solverId?: string;
  prover?: string;
  /** Local source-swap parent intent. Kept as intentHash for backwards compatibility. */
  intentHash?: string;
  childIntentHash?: string;
  /** Portal the intent was funded against (from the quote), for status polling. */
  sourcePortal?: string;
  publishTxHash?: string;
  submitTimeMs?: number; // epoch ms when publish confirmed
  /** Local swaps settle atomically — the fulfillment tx is the settlement tx. */
  fulfilled: boolean;
  /**
   * True once the proof precondition holds (for atomic local swaps this is
   * implied by settlement, so it tracks `withdrawn`'s precondition = fulfilled).
   */
  proven: boolean;
  /**
   * True ONLY when the settlement's on-chain withdrawal signal is present AND
   * the amount+claimant assertions pass. Never mirrors `fulfilled` blindly.
   */
  withdrawn: boolean;
  /** Source-swap parent withdrawal; intermediate only on cross-chain routes. */
  sourceWithdrawalVerified?: boolean;
  /** Exact requested destination token reached the configured recipient. */
  deliveryVerified?: boolean;
  deliveredAmount?: string;
  deliveredAmountHuman?: string;
  minimumDestinationAmount?: string;
  recipient?: string;
  /** True when the withdrawal was verified (amount + claimant checks passed). */
  withdrawalVerified: boolean;
  /** Reward amount withdrawn to the claimant, raw smallest-units, as a string. */
  withdrawnAmount?: string;
  /** Human-decimal form of `withdrawnAmount` (using inputDecimals). */
  withdrawnAmountHuman?: string;
  /** Address the withdrawn reward settled to (the solver's claimant). */
  claimant?: string;
  /** Expected claimant used for the assertion (from config), if any. */
  expectedClaimant?: string;
  sourceSettlementTxHash?: string;
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
  delivered: number;
  succeeded: number;
  /** Fulfilled swaps whose withdrawal (amount + claimant) was verified. */
  withdrawalVerified: number;
  quoteFailures: number;
  publishFailures: number;
  /** withdrawalVerified / submitted — a swap counts only if it fully settled. */
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
