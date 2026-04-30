/* eslint-disable @typescript-eslint/explicit-function-return-type */
import {
  applyAmountOverrides,
  filterScenarios,
  Scenario,
  SCENARIOS,
} from '@/scripts/source-swap-matrix/lib/scenarios';

describe('scenarios fixture', () => {
  it('contains exactly 8 rows in matrix order SS-1..SS-8', () => {
    expect(SCENARIOS).toHaveLength(8);
    expect(SCENARIOS.map(s => s.id)).toEqual([
      'SS-1',
      'SS-2',
      'SS-3',
      'SS-4',
      'SS-5',
      'SS-6',
      'SS-7',
      'SS-8',
    ]);
  });

  it('marks scenarios with correct srcVm / dstVm pairing', () => {
    const byId = (id: string): Scenario => SCENARIOS.find(s => s.id === id)!;
    expect(byId('SS-1').srcVm).toBe('evm');
    expect(byId('SS-1').dstVm).toBe('evm');
    expect(byId('SS-2').dstVm).toBe('svm');
    expect(byId('SS-7').srcVm).toBe('svm');
    expect(byId('SS-8').srcVm).toBe('svm');
  });

  it('uses the documented Solana chain id for any solana-side row', () => {
    for (const s of SCENARIOS) {
      if (s.srcVm === 'svm') expect(s.srcChain).toBe(1399811149);
      if (s.dstVm === 'svm') expect(s.dstChain).toBe(1399811149);
    }
  });

  it('encodes ~$1 test default amounts (ETH, USDC, SOL)', () => {
    const byId = (id: string) => SCENARIOS.find(s => s.id === id)!;
    expect(byId('SS-1').defaultAmount).toBe(300_000_000_000_000n); // 0.0003 ETH
    expect(byId('SS-3').defaultAmount).toBe(1_000_000n); // 1 USDC
    expect(byId('SS-7').defaultAmount).toBe(12_000_000n); // 0.012 SOL
  });
});

describe('filterScenarios', () => {
  it('keeps the entire list when no filters are set', () => {
    expect(filterScenarios(SCENARIOS, {}).map(s => s.id)).toEqual(SCENARIOS.map(s => s.id));
  });

  it('include narrows to the listed ids in matrix order', () => {
    const out = filterScenarios(SCENARIOS, { include: ['SS-3', 'SS-1'] });
    expect(out.map(s => s.id)).toEqual(['SS-1', 'SS-3']);
  });

  it('exclude removes the listed ids', () => {
    const out = filterScenarios(SCENARIOS, { exclude: ['SS-7', 'SS-8'] });
    expect(out.map(s => s.id)).toEqual(['SS-1', 'SS-2', 'SS-3', 'SS-4', 'SS-5', 'SS-6']);
  });

  it('throws on unknown ids in either filter', () => {
    expect(() => filterScenarios(SCENARIOS, { include: ['SS-99'] })).toThrow(
      /unknown scenario id/i
    );
    expect(() => filterScenarios(SCENARIOS, { exclude: ['SS-99'] })).toThrow(
      /unknown scenario id/i
    );
  });
});

describe('applyAmountOverrides', () => {
  it('returns scenarios unchanged when no overrides provided', () => {
    const out = applyAmountOverrides(SCENARIOS.slice(0, 2), {});
    expect(out[0].defaultAmount).toBe(SCENARIOS[0].defaultAmount);
  });

  it('replaces the default amount for the given id', () => {
    const out = applyAmountOverrides(SCENARIOS.slice(0, 2), { 'SS-1': 1n });
    expect(out[0].defaultAmount).toBe(1n);
    expect(out[1].defaultAmount).toBe(SCENARIOS[1].defaultAmount);
  });

  it('throws on unknown id in overrides', () => {
    expect(() => applyAmountOverrides(SCENARIOS, { 'SS-99': 1n })).toThrow(/unknown scenario id/i);
  });
});
