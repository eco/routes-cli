import { parseCli } from '@/scripts/source-swap-matrix/lib/cli';

const NO_ENV = {} as NodeJS.ProcessEnv;

describe('parseCli', () => {
  it('returns defaults when no flags or env are provided', () => {
    const opts = parseCli([], NO_ENV);
    expect(opts.staggerMs).toBe(3000);
    expect(opts.scenarioTimeoutMs).toBe(300_000);
    expect(opts.dryRun).toBe(false);
    expect(opts.sourcePortalScan).toBe(true);
    expect(opts.skipBalanceCheck).toBe(false);
    expect(opts.solverUrl).toBe('http://localhost:3000');
    expect(opts.include).toEqual([]);
    expect(opts.exclude).toEqual([]);
    expect(opts.amountOverrides).toEqual({});
  });

  it('parses --filter and --exclude as comma-separated lists', () => {
    const opts = parseCli(['--filter', 'SS-1,SS-3', '--exclude', 'SS-7,SS-8'], NO_ENV);
    expect(opts.include).toEqual(['SS-1', 'SS-3']);
    expect(opts.exclude).toEqual(['SS-7', 'SS-8']);
  });

  it('parses --scenario-amount key=value (repeatable)', () => {
    const opts = parseCli(
      ['--scenario-amount', 'SS-1=10000', '--scenario-amount', 'SS-3=2000000'],
      NO_ENV
    );
    expect(opts.amountOverrides).toEqual({
      'SS-1': 10_000n,
      'SS-3': 2_000_000n,
    });
  });

  it('honors SS{N}_AMOUNT env vars; CLI overrides env when both are set', () => {
    const opts = parseCli(['--scenario-amount', 'SS-1=99'], {
      SS1_AMOUNT: '1',
      SS2_AMOUNT: '2',
    } as NodeJS.ProcessEnv);
    expect(opts.amountOverrides).toEqual({ 'SS-1': 99n, 'SS-2': 2n });
  });

  it('parses boolean flags --dry-run, --no-source-portal-scan', () => {
    const opts = parseCli(['--dry-run', '--no-source-portal-scan'], NO_ENV);
    expect(opts.dryRun).toBe(true);
    expect(opts.sourcePortalScan).toBe(false);
  });

  it('honors STAGGER_MS and SCENARIO_TIMEOUT_MS env vars when no flag is given', () => {
    const opts = parseCli([], {
      STAGGER_MS: '5000',
      SCENARIOS_TIMEOUT_MS: 'irrelevant',
      SCENARIO_TIMEOUT_MS: '1000',
    } as NodeJS.ProcessEnv);
    expect(opts.staggerMs).toBe(5000);
    expect(opts.scenarioTimeoutMs).toBe(1000);
  });

  it('--solver-url flag wins over $SOLVER_URL', () => {
    const opts = parseCli(['--solver-url', 'https://example.com'], {
      SOLVER_URL: 'https://env.example',
    } as NodeJS.ProcessEnv);
    expect(opts.solverUrl).toBe('https://example.com');
  });

  it('throws on a malformed --scenario-amount value', () => {
    expect(() => parseCli(['--scenario-amount', 'SS-1'], NO_ENV)).toThrow(/scenario-amount/i);
  });
});
