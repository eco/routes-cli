/* eslint-disable @typescript-eslint/require-await */
import type { Address, Hex } from 'viem';

import { RunnerDeps, runScenario } from '@/scripts/source-swap-matrix/lib/runner';
import { SCENARIOS } from '@/scripts/source-swap-matrix/lib/scenarios';
import type { ScenarioResult } from '@/scripts/source-swap-matrix/lib/types';

function makeDeps(overrides: Partial<RunnerDeps> = {}): RunnerDeps {
  const deps: RunnerDeps = {
    quote: jest.fn(async () => ({
      quoteResponses: [{ encodedRoute: '0xabcd', deadline: '999' }],
      contracts: { sourcePortal: '0xPORTAL', prover: '0xPROVER' },
    })),
    submitEvm: jest.fn(async () => ({
      publishTxHash: '0xtx' as Hex,
      intentHash: '0xih' as Hex,
      publishBlock: 1n,
      portal: '0xPORTAL' as Address,
    })),
    submitSvm: jest.fn(async () => ({
      publishSig: 'sig1',
      fundSig: 'sig2',
      intentHash: '0xih' as Hex,
      portalProgramId: undefined as never,
    })),
    snapshotDestBalance: jest.fn(async () => 0n),
    pollDestBalance: jest.fn(async () => ({
      timedOut: false as const,
      delta: 1n,
      finalBalance: 1n,
    })),
    scanSourcePortal: jest.fn(async () => ({ fulfilledTx: '0xfulfilled' as Hex })),
    onUpdate: () => undefined,
    now: () => 0,
    ...overrides,
  };
  return deps;
}

describe('runScenario', () => {
  it('walks an EVM scenario to done when every stage succeeds', async () => {
    const updates: ScenarioResult[] = [];
    const deps = makeDeps({ onUpdate: r => updates.push({ ...r }) });
    const result = await runScenario(SCENARIOS[0], deps);
    expect(result.status).toBe('done');
    expect(result.stage).toBe('done');
    expect(result.intentHash).toBe('0xih');
    expect(result.fulfilledTxHash).toBe('0xfulfilled');
    const stages = updates.map(u => u.stage);
    const dedupedStages = stages.filter((stage, i) => i === 0 || stages[i - 1] !== stage);
    expect(dedupedStages).toEqual([
      'quoting',
      'publishing',
      'waiting-fulfillment',
      'scanning-events',
      'done',
    ]);
  });

  it('marks scenario failed: local-refunded when balance never moves and refund event seen', async () => {
    const deps = makeDeps({
      pollDestBalance: jest.fn(async () => ({ timedOut: true as const })),
      scanSourcePortal: jest.fn(async () => ({ refundedTx: '0xref' as Hex })),
    });
    const result = await runScenario(SCENARIOS[0], deps);
    expect(result.status).toBe('failed');
    expect(result.failureKind).toBe('local-refunded');
    expect(result.refundedTxHash).toBe('0xref');
  });

  it('marks scenario failed: local-stuck when balance never moves and no event seen', async () => {
    const deps = makeDeps({
      pollDestBalance: jest.fn(async () => ({ timedOut: true as const })),
      scanSourcePortal: jest.fn(async () => ({})),
    });
    const result = await runScenario(SCENARIOS[0], deps);
    expect(result.failureKind).toBe('local-stuck');
  });

  it('routes SVM scenarios through submitSvm', async () => {
    const deps = makeDeps();
    await runScenario(SCENARIOS[6], deps);
    expect(deps.submitSvm).toHaveBeenCalledTimes(1);
    expect(deps.submitEvm).not.toHaveBeenCalled();
  });

  it('catches unexpected exceptions and reports unexpected-exception', async () => {
    const deps = makeDeps({
      submitEvm: jest.fn(async () => {
        throw new Error('kaboom');
      }),
    });
    const result = await runScenario(SCENARIOS[0], deps);
    expect(result.failureKind).toBe('evm-publish-revert');
    expect(result.errorMessage).toMatch(/kaboom/);
  });
});

import type { Logger } from '@/scripts/source-swap-matrix/lib/logger';

describe('runScenario logging', () => {
  function makeLogger(): Logger & { calls: Array<[string, string, unknown]> } {
    const calls: Array<[string, string, unknown]> = [];
    return {
      filePath: '/dev/null',
      info: () => undefined,
      warn: () => undefined,
      error: (scenarioId, event, error) => {
        calls.push([scenarioId ?? '', event, error]);
      },
      calls,
    };
  }

  it('forwards the original Error to log.error when the submitter throws', async () => {
    const log = makeLogger();
    const boom = new Error('kaboom') as Error & { shortMessage?: string };
    boom.shortMessage = 'sim revert';
    const deps = makeDeps({
      submitEvm: jest.fn(async () => {
        throw boom;
      }),
      log,
    });
    await runScenario(SCENARIOS[0], deps);
    expect(log.calls).toHaveLength(1);
    const [scenarioId, event, error] = log.calls[0];
    expect(scenarioId).toBe('SS-1');
    expect(event).toBe('evm-publish-error');
    expect((error as Error).message).toBe('kaboom');
  });
});
