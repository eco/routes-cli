import { renderFinalSummary, renderLiveText } from '@/scripts/source-swap-matrix/lib/render';
import { SCENARIOS } from '@/scripts/source-swap-matrix/lib/scenarios';
import type { ScenarioResult } from '@/scripts/source-swap-matrix/lib/types';

function newResult(id: string, partial: Partial<ScenarioResult> = {}): ScenarioResult {
  return { id, status: 'pending', stage: 'pending', ...partial };
}

describe('renderLiveText', () => {
  it('renders one line per scenario plus a progress bar', () => {
    const results = new Map<string, ScenarioResult>(SCENARIOS.map(s => [s.id, newResult(s.id)]));
    const out = renderLiveText({
      scenarios: SCENARIOS.slice(),
      results,
      startedAtMs: 1000,
      nowMs: 5000,
    });
    expect(out).toContain('Source-Swap Execute Matrix');
    expect(out).toContain('SS-1');
    expect(out).toContain('SS-8');
    expect(out).toContain('0/8 done');
    expect(out).toContain('elapsed');
  });

  it('shows ✓ for done rows and ✗ for failed rows', () => {
    const results = new Map<string, ScenarioResult>([
      ['SS-1', newResult('SS-1', { status: 'done', stage: 'done', durationMs: 38000 })],
      [
        'SS-2',
        newResult('SS-2', {
          status: 'failed',
          stage: 'failed',
          failureKind: 'fulfillment-timeout',
          durationMs: 300000,
        }),
      ],
    ]);
    const out = renderLiveText({
      scenarios: SCENARIOS.slice(0, 2),
      results,
      startedAtMs: 0,
      nowMs: 300000,
    });
    expect(out).toMatch(/✓\s*SS-1/);
    expect(out).toMatch(/✗\s*SS-2/);
    expect(out).toContain('1/2 done');
    expect(out).toContain('1 failed');
  });
});

describe('renderFinalSummary', () => {
  it('returns a string containing every scenario id and its terminal status', () => {
    const results = new Map<string, ScenarioResult>([
      [
        'SS-1',
        newResult('SS-1', {
          status: 'done',
          stage: 'done',
          intentHash: '0xabc',
          publishTxHash: '0xtx',
        }),
      ],
      [
        'SS-2',
        newResult('SS-2', {
          status: 'failed',
          stage: 'failed',
          failureKind: 'fulfillment-timeout',
        }),
      ],
    ]);
    const out = renderFinalSummary({
      scenarios: SCENARIOS.slice(0, 2),
      results,
      startedAtMs: 0,
      finishedAtMs: 1000,
    });
    expect(out).toContain('SS-1');
    expect(out).toContain('SS-2');
    expect(out).toContain('done');
    expect(out).toContain('failed');
    expect(out).toContain('fulfillment-timeout');
  });
});
