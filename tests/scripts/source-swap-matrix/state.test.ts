/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { serializeResults, writeStateFile } from '@/scripts/source-swap-matrix/lib/state';
import type { ScenarioResult } from '@/scripts/source-swap-matrix/lib/types';

describe('serializeResults', () => {
  it('serializes BigInt fields as decimal strings', () => {
    const r: ScenarioResult = {
      id: 'SS-1',
      status: 'done',
      stage: 'done',
      destBalanceDelta: 12_345n,
    };
    const out = serializeResults(new Map([['SS-1', r]]));
    expect(out['SS-1'].destBalanceDelta).toBe('12345');
  });

  it('omits undefined fields', () => {
    const r: ScenarioResult = { id: 'SS-1', status: 'pending', stage: 'pending' };
    const out = serializeResults(new Map([['SS-1', r]]));
    expect(out['SS-1']).not.toHaveProperty('intentHash');
  });
});

describe('writeStateFile', () => {
  it('writes a JSON file the consumer can re-parse', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-state-'));
    const filePath = writeStateFile({
      resultsDir: dir,
      startedAt: '2026-04-30T15:23:11.482Z',
      solverUrl: 'http://localhost:3000',
      results: new Map([
        ['SS-1', { id: 'SS-1', status: 'done', stage: 'done', destBalanceDelta: 7n }],
      ]),
      summary: { passed: 1, failed: 0, totalMs: 100 },
    });
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    expect(parsed.solverUrl).toBe('http://localhost:3000');
    expect(parsed.scenarios['SS-1'].destBalanceDelta).toBe('7');
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
