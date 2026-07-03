/**
 * Derive the public address for a private key on a given VM family.
 *
 * Mirrors the derivation used by `publish.command` (EVM via viem, TVM via
 * TronWeb, SVM via a Keypair parsed from JSON array / comma list / base58).
 */

import { Keypair } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ChainType } from '@/shared/types';

export function deriveAddress(key: string, chainType: ChainType): string {
  switch (chainType) {
    case ChainType.EVM:
      return privateKeyToAccount(key as Hex).address;
    case ChainType.TVM:
      return TronWeb.address.fromPrivateKey(key.replace(/^0x/, '')) as string;
    case ChainType.SVM: {
      let keypair: Keypair;
      if (key.startsWith('[') && key.endsWith(']')) {
        keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(key) as number[]));
      } else if (key.includes(',')) {
        keypair = Keypair.fromSecretKey(
          new Uint8Array(key.split(',').map(b => parseInt(b.trim())))
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const bs58 = require('bs58') as { decode: (s: string) => Uint8Array };
        keypair = Keypair.fromSecretKey(bs58.decode(key));
      }
      return keypair.publicKey.toBase58();
    }
  }
}
