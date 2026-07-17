/**
 * Unit tests for the matrix runner's pure helpers: pair -> quote-request
 * mapping, gas math, and report aggregation.
 */

import { MatrixPairConfig, MatrixRow } from '@/matrix/matrix.types';
import {
  aggregate,
  DEFAULT_TOKEN_DECIMALS,
  evmGasCost,
  pairToQuoteRequest,
  percentile,
  resolvePairRoute,
  svmGasCost,
} from '@/matrix/matrix.util';

function baseRow(over: Partial<MatrixRow> = {}): MatrixRow {
  return {
    label: 'l',
    chainId: 8453,
    chainName: 'Base',
    chainType: 'EVM',
    inputToken: '0xin',
    outputToken: '0xout',
    amount: '0.1',
    phase: 'PENDING',
    quoteOk: false,
    fulfilled: false,
    proven: false,
    withdrawn: false,
    withdrawalVerified: false,
    ...over,
  };
}

describe('pairToQuoteRequest', () => {
  const pair: MatrixPairConfig = {
    chainId: 8453,
    inputToken: '0xInput',
    outputToken: '0xOutput',
    amount: '0.1',
    label: 'Base USDC->AUSD',
  };

  it('maps a same-chain pair to a quote request (source == destination)', () => {
    const req = pairToQuoteRequest(pair, '0xfunder', '0xrecipient');
    expect(req.source).toBe(8453n);
    expect(req.destination).toBe(8453n);
    expect(req.source).toBe(req.destination);
  });

  it('locks inputToken as reward and pays outputToken as route', () => {
    const req = pairToQuoteRequest(pair, '0xfunder', '0xrecipient');
    expect(req.rewardToken).toBe('0xInput');
    expect(req.routeToken).toBe('0xOutput');
  });

  it('converts human amount using the default 6 decimals', () => {
    const req = pairToQuoteRequest(pair, '0xf', '0xr');
    expect(req.amount).toBe(100_000n); // 0.1 * 10^6
    expect(DEFAULT_TOKEN_DECIMALS).toBe(6);
  });

  it('honors inputDecimals and slippageBps overrides', () => {
    const req = pairToQuoteRequest(
      { ...pair, inputDecimals: 18, amount: '1', slippageBps: 50 },
      '0xf',
      '0xr'
    );
    expect(req.amount).toBe(10n ** 18n);
    expect(req.slippageBps).toBe(50);
  });

  it('omits slippageBps when not provided', () => {
    const req = pairToQuoteRequest(pair, '0xf', '0xr');
    expect(req.slippageBps).toBeUndefined();
  });

  it('keeps legacy chainId pairs on the same source and destination chain', () => {
    expect(resolvePairRoute(pair)).toEqual({ sourceChainId: 8453, destinationChainId: 8453 });
  });

  it('maps explicit source and destination chains for A2A quotes', () => {
    const a2aPair: MatrixPairConfig = {
      sourceChainId: 8453,
      destinationChainId: 42161,
      inputToken: '0xInput',
      outputToken: '0xOutput',
      amount: '0.1',
      label: 'Base ETH -> Arbitrum USDC',
    };

    expect(resolvePairRoute(a2aPair)).toEqual({
      sourceChainId: 8453,
      destinationChainId: 42161,
    });
    const request = pairToQuoteRequest(a2aPair, '0xfunder', '0xrecipient');
    expect(request.source).toBe(8453n);
    expect(request.destination).toBe(42161n);
  });

  it('rejects a pair without a legacy or explicit source chain', () => {
    const invalid = {
      inputToken: '0xInput',
      outputToken: '0xOutput',
      amount: '1',
      label: 'missing source',
    } as MatrixPairConfig;

    expect(() => resolvePairRoute(invalid)).toThrow('missing sourceChainId/chainId');
  });
});

describe('gas math', () => {
  it('computes EVM gas as gasUsed * effectiveGasPrice in native units', () => {
    const g = evmGasCost(21_000n, 2_000_000_000n, 'ETH', 18);
    expect(g.raw).toBe('42000000000000'); // 21000 * 2 gwei = 4.2e13 wei
    expect(g.native).toBe('0.000042');
    expect(g.symbol).toBe('ETH');
  });

  it('computes SVM gas from lamports (9 decimals)', () => {
    const g = svmGasCost(5_000n);
    expect(g.raw).toBe('5000');
    expect(g.native).toBe('0.000005');
    expect(g.symbol).toBe('SOL');
  });
});

describe('percentile', () => {
  it('returns undefined for empty input', () => {
    expect(percentile([], 50)).toBeUndefined();
  });

  it('computes nearest-rank p50 and p95', () => {
    const vals = [10, 20, 30, 40, 50];
    expect(percentile(vals, 50)).toBe(30);
    expect(percentile(vals, 95)).toBe(50);
  });
});

describe('aggregate', () => {
  it('counts submitted/fulfilled/withdrawalVerified/failures and success rate', () => {
    const rows: MatrixRow[] = [
      baseRow({
        phase: 'FULFILLED',
        quoteOk: true,
        intentHash: '0x1',
        fulfilled: true,
        withdrawn: true,
        withdrawalVerified: true,
      }),
      // Fulfilled but withdrawal NOT verified — does NOT count toward success.
      baseRow({
        phase: 'WITHDRAWAL_MISMATCH',
        quoteOk: true,
        intentHash: '0x2',
        fulfilled: true,
      }),
      baseRow({ phase: 'QUOTE_FAILED' }),
      baseRow({ phase: 'PUBLISH_FAILED', quoteOk: true }),
    ];
    const agg = aggregate(rows);
    expect(agg.total).toBe(4);
    expect(agg.submitted).toBe(2);
    expect(agg.fulfilled).toBe(2);
    expect(agg.withdrawalVerified).toBe(1);
    expect(agg.quoteFailures).toBe(1);
    expect(agg.publishFailures).toBe(1);
    expect(agg.successRate).toBe(0.5); // 1 withdrawalVerified / 2 submitted
  });

  it('is safe with zero submitted (no divide-by-zero)', () => {
    const agg = aggregate([baseRow({ phase: 'QUOTE_FAILED' })]);
    expect(agg.successRate).toBe(0);
    expect(agg.p50TimeToFulfillSec).toBeUndefined();
  });

  it('sums and averages gas per native symbol', () => {
    const rows: MatrixRow[] = [
      baseRow({
        intentHash: '0x1',
        fulfilled: true,
        timeToFulfillSec: 10,
        gasCost: { raw: '42000000000000', native: '0.000042', symbol: 'ETH' },
      }),
      baseRow({
        intentHash: '0x2',
        fulfilled: true,
        timeToFulfillSec: 30,
        gasCost: { raw: '42000000000000', native: '0.000042', symbol: 'ETH' },
      }),
      baseRow({
        chainType: 'SVM',
        intentHash: '0x3',
        fulfilled: true,
        timeToFulfillSec: 20,
        gasCost: { raw: '5000', native: '0.000005', symbol: 'SOL' },
      }),
    ];
    const agg = aggregate(rows);
    expect(agg.totalGasBySymbol.ETH).toBe('0.000084');
    expect(agg.avgGasBySymbol.ETH).toBe('0.000042');
    expect(agg.totalGasBySymbol.SOL).toBe('0.000005');
    expect(agg.p50TimeToFulfillSec).toBe(20);
  });
});
