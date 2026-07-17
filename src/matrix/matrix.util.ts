/**
 * Pure helpers for the matrix runner: pair -> quote-request mapping, gas math,
 * and report aggregation. Kept dependency-light so they can be unit-tested
 * without a Nest context.
 */

import { formatUnits, parseUnits } from 'viem';

import { QuoteRequest } from '@/quote/quote.service';

import { GasCost, MatrixAggregate, MatrixPairConfig, MatrixRow } from './matrix.types';

/** Default token decimals when a pair omits `inputDecimals` (USDC/USDG/AUSD are 6). */
export const DEFAULT_TOKEN_DECIMALS = 6;

/** Resolve legacy same-chain pairs and explicit cross-chain pairs to one route shape. */
export function resolvePairRoute(pair: MatrixPairConfig): {
  sourceChainId: number;
  destinationChainId: number;
} {
  const sourceChainId = pair.sourceChainId ?? pair.chainId;
  if (sourceChainId === undefined) {
    throw new Error(`${pair.label}: missing sourceChainId/chainId`);
  }
  return {
    sourceChainId,
    destinationChainId: pair.destinationChainId ?? pair.chainId ?? sourceChainId,
  };
}

/**
 * Map a same-chain pair to a QuoteService request. Source == destination ==
 * chainId; the funder locks `inputToken` (reward) and the recipient receives
 * `outputToken` (route). `funder` and `recipient` are the solver-controlled
 * addresses derived from the funder key on this chain.
 */
export function pairToQuoteRequest(
  pair: MatrixPairConfig,
  funder: string,
  recipient: string
): QuoteRequest {
  const decimals = pair.inputDecimals ?? DEFAULT_TOKEN_DECIMALS;
  const { sourceChainId, destinationChainId } = resolvePairRoute(pair);
  return {
    source: BigInt(sourceChainId),
    destination: BigInt(destinationChainId),
    amount: parseUnits(pair.amount, decimals),
    funder,
    recipient,
    routeToken: pair.outputToken,
    rewardToken: pair.inputToken,
    ...(pair.slippageBps !== undefined && { slippageBps: pair.slippageBps }),
  };
}

/** EVM gas cost from a receipt: gasUsed * effectiveGasPrice (wei), formatted to native. */
export function evmGasCost(
  gasUsed: bigint,
  effectiveGasPrice: bigint,
  symbol: string,
  nativeDecimals = 18
): GasCost {
  const raw = gasUsed * effectiveGasPrice;
  return { native: formatUnits(raw, nativeDecimals), symbol, raw: raw.toString() };
}

/** SVM gas cost from a tx meta.fee (lamports). SOL has 9 decimals. */
export function svmGasCost(feeLamports: bigint, symbol = 'SOL'): GasCost {
  return { native: formatUnits(feeLamports, 9), symbol, raw: feeLamports.toString() };
}

/** Minimal shape of a token-balance entry from a Solana tx meta (pre/post). */
export interface SvmTokenBalanceEntry {
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
}

/** A per-owner raw (smallest-unit) balance delta for a single reward mint. */
export interface OwnerDelta {
  owner: string;
  delta: bigint;
}

/**
 * Compute per-owner raw deltas for a single `mint` from a Solana tx's pre/post
 * token-balance arrays. Uses `uiTokenAmount.amount` (raw smallest units) — NOT
 * the float `uiAmount` — so the equality check against `parseUnits` is exact.
 */
export function computeOwnerDeltas(
  mint: string,
  pre: SvmTokenBalanceEntry[],
  post: SvmTokenBalanceEntry[]
): OwnerDelta[] {
  const totals = new Map<string, bigint>();
  const bump = (owner: string | undefined, amount: bigint): void => {
    if (!owner) return;
    totals.set(owner, (totals.get(owner) ?? 0n) + amount);
  };
  for (const e of pre) {
    if (e.mint === mint) bump(e.owner, -BigInt(e.uiTokenAmount.amount));
  }
  for (const e of post) {
    if (e.mint === mint) bump(e.owner, BigInt(e.uiTokenAmount.amount));
  }
  return [...totals.entries()].map(([owner, delta]) => ({ owner, delta }));
}

/**
 * From per-owner deltas of the reward mint, pick the claimant: the owner with a
 * POSITIVE delta that is NOT the intent vault PDA. Returns the claimant address
 * and the raw amount credited to it. `null` if none qualifies (no settlement).
 */
