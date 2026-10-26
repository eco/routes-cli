import { Ee528TestCase } from '@/config/config.service';
import { RoutesCliError } from '@/shared/errors';

import type { QuoteRequest } from './quote.service';

export interface Ee528Case {
  caseId: Ee528TestCase;
  bridgeInventoryPercent: 50;
  sourceSwapPercent?: 50;
  destination: 'per-leg';
}

export interface Ee528Testing {
  forced: true;
  planner: 'pe';
  caseId: Ee528TestCase;
  bridgeInventoryPercent: 50;
  sourceSwapPercent?: 50;
  economicAcceptance: false;
}

const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ARB_USDT0 = '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9';
const ARB_USDC = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const POLYGON_USDC = '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359';
const POLYGON_USDT = '0xc2132d05d31c914a87c6611c10748aeb04b58e8f';
const FORCED_CORRIDORS = {
  'destination-mixture': [
    [8453n, 42161n, BASE_USDC, ARB_USDT0],
    [42161n, 137n, ARB_USDC, POLYGON_USDT],
  ],
  'source-mixture': [
    [42161n, 8453n, ARB_USDT0, BASE_USDC],
    [42161n, 137n, ARB_USDT0, POLYGON_USDC],
  ],
} as const;

export function ee528Case(caseId: Ee528TestCase): Ee528Case {
  return {
    caseId,
    bridgeInventoryPercent: 50,
    ...(caseId === 'source-mixture' ? { sourceSwapPercent: 50 as const } : {}),
    destination: 'per-leg',
  };
}

export function assertEe528Route(caseId: Ee528TestCase, params: QuoteRequest): void {
  const approved = FORCED_CORRIDORS[caseId].some(
    ([source, destination, tokenIn, tokenOut]) =>
      params.source === source &&
      params.destination === destination &&
      params.rewardToken.toLowerCase() === tokenIn &&
      params.routeToken.toLowerCase() === tokenOut
  );
  if (!approved || params.amount < 2n) {
    throw RoutesCliError.configurationError(
      `EE528 ${caseId} requires an approved Base/Arbitrum or Arbitrum/Polygon corridor and a positive 50/50 input split`
    );
  }
}

export function assertEe528Provenance(
  value: unknown,
  caseId: Ee528TestCase
): asserts value is Ee528Testing {
  if (!value || typeof value !== 'object') {
    throw new Error('EE528 quote missing forced PE provenance');
  }
  const testing = value as Record<string, unknown>;
  const expected = {
    forced: true,
    planner: 'pe',
    caseId,
    bridgeInventoryPercent: 50,
    ...(caseId === 'source-mixture' ? { sourceSwapPercent: 50 } : {}),
    economicAcceptance: false,
  };
  if (
    Object.keys(testing).length !== Object.keys(expected).length ||
    Object.entries(expected).some(([key, expectedValue]) => testing[key] !== expectedValue)
  ) {
    throw new Error(
      'EE528 quote forced PE provenance does not match the requested case and ratios'
    );
  }
}
