/**
 * RPC Provider with fallback and retry support.
 *
 * Provides a `withFallback` utility that tries a list of RPC endpoints in
 * sequence, retrying each with exponential backoff before moving to the next.
 */

import { logger } from '@/utils/logger';

/** Maximum number of attempts per RPC endpoint before trying the next one. */
const MAX_ATTEMPTS = 3;

/** Base delay in milliseconds for exponential backoff (doubles on each retry). */
const BASE_DELAY_MS = 500;

/**
 * Returns a Promise that resolves after `ms` milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

/**
 * Tries a list of RPC endpoints in order, retrying each with exponential
 * backoff before falling back to the next endpoint.
 *
 * Each endpoint is attempted up to {@link MAX_ATTEMPTS} times. Between retries
 * on the same endpoint the delay is `BASE_DELAY_MS * 2^attempt` milliseconds.
 * If all endpoints and all retries are exhausted, the last error is re-thrown.
 *
 * @param endpoints - Ordered list of RPC URLs to try (primary first, fallbacks after).
 * @param fn        - Async operation that receives the active RPC URL and returns a result.
 * @returns         - The result from the first successful attempt.
 * @throws          - The last error encountered when every endpoint and every retry fails.
 *
 * @example
 * ```typescript
 * const balance = await withFallback(
 *   [primaryRpcUrl, fallbackRpcUrl],
 *   (rpcUrl) => fetchBalance(rpcUrl, address)
 * );
 * ```
 */
export async function withFallback<T>(
  endpoints: string[],
  fn: (rpcUrl: string) => Promise<T>
): Promise<T> {
  if (endpoints.length === 0) {
    throw new Error('withFallback: at least one endpoint is required');
  }

  let lastError: unknown;

  for (const endpoint of endpoints) {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      try {
        const result = await fn(endpoint);
        logger.log(`[RPC] Connected via ${endpoint}`);
        return result;
      } catch (error: unknown) {
        lastError = error;
        if (attempt < MAX_ATTEMPTS - 1) {
          const delayMs = BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delayMs);
        }
      }
    }
  }

  throw lastError;
}
