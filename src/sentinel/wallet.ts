/**
 * Sentinel Wallet Manager
 */

import { Keypair } from '@solana/web3.js';
import { Hex, PrivateKeyAccount } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress, SvmAddress } from '@/core/types/blockchain-addresses';

import { SentinelConfig } from './types';

export class WalletManager {
  private evmAccount?: PrivateKeyAccount;
  private evmPrivateKey?: string;
  private svmKeypair?: Keypair;
  private svmSecretKey?: string;

  constructor(config: SentinelConfig) {
    if (config.evm?.wallets.basic) {
      this.evmPrivateKey = config.evm.wallets.basic.privateKey;
      this.evmAccount = privateKeyToAccount(this.evmPrivateKey as Hex);
    }

    if (config.svm?.wallets.basic) {
      this.svmSecretKey = config.svm.wallets.basic.secretKey;
      if (this.svmSecretKey.startsWith('[')) {
        const bytes = JSON.parse(this.svmSecretKey);
        this.svmKeypair = Keypair.fromSecretKey(new Uint8Array(bytes));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const bs58 = require('bs58');
        this.svmKeypair = Keypair.fromSecretKey(bs58.decode(this.svmSecretKey));
      }
    }
  }

  getAddress(chainType: ChainType): BlockchainAddress {
    switch (chainType) {
      case ChainType.EVM:
        if (!this.evmAccount) throw new Error('No EVM wallet configured');
        return this.evmAccount.address;
      case ChainType.SVM:
        if (!this.svmKeypair) throw new Error('No SVM wallet configured');
        return this.svmKeypair.publicKey.toBase58() as SvmAddress;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  getPrivateKey(chainType: ChainType): string {
    switch (chainType) {
      case ChainType.EVM:
        if (!this.evmPrivateKey) throw new Error('No EVM wallet configured');
        return this.evmPrivateKey;
      case ChainType.SVM:
        if (!this.svmSecretKey) throw new Error('No SVM wallet configured');
        return this.svmSecretKey;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  hasWallet(chainType: ChainType): boolean {
    switch (chainType) {
      case ChainType.EVM:
        return !!this.evmAccount;
      case ChainType.SVM:
        return !!this.svmKeypair;
      default:
        return false;
    }
  }
}
