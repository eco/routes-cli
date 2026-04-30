import * as fs from 'node:fs';
import * as path from 'node:path';

export type LogLevel = 'info' | 'warn' | 'error';

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  shortMessage?: string;
  cause?: SerializedError;
  details?: unknown;
}

export interface LogEntry {
  ts: string;
  level: LogLevel;
  scenarioId?: string;
  event: string;
  message?: string;
  details?: unknown;
  error?: SerializedError;
}

export interface Logger {
  filePath: string;
  info(scenarioId: string | undefined, event: string, details?: unknown): void;
  warn(scenarioId: string | undefined, event: string, message: string, details?: unknown): void;
  error(scenarioId: string | undefined, event: string, error: unknown, details?: unknown): void;
}

export function serializeError(err: unknown): SerializedError {
  if (err instanceof Error) {
    const out: SerializedError = { name: err.name, message: err.message, stack: err.stack };
    const a = err as {
      cause?: unknown;
      shortMessage?: string;
      details?: unknown;
      logs?: string[];
    };
    if (a.shortMessage) out.shortMessage = a.shortMessage;
    if (a.cause !== undefined) out.cause = serializeError(a.cause);
    if (a.details !== undefined) {
      // Errors nested in details would JSON-stringify to {} otherwise (Error
      // fields are non-enumerable). Recurse so SvmError/AnchorError shapes
      // survive the trip to disk.
      out.details = a.details instanceof Error ? serializeError(a.details) : a.details;
    }
    if (a.logs) {
      const existing = (out.details ?? {}) as Record<string, unknown>;
      out.details = { ...existing, logs: a.logs };
    }
    return out;
  }
  return { name: 'NonError', message: String(err) };
}

/**
 * Pretty-compact JSON: tries to keep small values on one line, only breaks
 * onto multiple lines when the inline form exceeds maxWidth at the current
 * indent. Makes log files way easier to scan than `JSON.stringify(_, _, 2)`.
 */
function formatJson(value: unknown, maxWidth = 100): string {
  return formatValue(value, '', maxWidth);
}

function formatValue(value: unknown, indent: string, maxWidth: number): string {
  const inline = inlineStringify(value);
  if (inline.length + indent.length <= maxWidth) return inline;

  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const next = indent + '  ';
    const items = value.map(v => next + formatValue(v, next, maxWidth));
    return `[\n${items.join(',\n')}\n${indent}]`;
  }

  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, v]) => v !== undefined
    );
    if (entries.length === 0) return '{}';
    const next = indent + '  ';
    const lines = entries.map(
      ([k, v]) => `${next}${JSON.stringify(k)}: ${formatValue(v, next, maxWidth)}`
    );
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }

  return inline;
}

function inlineStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v)) ?? 'null';
}

export interface CreateLoggerInput {
  resultsDir: string;
  startedAt: string;
}

export function createLogger(input: CreateLoggerInput): Logger {
  fs.mkdirSync(input.resultsDir, { recursive: true });
  const stamp = input.startedAt.replace(/[:.]/g, '-');
  const filePath = path.join(input.resultsDir, `source-swap-execute-matrix-${stamp}.log.json`);

  // In-memory buffer; we rewrite the whole file on every append so the file
  // remains a valid JSON array readable mid-run by `jq` or any JSON tool.
  const entries: LogEntry[] = [];

  const append = (entry: LogEntry): void => {
    entries.push(entry);
    fs.writeFileSync(filePath, formatJson(entries) + '\n');
  };

  return {
    filePath,
    info(scenarioId, event, details) {
      append({ ts: new Date().toISOString(), level: 'info', scenarioId, event, details });
    },
    warn(scenarioId, event, message, details) {
      append({ ts: new Date().toISOString(), level: 'warn', scenarioId, event, message, details });
    },
    error(scenarioId, event, error, details) {
      append({
        ts: new Date().toISOString(),
        level: 'error',
        scenarioId,
        event,
        error: serializeError(error),
        details,
      });
    },
  };
}
