/**
 * Key Provider
 *
 * Derives private keys from environment and derives wallet addresses from private keys.
 */

import { Keypair } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { loadEnvConfig } from '@/config/env';
import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress, SvmAddress, TronAddress } from '@/core/types/blockchain-addresses';

export function getPrivateKey(chainType: ChainType, override?: string): string {
  if (override) return override;

  const env = loadEnvConfig();
  let key: string | undefined;

  switch (chainType) {
    case ChainType.EVM:
      key = env.evmPrivateKey;
      break;
    case ChainType.TVM:
      key = env.tvmPrivateKey;
      break;
    case ChainType.SVM:
      key = env.svmPrivateKey;
      break;
    default:
      throw new Error(`Unknown chain type: ${chainType}`);
  }

  if (!key) {
    throw new Error(`No private key configured for ${chainType} chain`);
  }

  return key;
}

export function getWalletAddress(chainType: ChainType, privateKey: string): BlockchainAddress {
  switch (chainType) {
    case ChainType.EVM:
      return privateKeyToAccount(privateKey as Hex).address;
    case ChainType.TVM: {
      const addr = TronWeb.address.fromPrivateKey(privateKey);
      if (!addr) throw new Error('Invalid Tron private key');
      return addr as TronAddress;
    }
    case ChainType.SVM: {
      let keypair: Keypair;
      if (privateKey.startsWith('[')) {
        keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(privateKey) as number[]));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const bs58 = require('bs58') as { decode: (s: string) => Uint8Array };
        keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
      }
      return keypair.publicKey.toBase58() as SvmAddress;
    }
    default:
      throw new Error(`Unknown chain type: ${chainType}`);
  }
}
