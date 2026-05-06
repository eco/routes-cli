import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { Hex } from 'viem';

import { ChainType } from '@/shared/types';

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

  getQuoteEndpoint(): {
    url: string;
    type: 'solver-v2' | 'gateway' | 'custom' | 'production';
    apiKey?: string;
  } {
    const solverUrl = this.config.get<string>('SOLVER_URL');
    if (solverUrl) {
      return {
        url: `${solverUrl}/api/v2/quote/reverse`,
        type: 'solver-v2',
        apiKey: this.config.get<string>('QUOTES_API_KEY'),
      };
    }
    const gatewayUrl = this.config.get<string>('API_GATEWAY_URL');
    if (gatewayUrl) {
      return {
        url: gatewayUrl,
        type: 'gateway',
        apiKey: this.config.get<string>('API_GATEWAY_KEY'),
      };
    }
    const endpointUrl = this.config.get<string>('QUOTES_ENDPOINT_URL');
    if (endpointUrl) {
      return {
        url: endpointUrl,
        type: 'custom',
        apiKey: this.config.get<string>('QUOTES_API_KEY'),
      };
    }
    return {
      url: 'https://quotes.eco.com/api/v3/quotes/single',
      type: 'production',
      apiKey: this.config.get<string>('QUOTES_API_KEY'),
    };
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
