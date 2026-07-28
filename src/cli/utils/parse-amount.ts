import { parseUnits } from 'viem';

import { RoutesCliError } from '@/shared/errors';

/** Converts a human-units CLI amount ("10.5") to base units using token decimals. */
export function parseAmount(raw: string, decimals: number, flag: string): bigint {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    throw RoutesCliError.configurationError(
      `Invalid ${flag} value "${raw}": must be a positive number.`
    );
  }

  // Check if input has more decimal places than token supports
  const parts = raw.split('.');
  if (parts[1] && parts[1].length > decimals) {
    throw RoutesCliError.configurationError(
      `Invalid ${flag} value "${raw}": more decimal places than the token supports (${decimals}).`
    );
  }

  try {
    return parseUnits(raw, decimals);
  } catch {
    throw RoutesCliError.configurationError(
      `Invalid ${flag} value "${raw}": more decimal places than the token supports (${decimals}).`
    );
  }
}

/** Validates a --route-token-decimals/--reward-token-decimals CLI value. */
export function parseDecimalsFlag(raw: string, flag: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 255) {
    throw RoutesCliError.configurationError(
      `Invalid ${flag} value "${raw}": must be an integer between 0 and 255.`
    );
  }
  return n;
}
