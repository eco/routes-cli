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

export function ee528Case(caseId: Ee528TestCase): Ee528Case {
  return {
    caseId,
    bridgeInventoryPercent: 50,
    ...(caseId === 'source-mixture' ? { sourceSwapPercent: 50 as const } : {}),
    destination: 'per-leg',
  };
}

export function assertEe528Route(caseId: Ee528TestCase, params: QuoteRequest): void {
  const destinationMixture = caseId === 'destination-mixture';
  if (
    params.source !== (destinationMixture ? 8453n : 42161n) ||
    params.destination !== (destinationMixture ? 42161n : 8453n) ||
    params.rewardToken.toLowerCase() !== (destinationMixture ? BASE_USDC : ARB_USDT0) ||
    params.routeToken.toLowerCase() !== (destinationMixture ? ARB_USDT0 : BASE_USDC) ||
    params.amount < 2n
  ) {
    throw RoutesCliError.configurationError(
      `EE528 ${caseId} requires ${destinationMixture ? 'Base USDC -> Arbitrum USDT0' : 'Arbitrum USDT0 -> Base USDC'} and a positive 50/50 input split`
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
