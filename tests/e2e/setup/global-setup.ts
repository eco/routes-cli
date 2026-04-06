import { execFileSync } from 'child_process';
import path from 'path';

import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const COMPOSE_FILE = path.resolve(__dirname, '../docker-compose.e2e.yml');
const ANVIL_URL = 'http://localhost:8545';
const MAX_WAIT_MS = 60_000;

export default async function globalSetup(): Promise<void> {
  if (!process.env.FORK_RPC_URL) {
    throw new Error(
      'E2E tests require FORK_RPC_URL (Base mainnet archive RPC).\n' +
        'Set it in your .env or run: FORK_RPC_URL=https://... pnpm test:e2e'
    );
  }

  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d'], { stdio: 'inherit' });

  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(ANVIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      if (res.ok) {
        process.stderr.write('[E2E] Anvil fork of Base mainnet is ready\n');
        return;
      }
    } catch {
      /* not ready yet */
    }
    await new Promise(r => setTimeout(r, 1_000));
  }
  throw new Error(`Anvil did not become ready within ${MAX_WAIT_MS / 1000}s`);
}
