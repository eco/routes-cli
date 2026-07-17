import { spawnSync } from 'node:child_process';

import { utils } from '@coral-xyz/anchor';
import { Keypair } from '@solana/web3.js';

describe('deriveAddress', () => {
  it('derives an SVM address from a base58 secret key in the standalone CLI runtime', () => {
    const keypair = Keypair.fromSeed(new Uint8Array(32).fill(7));
    const secretKey = utils.bytes.bs58.encode(keypair.secretKey);
    const script = `
      const { deriveAddress } = require('./src/shared/security/derive-address');
      const { ChainType } = require('./src/shared/types');
      process.stdout.write(deriveAddress(${JSON.stringify(secretKey)}, ChainType.SVM));
    `;
    const result = spawnSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', '-e', script],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
      }
    );

    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(keypair.publicKey.toBase58());
  });
});
