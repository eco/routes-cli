import Table from 'cli-table3';
import pc from 'picocolors';

import type { Scenario } from './scenarios';
import type { ScenarioResult, Status } from './types';

const STAGE_ICON: Record<Status, string> = {
  pending: pc.gray('○'),
  running: pc.yellow('⏳'),
  done: pc.green('✓'),
  failed: pc.red('✗'),
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
}

function chainLabel(chainId: number): string {
  if (chainId === 1399811149) return 'sol';
  return chainId.toString();
}

function progressBar(done: number, total: number, width = 18): string {
  const filled = total === 0 ? 0 : Math.round((done / total) * width);
  return `[${'█'.repeat(filled)}${'░'.repeat(width - filled)}]`;
}

/**
 * Trim a viem/Solana/HTTP error to a single redacted line for the live row.
 * Strips RPC URLs containing API keys; keeps the human-readable head.
 */
export function summarizeError(msg: string | undefined): string {
  if (!msg) return '';
  const firstLine = msg.split('\n')[0];
  const redacted = firstLine
    .replace(/https?:\/\/[^\s/]*alchemy\.com\/v2\/[A-Za-z0-9_-]+/gi, '<alchemy-rpc>')
    .replace(/https?:\/\/[^\s/]*quiknode\.pro\/[A-Za-z0-9_-]+/gi, '<quiknode-rpc>')
    .replace(/https?:\/\/[^\s/]*\/v2\/[A-Za-z0-9_-]+/g, '<rpc>')
    .replace(/https?:\/\/[^\s/]+(?:\/[A-Za-z0-9_-]{16,})+/g, '<url>');
  return redacted.length > 80 ? redacted.slice(0, 77) + '…' : redacted;
}

export interface RenderInput {
  scenarios: readonly Scenario[];
  results: Map<string, ScenarioResult>;
  startedAtMs: number;
  nowMs: number;
}

export function renderLiveText(input: RenderInput): string {
  const { scenarios, results, startedAtMs, nowMs } = input;
  const elapsed = formatDuration(nowMs - startedAtMs);

  const lines: string[] = [];
  lines.push(`${pc.bold('Source-Swap Execute Matrix')}    elapsed ${elapsed}`);
  lines.push('─'.repeat(72));

  let done = 0,
    failed = 0,
    running = 0,
    pending = 0;
  for (const s of scenarios) {
    const r = results.get(s.id) ?? { id: s.id, status: 'pending', stage: 'pending' };
    if (r.status === 'done') done++;
    else if (r.status === 'failed') failed++;
    else if (r.status === 'running') running++;
    else pending++;

    const icon = STAGE_ICON[r.status];
    const route = `${s.srcSymbol}(${chainLabel(s.srcChain)})→${s.dstSymbol}(${chainLabel(s.dstChain)})`;
    const stagePart = r.stage;
    const elapsedPart =
      r.startedAt !== undefined && r.finishedAt === undefined
        ? formatDuration(nowMs - r.startedAt)
        : r.durationMs !== undefined
          ? formatDuration(r.durationMs)
          : '';
    const noteSuffix = r.errorMessage ? `  ${pc.dim(summarizeError(r.errorMessage))}` : '';
    lines.push(
      `${icon} ${s.id.padEnd(5)}${s.name.padEnd(28)}${route.padEnd(28)}${stagePart.padEnd(20)}${elapsedPart}${noteSuffix}`
    );
    // One hash per continuation line so double-click selects cleanly.
    const append = (label: string, hash: string | undefined) => {
      if (hash) lines.push(pc.dim(`        ${label.padEnd(13)} ${hash}`));
    };
    append('intent', r.intentHash);
    append('publish-tx', r.publishTxHash);
    append('fund-tx', r.fundTxHash);
    append('fulfilled-tx', r.fulfilledTxHash);
    append('refunded-tx', r.refundedTxHash);
  }

  lines.push('─'.repeat(72));
  const total = scenarios.length;
  lines.push(
    `${progressBar(done + failed, total)} ${done}/${total} done · ${running} in flight · ${pending} pending · ${failed} failed`
  );
  return lines.join('\n');
}

export interface FinalRenderInput {
  scenarios: readonly Scenario[];
  results: Map<string, ScenarioResult>;
  startedAtMs: number;
  finishedAtMs: number;
}

export function renderFinalSummary(input: FinalRenderInput): string {
  const { scenarios, results, startedAtMs, finishedAtMs } = input;
  const table = new Table({
    head: ['ID', 'Name', 'Route', 'Status', 'Failure', 'Duration', 'Intent', 'Publish Tx'],
    wordWrap: true,
  });
  for (const s of scenarios) {
    const r = results.get(s.id) ?? { id: s.id, status: 'pending', stage: 'pending' };
    table.push([
      s.id,
      s.name,
      `${s.srcSymbol}(${chainLabel(s.srcChain)})→${s.dstSymbol}(${chainLabel(s.dstChain)})`,
      r.status,
      r.failureKind ?? '',
      r.durationMs !== undefined ? formatDuration(r.durationMs) : '',
      r.intentHash ? `${r.intentHash.slice(0, 10)}…` : '',
      r.publishTxHash ? `${r.publishTxHash.slice(0, 10)}…` : '',
    ]);
  }
  const totals = countTotals(results);
  return [
    table.toString(),
    '',
    `${totals.passed}/${scenarios.length} passed · ${totals.failed} failed · total ${formatDuration(finishedAtMs - startedAtMs)}`,
  ].join('\n');
}

function countTotals(results: Map<string, ScenarioResult>) {
  let passed = 0,
    failed = 0;
  for (const r of results.values()) {
    if (r.status === 'done') passed++;
    else if (r.status === 'failed') failed++;
  }
  return { passed, failed };
}
