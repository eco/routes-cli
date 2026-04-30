import type { Scenario } from './scenarios';
import type { FailureKind, ScenarioResult } from './types';
import type { QuoteEnvelope } from './quote';
import type { EvmSubmitResult } from './evm-submit';
import type { SvmSubmitResult } from './svm-submit';
import type { PollDestResult, PortalScanResult } from './verify';
import type { Logger } from './logger';

export interface RunnerDeps {
  quote: (s: Scenario) => Promise<QuoteEnvelope>;
  submitEvm: (s: Scenario, q: QuoteEnvelope) => Promise<EvmSubmitResult>;
  submitSvm: (s: Scenario, q: QuoteEnvelope) => Promise<SvmSubmitResult>;
  snapshotDestBalance: (s: Scenario) => Promise<bigint>;
  pollDestBalance: (s: Scenario, balanceBefore: bigint) => Promise<PollDestResult>;
  scanSourcePortal: (
    s: Scenario,
    submit: EvmSubmitResult | SvmSubmitResult
  ) => Promise<PortalScanResult>;
  onUpdate: (r: ScenarioResult) => void;
  now: () => number;
  log?: Logger;
}

const FAILURE_KIND_PATTERNS: Array<{ re: RegExp; kind: FailureKind }> = [
  { re: /evm-balance-insufficient/, kind: 'evm-balance-insufficient' },
  { re: /evm-publish-revert/, kind: 'evm-publish-revert' },
  { re: /simulation/i, kind: 'evm-simulation-revert' },
  { re: /svm-publish-failed/, kind: 'svm-publish-failed' },
  { re: /svm-fund-failed/, kind: 'svm-fund-failed' },
  { re: /quote-shape|encodedRoute|sourcePortal/i, kind: 'quote-shape-invalid' },
  { re: /quote\s+\d{3}/, kind: 'quote-http-error' },
];

function classify(
  err: unknown,
  defaultKind: FailureKind = 'unexpected-exception'
): {
  kind: FailureKind;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  for (const { re, kind } of FAILURE_KIND_PATTERNS) {
    if (re.test(message)) return { kind, message };
  }
  return { kind: defaultKind, message };
}

export async function runScenario(s: Scenario, deps: RunnerDeps): Promise<ScenarioResult> {
  const result: ScenarioResult = {
    id: s.id,
    status: 'running',
    stage: 'pending',
    startedAt: deps.now(),
  };
  const update = (patch: Partial<ScenarioResult>) => {
    Object.assign(result, patch);
    deps.onUpdate(result);
  };
  const fail = (kind: FailureKind, message: string, extra: Partial<ScenarioResult> = {}) => {
    update({
      ...extra,
      status: 'failed',
      stage: 'failed',
      failureKind: kind,
      errorMessage: message,
      finishedAt: deps.now(),
      durationMs: deps.now() - (result.startedAt ?? deps.now()),
    });
    return result;
  };

  try {
    update({ stage: 'quoting' });
    let quote: QuoteEnvelope;
    try {
      quote = await deps.quote(s);
    } catch (err) {
      deps.log?.error(s.id, 'quote-error', err);
      const { kind, message } = classify(err, 'quote-http-error');
      return fail(kind, message);
    }

    const balanceBefore = await deps.snapshotDestBalance(s);

    update({ stage: 'publishing' });
    let submit: EvmSubmitResult | SvmSubmitResult;
    try {
      submit = s.srcVm === 'svm' ? await deps.submitSvm(s, quote) : await deps.submitEvm(s, quote);
    } catch (err) {
      deps.log?.error(s.id, `${s.srcVm}-publish-error`, err);
      const defaultKind: FailureKind =
        s.srcVm === 'svm' ? 'svm-publish-failed' : 'evm-publish-revert';
      const { kind, message } = classify(err, defaultKind);
      return fail(kind, message);
    }
    update({
      intentHash: submit.intentHash,
      publishTxHash:
        'publishTxHash' in submit
          ? (submit.publishTxHash as unknown as string)
          : (submit.publishSig as string),
      fundTxHash: 'fundSig' in submit ? (submit.fundSig as string) : undefined,
    });

    update({ stage: 'waiting-fulfillment' });
    const pollResult = await deps.pollDestBalance(s, balanceBefore);

    update({ stage: 'scanning-events' });
    const scan = await deps.scanSourcePortal(s, submit);

    if (!pollResult.timedOut) {
      const note = scan.fulfilledTx === undefined ? 'LOCAL event not yet indexed' : undefined;
      update({
        status: 'done',
        stage: 'done',
        destBalanceDelta: pollResult.delta,
        fulfilledTxHash: scan.fulfilledTx,
        refundedTxHash: scan.refundedTx,
        finishedAt: deps.now(),
        durationMs: deps.now() - (result.startedAt ?? deps.now()),
        note,
      });
      return result;
    }

    if (scan.refundedTx) {
      return fail('local-refunded', 'destination balance never moved; LOCAL refunded', {
        refundedTxHash: scan.refundedTx,
      });
    }
    if (scan.fulfilledTx) {
      return fail('fulfillment-timeout', 'LOCAL fulfilled but destination balance never observed', {
        fulfilledTxHash: scan.fulfilledTx,
      });
    }
    return fail('local-stuck', 'destination balance never moved; no LOCAL event seen');
  } catch (err) {
    deps.log?.error(s.id, 'runner-unexpected', err);
    const { kind, message } = classify(err);
    return fail(kind, message);
  }
}
