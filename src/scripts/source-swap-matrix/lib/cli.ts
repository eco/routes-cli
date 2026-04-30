export interface CliOptions {
  include: string[];
  exclude: string[];
  staggerMs: number;
  scenarioTimeoutMs: number;
  amountOverrides: Record<string, bigint>;
  solverUrl: string;
  svmRpcUrl?: string;
  alchemyKey?: string;
  dryRun: boolean;
  sourcePortalScan: boolean;
  skipBalanceCheck: boolean;
  resultsDir: string;
}

function takeFlagValue(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx === argv.length - 1) return undefined;
  return argv[idx + 1];
}

function takeAllFlagValues(argv: string[], flag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] === flag) out.push(argv[i + 1]);
  }
  return out;
}

function commaSplit(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

function parseAmountOverride(spec: string): [string, bigint] {
  const eq = spec.indexOf('=');
  if (eq === -1) {
    throw new Error(`--scenario-amount expects ID=AMOUNT, got '${spec}'`);
  }
  return [spec.slice(0, eq), BigInt(spec.slice(eq + 1))];
}

export function parseCli(argv: string[], env: NodeJS.ProcessEnv): CliOptions {
  const include = commaSplit(takeFlagValue(argv, '--filter'));
  const exclude = commaSplit(takeFlagValue(argv, '--exclude'));

  const staggerMs = Number(takeFlagValue(argv, '--stagger') ?? env.STAGGER_MS ?? 3000);
  const scenarioTimeoutMs = Number(
    takeFlagValue(argv, '--timeout') ?? env.SCENARIO_TIMEOUT_MS ?? 300_000
  );

  const amountOverrides: Record<string, bigint> = {};
  for (let i = 1; i <= 8; i++) {
    const v = env[`SS${i}_AMOUNT`];
    if (v !== undefined) amountOverrides[`SS-${i}`] = BigInt(v);
  }
  for (const spec of takeAllFlagValues(argv, '--scenario-amount')) {
    const [id, amount] = parseAmountOverride(spec);
    amountOverrides[id] = amount;
  }

  return {
    include,
    exclude,
    staggerMs,
    scenarioTimeoutMs,
    amountOverrides,
    solverUrl: takeFlagValue(argv, '--solver-url') ?? env.SOLVER_URL ?? 'http://localhost:3000',
    svmRpcUrl: takeFlagValue(argv, '--svm-rpc-url') ?? env.SVM_RPC_URL,
    alchemyKey: takeFlagValue(argv, '--alchemy-key') ?? env.ALCHEMY_API_KEY ?? env.ALCHEMY_KEY,
    dryRun: argv.includes('--dry-run'),
    sourcePortalScan: !argv.includes('--no-source-portal-scan'),
    skipBalanceCheck: argv.includes('--skip-balance-check') || env.SKIP_BALANCE_CHECK === 'true',
    resultsDir: takeFlagValue(argv, '--results-dir') ?? env.RESULTS_DIR ?? 'results',
  };
}
