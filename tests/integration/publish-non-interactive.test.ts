import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
// Well-known public anvil dev key (account 0) — already used across this repo's tests.
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const PORTAL = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97';

const FULL_FLAGS = [
  '--source',
  'base',
  '--destination',
  'optimism',
  '--reward-token',
  'USDC',
  '--route-token',
  'USDC',
  '--amount',
  '1',
  '--route-amount',
  '1',
  '--recipient',
  RECIPIENT,
  '--portal-address',
  PORTAL,
  '--dry-run',
];

function runCli(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(
    'npx',
    [
      'ts-node',
      '--transpile-only',
      '-r',
      'tsconfig-paths/register',
      'src/main.ts',
      'publish',
      ...args,
    ],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      input: '', // piped stdin → not a TTY
      timeout: 120_000,
      env: {
        ...process.env,
        SOLVER_URL: 'http://127.0.0.1:9', // unroutable → quote fails fast → manual fallback
        EVM_PRIVATE_KEY: TEST_PRIVATE_KEY,
      },
    }
  );
}

describe('publish non-interactive (spawned CLI, no TTY)', () => {
  jest.setTimeout(180_000);

  it('fully-specified --dry-run --json exits 0 with parseable JSON on stdout', () => {
    const res = runCli([...FULL_FLAGS, '--json']);
    expect(res.status).toBe(0);
    const payload = JSON.parse(res.stdout.trim()) as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(payload.transactionHash).toBeUndefined();
    expect(payload.sourceChainId).toBe('8453');
    expect(payload.destinationChainId).toBe('10');
  });

  it('missing --reward-token exits non-zero and names the flag', () => {
    const args = FULL_FLAGS.filter(
      (a, i) => !(a === '--reward-token' || FULL_FLAGS[i - 1] === '--reward-token')
    ).filter((a, i, arr) => !(a === '--amount' || arr[i - 1] === '--amount'));
    const res = runCli(args);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('--reward-token');
  });

  it('with only an unreachable ECO_API_URL set, the gateway quote fails and the manual route still dry-runs', () => {
    const env: NodeJS.ProcessEnv = { ...process.env, EVM_PRIVATE_KEY: TEST_PRIVATE_KEY };
    delete env.SOLVER_URL;
    delete env.QUOTES_API_URL;
    delete env.QUOTES_PREPROD;
    env.ECO_API_URL = 'http://127.0.0.1:9'; // unroutable → EcoApiRequestError → manual fallback
    const res = spawnSync(
      'npx',
      [
        'ts-node',
        '--transpile-only',
        '-r',
        'tsconfig-paths/register',
        'src/main.ts',
        'publish',
        ...FULL_FLAGS,
        '--json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8', input: '', timeout: 120_000, env }
    );
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('Quote failed');
    expect(res.stderr).toContain('127.0.0.1:9');
    const payload = JSON.parse(res.stdout.trim()) as Record<string, unknown>;
    expect(payload.dryRun).toBe(true);
  });

  it('rejects the removed --rpc flag', () => {
    const res = runCli([...FULL_FLAGS, '--rpc', 'http://localhost:8545']);
    expect(res.status).not.toBe(0);
    expect(`${res.stderr}${res.stdout}`).toContain('rpc');
  });
});
