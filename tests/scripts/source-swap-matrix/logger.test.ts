import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { createLogger, serializeError } from '@/scripts/source-swap-matrix/lib/logger';

function readAll(filePath: string): unknown[] {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown[];
}

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('serializeError', () => {
  it('extracts name, message, and stack from a plain Error', () => {
    const out = serializeError(new Error('boom'));
    expect(out.name).toBe('Error');
    expect(out.message).toBe('boom');
    expect(out.stack).toContain('boom');
  });

  it('walks the cause chain', () => {
    const inner = new Error('inner');
    const outer = new Error('outer') as Error & { cause?: unknown };
    outer.cause = inner;
    const out = serializeError(outer);
    expect(out.cause?.message).toBe('inner');
  });

  it('captures viem shortMessage and Solana logs in details', () => {
    const err = new Error('publish failed') as Error & {
      shortMessage?: string;
      logs?: string[];
    };
    err.shortMessage = 'execution reverted: bad';
    err.logs = ['Program log: nope'];
    const out = serializeError(err);
    expect(out.shortMessage).toBe('execution reverted: bad');
    expect((out.details as { logs?: string[] }).logs).toEqual(['Program log: nope']);
  });

  it('handles non-Error values by stringifying them', () => {
    expect(serializeError('plain string').message).toBe('plain string');
    expect(serializeError(42).name).toBe('NonError');
  });
});

describe('createLogger', () => {
  it('writes one JSONL line per call across info/warn/error', () => {
    withTempDir(dir => {
      const logger = createLogger({
        resultsDir: dir,
        startedAt: '2026-04-30T10:00:00.000Z',
      });
      logger.info('SS-1', 'stage', { stage: 'quoting' });
      logger.warn('SS-2', 'lifi-fallback', 'no whitelist match');
      logger.error('SS-3', 'evm-publish', new Error('revert'), { tx: '0xtx' });

      const entries = readAll(logger.filePath) as Array<Record<string, unknown>>;
      expect(entries).toHaveLength(3);
      expect(entries[0].level).toBe('info');
      expect(entries[0].scenarioId).toBe('SS-1');
      expect(entries[0].event).toBe('stage');
      expect(entries[1].level).toBe('warn');
      expect((entries[1] as { message?: string }).message).toBe('no whitelist match');
      expect(entries[2].level).toBe('error');
      expect((entries[2].error as { message?: string })?.message).toBe('revert');
      expect((entries[2].details as { tx?: string }).tx).toBe('0xtx');
    });
  });

  it('serializes bigint fields in details as decimal strings', () => {
    withTempDir(dir => {
      const logger = createLogger({
        resultsDir: dir,
        startedAt: '2026-04-30T10:00:00.000Z',
      });
      logger.info('SS-1', 'amount', { amount: 12_345n });
      const [entry] = readAll(logger.filePath) as Array<Record<string, unknown>>;
      expect((entry.details as { amount?: string }).amount).toBe('12345');
    });
  });

  it('writes the log file next to a sibling state file using the same ISO stamp', () => {
    withTempDir(dir => {
      const logger = createLogger({
        resultsDir: dir,
        startedAt: '2026-04-30T10:00:00.000Z',
      });
      expect(logger.filePath).toMatch(
        /source-swap-execute-matrix-2026-04-30T10-00-00-000Z\.log\.json$/
      );
    });
  });
});
