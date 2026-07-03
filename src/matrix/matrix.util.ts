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
  const chainId = BigInt(pair.chainId);
  return {
    source: chainId,
    destination: chainId, // same-chain (local) swap
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
    quoteFailures,
    publishFailures,
    successRate: submitted === 0 ? 0 : fulfilled / submitted,
    p50TimeToFulfillSec: percentile(times, 50),
    p95TimeToFulfillSec: percentile(times, 95),
    totalGasBySymbol,
    avgGasBySymbol,
  };
}
