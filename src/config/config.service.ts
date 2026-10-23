import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { Hex } from 'viem';

import { RoutesCliError } from '@/shared/errors';
import { ChainType } from '@/shared/types';

export type Ee528TestCase = 'destination-mixture' | 'source-mixture';

@Injectable()
export class ConfigService {
  constructor(private readonly config: NestConfigService) {}

  getEvmPrivateKey(): Hex | undefined {
    return this.config.get<Hex>('EVM_PRIVATE_KEY');
  }

  getTvmPrivateKey(): string | undefined {
    return this.config.get<string>('TVM_PRIVATE_KEY');
  }

  getSvmPrivateKey(): string | undefined {
    return this.config.get<string>('SVM_PRIVATE_KEY');
  }

  getKeyForChainType(chainType: ChainType): string | undefined {
    switch (chainType) {
      case ChainType.EVM:
        return this.getEvmPrivateKey();
      case ChainType.TVM:
        return this.getTvmPrivateKey();
      case ChainType.SVM:
        return this.getSvmPrivateKey();
    }
  }

  getRpcUrl(chainType: ChainType, variant: 'primary' | 'fallback' = 'primary'): string | undefined {
    const map: Record<ChainType, Record<'primary' | 'fallback', string>> = {
      [ChainType.EVM]: {
        primary: '',
        fallback: '',
      },
      [ChainType.TVM]: {
        primary: this.config.get<string>('TVM_RPC_URL') ?? 'https://api.trongrid.io',
        fallback: this.config.get<string>('TVM_RPC_URL_2') ?? 'https://tron.publicnode.com',
      },
      [ChainType.SVM]: {
        primary: this.config.get<string>('SVM_RPC_URL') ?? 'https://api.mainnet-beta.solana.com',
        fallback: this.config.get<string>('SVM_RPC_URL_2') ?? 'https://solana.publicnode.com',
      },
    };
    return map[chainType][variant] || undefined;
  }

  getQuoteEndpoint(): { url: string; type: 'solver-v2' | 'preprod' | 'production' } {
    if (this.getEe528TestCase()) {
      const configured = this.config.get<string>('SOLVER_URL');
      let solver: URL;
      try {
        solver = new URL(configured ?? '');
      } catch {
        throw RoutesCliError.configurationError('EE528_TEST_CASE requires an explicit SOLVER_URL');
      }
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(solver.hostname);
      const ee528 =
        solver.hostname === 'eco-solver-pr-528.eph.ecoinc.xyz' &&
        solver.protocol === 'https:' &&
        !solver.port;
      if (
        (!ee528 && !(local && ['http:', 'https:'].includes(solver.protocol))) ||
        solver.username ||
        solver.password ||
        solver.pathname !== '/' ||
        solver.search ||
        solver.hash
      ) {
        throw RoutesCliError.configurationError(
          'EE528_TEST_CASE requires the HTTPS EE528 solver origin or an explicit localhost test origin'
        );
      }
      if (this.getDappId() !== 'milkshake-ee528') {
        throw RoutesCliError.configurationError('EE528_TEST_CASE requires DAPP_ID=milkshake-ee528');
      }
      return { url: `${solver.origin}/api/v2/testing/split-quote`, type: 'solver-v2' };
    }
    const solverUrl = this.config.get<string>('SOLVER_URL')?.replace(/\/$/, '');
    if (solverUrl) {
      return { url: `${solverUrl}/api/v2/quote/reverse`, type: 'solver-v2' };
    }
    if (this.config.get('QUOTES_API_URL') || this.config.get('QUOTES_PREPROD')) {
      return { url: 'https://quotes-preprod.eco.com/api/v3/quotes/single', type: 'preprod' };
    }
    return { url: 'https://quotes.eco.com/api/v3/quotes/single', type: 'production' };
  }

  getEe528TestCase(): Ee528TestCase | undefined {
    const testCase = this.config.get<string>('EE528_TEST_CASE');
    if (testCase === undefined) return undefined;
    if (testCase === 'destination-mixture' || testCase === 'source-mixture') return testCase;
    throw RoutesCliError.configurationError(
      'EE528_TEST_CASE must be destination-mixture or source-mixture, or be unset'
    );
  }

  getDeadlineOffsetSeconds(): number {
    return this.config.get<number>('DEADLINE_OFFSET_SECONDS') ?? 9000;
  }

  getDappId(): string {
    return this.config.get<string>('DAPP_ID') ?? 'eco-routes-cli';
  }

  getChainsEnv(): 'production' | 'development' {
    return this.config.get<'production' | 'development'>('NODE_CHAINS_ENV') ?? 'production';
  }

  isDebug(): boolean {
    return !!this.config.get('DEBUG');
  }
}
