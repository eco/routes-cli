import * as fs from 'node:fs';
import * as path from 'node:path';

import type { ScenarioResult } from './types';

interface SerializableResult {
  [key: string]: string | number | undefined;
}

export function serializeResults(
  results: Map<string, ScenarioResult>
): Record<string, SerializableResult> {
  const out: Record<string, SerializableResult> = {};
  for (const [id, r] of results.entries()) {
    const obj: SerializableResult = {};
    for (const [key, value] of Object.entries(r)) {
      if (value === undefined) continue;
      if (typeof value === 'bigint') {
        obj[key] = value.toString();
      } else {
        obj[key] = value as string | number;
      }
    }
    out[id] = obj;
  }
  return out;
}

export interface WriteStateInput {
  resultsDir: string;
  startedAt: string;
  solverUrl: string;
  results: Map<string, ScenarioResult>;
  summary?: { passed: number; failed: number; totalMs: number };
}

export function writeStateFile(input: WriteStateInput): string {
  fs.mkdirSync(input.resultsDir, { recursive: true });
  const stamp = input.startedAt.replace(/[:.]/g, '-');
  const filePath = path.join(input.resultsDir, `source-swap-execute-matrix-${stamp}.json`);
  fs.writeFileSync(
    filePath,
    JSON.stringify(
      {
        startedAt: input.startedAt,
        solverUrl: input.solverUrl,
        scenarios: serializeResults(input.results),
        summary: input.summary,
      },
      null,
      2
    )
  );
  return filePath;
}
