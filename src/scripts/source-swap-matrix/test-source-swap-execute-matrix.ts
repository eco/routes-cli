#!/usr/bin/env npx tsx
import 'dotenv/config';

/**
 * Source-Swap Execute Matrix — runs all 8 matrix scenarios end-to-end.
 *
 * Install runtime-only deps (do not commit). On pnpm 9.15+ where --no-save is
 * unsupported, install then revert the manifest:
 *   pnpm add -D @lifi/sdk log-update@^4 cli-progress@^3 picocolors@^1 p-limit@^3 p-timeout@^4
 *   git checkout -- package.json pnpm-lock.yaml
 * Older majors are deliberate — log-update/p-limit/p-timeout went ESM-only after
 * those versions and tsx 4 + Node 24 chokes on the ESM-only entrypoints.
 *
 * Usage:
 *   pnpm tsx src/scripts/source-swap-matrix/test-source-swap-execute-matrix.ts --dry-run
 *   SOLVER_URL=https://solver-magenta.eco.com \
 *     pnpm tsx src/scripts/source-swap-matrix/test-source-swap-execute-matrix.ts --filter SS-1
 *   pnpm tsx src/scripts/source-swap-matrix/test-source-swap-execute-matrix.ts
 *
 * Required env: EVM_PRIVATE_KEY, SVM_PRIVATE_KEY, ALCHEMY_KEY, SVM_RPC_URL.
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import logUpdate from 'log-update';
import pLimit from 'p-limit';
import pTimeout from 'p-timeout';
import pc from 'picocolors';
import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { checkBalances, renderBalanceCheck } from './lib/balance-check';
import { parseCli } from './lib/cli';
import { ensureErc20Approval, submitEvm } from './lib/evm-submit';
import { requestQuote } from './lib/quote';
import { renderFinalSummary, renderLiveText } from './lib/render';
import { runScenario } from './lib/runner';
import {
  SCENARIOS,
  SOLANA_CHAIN,
  applyAmountOverrides,
  filterScenarios,
  type Scenario,
} from './lib/scenarios';
import { createLogger } from './lib/logger';
import { writeStateFile } from './lib/state';
import { submitSvm } from './lib/svm-submit';
import type { ScenarioResult } from './lib/types';
import { pollDestBalance, scanSourcePortalEvm } from './lib/verify';

const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

// Mainnet (chain 1) is excluded — gas is too high vs the L2s the matrix uses.
const BANNED_EVM_CHAINS = new Set<number>([1]);

const STABLES_BY_CHAIN: Record<number, string> = {
  8453: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  42161: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  [SOLANA_CHAIN]: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
};

function rpcFor(chain: number, alchemyKey: string | undefined): string {
  if (chain === 8453)
    return alchemyKey
      ? `https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : 'https://mainnet.base.org';
  if (chain === 42161)
    return alchemyKey
      ? `https://arb-mainnet.g.alchemy.com/v2/${alchemyKey}`
      : 'https://arb1.arbitrum.io/rpc';
  throw new Error(`no EVM RPC mapping for chain ${chain}`);
}

function rpcHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function isFreeSvm(url: string): boolean {
  const host = rpcHost(url).toLowerCase();
  return (
    host.endsWith('mainnet-beta.solana.com') ||
    host.endsWith('publicnode.com') ||
    host.endsWith('rpc.ankr.com') ||
    host.endsWith('llamarpc.com')
  );
}

function assertNoMainnetScenarios(scenarios: readonly Scenario[]): void {
  for (const s of scenarios) {
    if (s.srcVm === 'evm' && BANNED_EVM_CHAINS.has(s.srcChain)) {
      throw new Error(`refusing to run ${s.id}: src chain ${s.srcChain} is mainnet (gas-banned)`);
    }
    if (s.dstVm === 'evm' && BANNED_EVM_CHAINS.has(s.dstChain)) {
      throw new Error(`refusing to run ${s.id}: dst chain ${s.dstChain} is mainnet (gas-banned)`);
    }
  }
}

/**
 * Retry an RPC call with linear backoff. The matrix's polling loop already
 * tolerates transient errors via its own retry-via-loop semantics, but the
 * initial snapshot read happens once — a single network blip there fails
 * the whole scenario. Keep `attempts` small; persistent RPC failure should
 * still surface, just not on the first jitter.
 */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    delayMs?: number;
    log?: { warn: (sid: string | undefined, evt: string, msg: string, det?: unknown) => void };
    scenarioId?: string;
  } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const delayMs = opts.delayMs ?? 500;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      opts.log?.warn(opts.scenarioId, `rpc-retry:${label}`, msg, {
        attempt: i + 1,
        of: attempts,
      });
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs * (i + 1)));
    }
  }
  throw lastErr;
}