export function pickSvmClaimant(
  deltas: OwnerDelta[],
  vaultOwner: string
): { claimant: string; withdrawnAmount: bigint } | null {
  const candidates = deltas.filter(d => d.delta > 0n && d.owner !== vaultOwner);
  if (candidates.length === 0) return null;
  // The reward settles to a single claimant; if multiple positive owners exist
  // (e.g. an ATA rent payer), the largest positive delta is the reward credit.
  const winner = candidates.reduce((a, b) => (b.delta > a.delta ? b : a));
  return { claimant: winner.owner, withdrawnAmount: winner.delta };
}

/** Outcome of the always-on withdrawal verification for one fulfilled swap. */
export interface WithdrawalCheck {
  ok: boolean;
  /** Terminal phase to set when `ok` is false. */
  failPhase?: 'WITHDRAWAL_MISMATCH';
  error?: string;
}

/**
 * Assert the withdrawn reward matches expectations. ALWAYS enforced:
 *  1. `withdrawnAmount` (raw) === `expectedAmount` (raw), else mismatch.
 *  2. claimant !== funder (a reward returning to the funder is no real settlement).
 *  3. when `expectedClaimant` is set, the claimant MUST match it
 *     (case-insensitive for EVM, exact for SVM).
 */
export function assertWithdrawal(params: {
  chainType: string;
  withdrawnAmount: bigint;
  expectedAmount: bigint;
  claimant: string;
  funder: string;
  expectedClaimant?: string;
}): WithdrawalCheck {
  const { chainType, withdrawnAmount, expectedAmount, claimant, funder, expectedClaimant } = params;
  const eq = (a: string, b: string): boolean =>
    chainType === 'EVM' ? a.toLowerCase() === b.toLowerCase() : a === b;

  if (withdrawnAmount !== expectedAmount) {
    return {
      ok: false,
      failPhase: 'WITHDRAWAL_MISMATCH',
      error: `withdrawn amount ${withdrawnAmount} != expected reward ${expectedAmount}`,
    };
  }
  if (eq(claimant, funder)) {
    return {
      ok: false,
      failPhase: 'WITHDRAWAL_MISMATCH',
      error: `claimant ${claimant} equals funder — reward returned to funder, no settlement`,
    };
  }
  if (expectedClaimant && !eq(claimant, expectedClaimant)) {
    return {
      ok: false,
      failPhase: 'WITHDRAWAL_MISMATCH',
      error: `claimant ${claimant} != expectedClaimant ${expectedClaimant}`,
    };
  }
  return { ok: true };
}

/** Percentile (nearest-rank) of a numeric sample. Returns undefined for empty input. */
export function percentile(values: number[], p: number): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[idx];
}

/** Build the aggregate section from the current rows (safe to call after each write). */
export function aggregate(rows: MatrixRow[]): MatrixAggregate {
  const submitted = rows.filter(r => r.intentHash).length;
  const fulfilled = rows.filter(r => r.fulfilled).length;
  const withdrawalVerified = rows.filter(r => r.withdrawalVerified).length;
  const quoteFailures = rows.filter(r => r.phase === 'QUOTE_FAILED').length;
  const publishFailures = rows.filter(r => r.phase === 'PUBLISH_FAILED').length;

  const times = rows.map(r => r.timeToFulfillSec).filter((t): t is number => typeof t === 'number');

  const totalRaw: Record<string, bigint> = {};
  const countBySymbol: Record<string, number> = {};
  for (const r of rows) {
    const g = r.gasCost;
    if (g?.raw && g.symbol) {
      totalRaw[g.symbol] = (totalRaw[g.symbol] ?? 0n) + BigInt(g.raw);
      countBySymbol[g.symbol] = (countBySymbol[g.symbol] ?? 0) + 1;
    }
  }

  const totalGasBySymbol: Record<string, string> = {};
  const avgGasBySymbol: Record<string, string> = {};
  for (const [symbol, raw] of Object.entries(totalRaw)) {
    const decimals = symbol === 'SOL' ? 9 : 18;
    totalGasBySymbol[symbol] = formatUnits(raw, decimals);
    const count = countBySymbol[symbol] || 1;
    avgGasBySymbol[symbol] = formatUnits(raw / BigInt(count), decimals);
  }

  return {
    total: rows.length,
    submitted,
    fulfilled,
    withdrawalVerified,
    quoteFailures,
    publishFailures,
    // A swap is a success only if it fulfilled AND the reward settled to the
    // expected claimant in the exact amount (withdrawalVerified).
    successRate: submitted === 0 ? 0 : withdrawalVerified / submitted,
    p50TimeToFulfillSec: percentile(times, 50),
    p95TimeToFulfillSec: percentile(times, 95),
    totalGasBySymbol,
    avgGasBySymbol,
  };
}