async function readEvmBalance(
  publicClient: PublicClient,
  token: string,
  owner: Address
): Promise<bigint> {
  if (token.toLowerCase() === NATIVE_ADDRESS) {
    return publicClient.getBalance({ address: owner });
  }
  return publicClient.readContract({
    address: token as Address,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function readSplBalance(
  connection: Connection,
  owner: PublicKey,
  mint: string
): Promise<bigint> {
  // WSOL deliveries: solver swaps via Jupiter then closes the WSOL ATA in the
  // same fulfillment tx, system-transferring native lamports to the recipient.
  // So polling native lamports captures the inbound amount.
  if (mint === 'So11111111111111111111111111111111111111112') {
    return BigInt(await connection.getBalance(owner));
  }
  const mintKey = new PublicKey(mint);
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const ata = getAssociatedTokenAddressSync(mintKey, owner, true, programId);
    const info = await connection.getAccountInfo(ata);
    if (info && info.data.length >= 72) {
      return info.data.readBigUInt64LE(64);
    }
  }
  return 0n;
}

async function main() {
  const opts = parseCli(process.argv.slice(2), process.env);

  const evmPk = process.env.EVM_PRIVATE_KEY as Hex | undefined;
  const svmSecret = process.env.SVM_PRIVATE_KEY;
  if (!evmPk) throw new Error('EVM_PRIVATE_KEY env var required');
  if (!svmSecret) throw new Error('SVM_PRIVATE_KEY env var required');

  const evmAccount = privateKeyToAccount(evmPk);
  const svmKeypair = Keypair.fromSecretKey(bs58.decode(svmSecret));
  const evmAddress = evmAccount.address;
  const svmAddress = svmKeypair.publicKey.toBase58();

  console.log(pc.bold('Wallets:'));
  console.log(`  EVM: ${evmAddress}`);
  console.log(`  SVM: ${svmAddress}`);
  const svmRpc = opts.svmRpcUrl ?? 'https://api.mainnet-beta.solana.com';
  const evmAlchemyOk = !!opts.alchemyKey;
  console.log(pc.bold('RPCs:'));
  console.log(
    `  EVM:    ${rpcHost(rpcFor(8453, opts.alchemyKey))}${evmAlchemyOk ? '' : pc.yellow(' (PUBLIC — likely rate-limited; set ALCHEMY_API_KEY)')}`
  );
  console.log(
    `  SVM:    ${rpcHost(svmRpc)}${isFreeSvm(svmRpc) ? pc.yellow(' (PUBLIC/FREE — likely rate-limited; set SVM_RPC_URL to a paid endpoint)') : ''}`
  );
  console.log(`${pc.bold('Solver:')} ${opts.solverUrl}`);
  console.log();

  const scenarios = applyAmountOverrides(
    filterScenarios(SCENARIOS, { include: opts.include, exclude: opts.exclude }),
    opts.amountOverrides
  );

  if (scenarios.length === 0) {
    console.error('no scenarios after filter/exclude');
    process.exit(2);
  }

  assertNoMainnetScenarios(scenarios);

  const evmPublicByChain = new Map<number, PublicClient>();
  const evmWalletByChain = new Map<number, WalletClient>();
  for (const s of scenarios) {
    if (s.srcVm !== 'evm') continue;
    if (!evmPublicByChain.has(s.srcChain)) {
      const transport = http(rpcFor(s.srcChain, opts.alchemyKey));
      evmPublicByChain.set(
        s.srcChain,
        createPublicClient({
          chain: { id: s.srcChain } as never,
          transport,
        })
      );
      evmWalletByChain.set(
        s.srcChain,
        createWalletClient({
          account: evmAccount,
          chain: { id: s.srcChain } as never,
          transport,
        })
      );
    }
    if (!evmPublicByChain.has(s.dstChain) && s.dstVm === 'evm') {
      evmPublicByChain.set(
        s.dstChain,
        createPublicClient({
          chain: { id: s.dstChain } as never,
          transport: http(rpcFor(s.dstChain, opts.alchemyKey)),
        })
      );
    }
  }

  const svmConnection = new Connection(
    opts.svmRpcUrl ?? 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );

  if (!opts.skipBalanceCheck) {
    const balanceRows = await checkBalances({
      scenarios,
      evmAddress,
      svmAddress,
      evmPublicByChain,
      svmConnection,
    });
    console.log(renderBalanceCheck(balanceRows));
    const insufficient = balanceRows.filter(r => r.status === 'insufficient');
    if (insufficient.length > 0) {
      if (opts.dryRun) {
        console.log(
          pc.yellow(
            `⚠ ${insufficient.length} balance(s) below required — dry-run continues but execute mode would refuse.\n`
          )
        );
      } else {
        console.error(
          pc.red(
            `✗ ${insufficient.length} balance(s) below required. Top up and retry, or pass --skip-balance-check to override.\n`
          )
        );
        process.exit(1);
      }
    } else {
      console.log(pc.green(`✓ all source balances ok\n`));
    }
  }

  const evmChainLimit = new Map<number, ReturnType<typeof pLimit>>();
  for (const s of scenarios) {
    if (s.srcVm === 'evm' && !evmChainLimit.has(s.srcChain)) {
      evmChainLimit.set(s.srcChain, pLimit(1));
    }
  }

  if (!opts.dryRun) {
    const seen = new Set<string>();
    for (const s of scenarios) {
      if (s.srcVm !== 'evm') continue;
      if (s.srcToken.toLowerCase() === NATIVE_ADDRESS) continue;
      const key = `${s.srcChain}:${s.srcToken.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const sameTokenScenarios = scenarios.filter(
        x => x.srcVm === 'evm' && x.srcChain === s.srcChain && x.srcToken === s.srcToken
      );
      const required = sameTokenScenarios.reduce((acc, x) => acc + x.defaultAmount, 0n);
      const portalCandidate = await fetchSourcePortalForChain(
        opts.solverUrl,
        s,
        evmAddress,
        svmAddress
      );
      await ensureErc20Approval({
        publicClient: evmPublicByChain.get(s.srcChain)!,
        walletClient: evmWalletByChain.get(s.srcChain)!,
        token: s.srcToken as Address,
        owner: evmAddress,
        spender: portalCandidate,
        required,
      });
    }
  }

  const startedAtMs = Date.now();
  const startedAtIso = new Date(startedAtMs).toISOString();
  const results = new Map<string, ScenarioResult>();
  for (const s of scenarios) {
    results.set(s.id, { id: s.id, status: 'pending', stage: 'pending' });
  }

  const logger = createLogger({ resultsDir: opts.resultsDir, startedAt: startedAtIso });
  logger.info(undefined, 'run-started', {
    solverUrl: opts.solverUrl,
    scenarios: scenarios.map(s => s.id),
    dryRun: opts.dryRun,
  });

  let renderTimer: NodeJS.Timeout | undefined;
  function flushRender() {
    logUpdate(
      renderLiveText({
        scenarios,
        results,
        startedAtMs,
        nowMs: Date.now(),
      })
    );
  }
  if (process.stdout.isTTY) {
    flushRender();
    renderTimer = setInterval(flushRender, 1000);
  }

  // Force-exit on Ctrl+C so the live-render interval and any pending p-timeouts
  // don't keep the event loop alive past the user's intent to quit.
  let sigintReceived = false;
  process.on('SIGINT', () => {
    if (sigintReceived) process.exit(130);
    sigintReceived = true;
    if (renderTimer) clearInterval(renderTimer);
    if (process.stdout.isTTY) logUpdate.clear();
    console.log('\n^C — aborted');
    process.exit(130);
  });

  const onUpdate = (r: ScenarioResult) => {
    results.set(r.id, r);
    if (process.stdout.isTTY) flushRender();
    const details: Record<string, unknown> = { stage: r.stage };
    if (r.durationMs !== undefined) details.durationMs = r.durationMs;
    if (r.intentHash) details.intentHash = r.intentHash;
    if (r.publishTxHash) details.publishTxHash = r.publishTxHash;
    if (r.fundTxHash) details.fundTxHash = r.fundTxHash;
    if (r.fulfilledTxHash) details.fulfilledTxHash = r.fulfilledTxHash;
    if (r.refundedTxHash) details.refundedTxHash = r.refundedTxHash;
    if (r.destBalanceDelta !== undefined) details.destBalanceDelta = r.destBalanceDelta;
    if (r.status === 'failed') {
      details.failureKind = r.failureKind;
      logger.warn(r.id, `terminal:${r.status}`, r.errorMessage ?? '', details);
    } else if (r.status === 'done') {
      logger.info(r.id, 'terminal:done', details);
    } else {
      logger.info(r.id, 'stage', details);
    }
    writeStateFile({
      resultsDir: opts.resultsDir,
      startedAt: startedAtIso,
      solverUrl: opts.solverUrl,
      results,
    });
  };

  const tasks = scenarios.map((s, idx) => async () => {
    // Stagger only matters for execute mode (avoids EVM nonce churn from a
    // single funder). Dry-run is HTTP-only — fan out in parallel.
    if (!opts.dryRun) await new Promise(r => setTimeout(r, idx * opts.staggerMs));
    if (opts.dryRun) {
      const dry = await runDryRunScenario(s, opts, evmAddress, svmAddress, logger);
      results.set(s.id, dry);
      onUpdate(dry);
      return dry;
    }
    const deps = buildRunnerDeps({
      scenario: s,
      opts,
      evmAddress,
      svmAddress,
      evmAccount,
      svmKeypair,
      evmPublicByChain,
      evmWalletByChain,
      evmChainLimit,
      svmConnection,
      onUpdate,
      logger,
    });
    return pTimeout(runScenario(s, deps), opts.scenarioTimeoutMs, 'fulfillment-timeout').catch(
      err => {
        logger.error(s.id, 'scenario-timeout-or-escape', err);
        const r = results.get(s.id);
        const finished = {
          ...(r ?? { id: s.id, status: 'failed', stage: 'failed' }),
          status: 'failed' as const,
          stage: 'failed' as const,
          failureKind: 'fulfillment-timeout' as const,
          errorMessage: err instanceof Error ? err.message : String(err),
          finishedAt: Date.now(),
          durationMs: Date.now() - startedAtMs,
        };
        results.set(s.id, finished);
        onUpdate(finished);
        return finished;
      }
    );
  });

  await Promise.allSettled(tasks.map(t => t()));

  if (renderTimer) clearInterval(renderTimer);
  if (process.stdout.isTTY) logUpdate.clear();

  const totals = countTotals(results);
  console.log(
    renderFinalSummary({
      scenarios,
      results,
      startedAtMs,
      finishedAtMs: Date.now(),
    })
  );
  writeStateFile({
    resultsDir: opts.resultsDir,
    startedAt: startedAtIso,
    solverUrl: opts.solverUrl,
    results,
    summary: { ...totals, totalMs: Date.now() - startedAtMs },
  });
  logger.info(undefined, 'run-finished', { totals, totalMs: Date.now() - startedAtMs });
  console.log(`\nlog: ${logger.filePath}`);

  if (totals.failed > 0) process.exit(1);
  process.exit(0);
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

interface DepsInput {
  scenario: Scenario;
  opts: ReturnType<typeof parseCli>;
  evmAddress: Address;
  svmAddress: string;
  evmAccount: ReturnType<typeof privateKeyToAccount>;
  svmKeypair: Keypair;
  evmPublicByChain: Map<number, PublicClient>;
  evmWalletByChain: Map<number, WalletClient>;
  evmChainLimit: Map<number, ReturnType<typeof pLimit>>;
  svmConnection: Connection;
  onUpdate: (r: ScenarioResult) => void;
  logger: ReturnType<typeof createLogger>;
}

function buildRunnerDeps(input: DepsInput) {
  const {
    scenario,
    opts,
    evmAddress,
    svmAddress,
    svmKeypair,
    evmPublicByChain,
    evmWalletByChain,
    evmChainLimit,
    svmConnection,
    onUpdate,
    logger,
  } = input;

  const funder = scenario.srcVm === 'evm' ? evmAddress : svmAddress;
  const recipient = scenario.dstVm === 'evm' ? evmAddress : svmAddress;

  return {
    quote: (s: Scenario) =>
      requestQuote({
        solverUrl: opts.solverUrl,
        scenarioId: s.id,
        sourceChain: s.srcChain,
        destChain: s.dstChain,
        sourceToken: s.srcToken,
        destinationToken: s.dstToken,
        sourceAmount: s.defaultAmount,
        funder,
        recipient,
        log: logger,
      }),
    submitEvm: (
      s: Scenario,
      q: ReturnType<typeof requestQuote> extends Promise<infer T> ? T : never
    ) =>
      evmChainLimit.get(s.srcChain)!(() =>
        submitEvm({
          publicClient: evmPublicByChain.get(s.srcChain)!,
          walletClient: evmWalletByChain.get(s.srcChain)!,
          quote: q as never,
          sourceChain: s.srcChain,
          sourceToken: s.srcToken as Address,
          sourceAmount: s.defaultAmount,
          funder: evmAddress,
        })
      ),
    submitSvm: (s: Scenario, q: never) =>
      submitSvm({
        connection: svmConnection,
        keypair: svmKeypair,
        quote: q as never,
        sourceChain: BigInt(s.srcChain),
        destChain: BigInt(s.dstChain),
        sourceToken: s.srcToken,
        sourceAmount: s.defaultAmount,
      }),
    snapshotDestBalance: async (s: Scenario) =>
      withRetry(
        'snapshot-dest-balance',
        async () => {
          if (s.dstVm === 'evm') {
            return readEvmBalance(evmPublicByChain.get(s.dstChain)!, s.dstToken, evmAddress);
          }
          return readSplBalance(svmConnection, svmKeypair.publicKey, s.dstToken);
        },
        { log: logger, scenarioId: s.id }
      ),
    pollDestBalance: async (s: Scenario, balanceBefore: bigint) =>
      pollDestBalance({
        readBalance: async () =>
          s.dstVm === 'evm'
            ? readEvmBalance(evmPublicByChain.get(s.dstChain)!, s.dstToken, evmAddress)
            : readSplBalance(svmConnection, svmKeypair.publicKey, s.dstToken),
        balanceBefore,
        intervalMs: 10_000,
        timeoutMs: opts.scenarioTimeoutMs,
        sleep: ms => new Promise(r => setTimeout(r, ms)),
        now: () => Date.now(),
        onReadError: (err, consecutive) =>
          logger.warn(
            s.id,
            'dest-balance-read-error',
            err instanceof Error ? err.message : String(err),
            { consecutive }
          ),
      }),
    scanSourcePortal: async (
      s: Scenario,
      submit: { intentHash: string; portal?: Address; publishBlock?: bigint }
    ) => {
      if (!opts.sourcePortalScan) return {};
      if (s.srcVm !== 'evm' || !submit.portal) return {};
      return scanSourcePortalEvm({
        publicClient: evmPublicByChain.get(s.srcChain)!,
        portal: submit.portal,
        intentHash: submit.intentHash as Hex,
        fromBlock: submit.publishBlock ?? 0n,
      });
    },
    onUpdate,
    log: logger,
    now: () => Date.now(),
  };
}

async function fetchSourcePortalForChain(
  solverUrl: string,
  scenario: Scenario,
  evmAddress: string,
  svmAddress: string
): Promise<Address> {
  const funder = scenario.srcVm === 'evm' ? evmAddress : svmAddress;
  const recipient = scenario.dstVm === 'evm' ? evmAddress : svmAddress;
  const probe = await requestQuote({
    solverUrl,
    scenarioId: `${scenario.id}-portal-probe`,
    sourceChain: scenario.srcChain,
    destChain: scenario.dstChain,
    sourceToken: scenario.srcToken,
    destinationToken: scenario.dstToken,
    sourceAmount: scenario.defaultAmount,
    funder,
    recipient,
  }).catch(err => {
    throw new Error(
      `portal probe failed for ${scenario.id}: ${err instanceof Error ? err.message : String(err)}`
    );
  });
  return probe.contracts.sourcePortal as Address;
}

async function runDryRunScenario(
  s: Scenario,
  opts: ReturnType<typeof parseCli>,
  evmAddress: string,
  svmAddress: string,
  logger: ReturnType<typeof createLogger>
): Promise<ScenarioResult> {
  const startedAt = Date.now();
  try {
    const funder = s.srcVm === 'evm' ? evmAddress : svmAddress;
    const recipient = s.dstVm === 'evm' ? evmAddress : svmAddress;
    await requestQuote({
      solverUrl: opts.solverUrl,
      scenarioId: s.id,
      sourceChain: s.srcChain,
      destChain: s.dstChain,
      sourceToken: s.srcToken,
      destinationToken: s.dstToken,
      sourceAmount: s.defaultAmount,
      log: logger,
      funder,
      recipient,
    });
    return {
      id: s.id,
      status: 'done',
      stage: 'done',
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      note: 'dry-run',
    };
  } catch (err) {
    logger.error(s.id, 'dry-run-error', err);
    return {
      id: s.id,
      status: 'failed',
      stage: 'failed',
      failureKind: 'quote-http-error',
      errorMessage: err instanceof Error ? err.message : String(err),
      startedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - startedAt,
    };
  }
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
