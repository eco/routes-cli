import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { Hex } from 'viem';

import { ChainType } from '@/shared/types';

export type GatewayEnv = 'production' | 'staging';

export type QuoteEndpoint =
  | { type: 'solver-v2'; url: string }
  | { type: 'custom'; url: string }
  | { type: 'gateway'; baseUrl: string; env: GatewayEnv; apiKey?: string };

const GATEWAY_HOSTS: Record<GatewayEnv, string> = {
  production: 'https://api.eco.com',
  staging: 'https://api.stag.eco.com',
};

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

  /**
   * Quote source, highest priority first:
   *   1. SOLVER_URL      — solver-v2 API at {SOLVER_URL}/api/v2/quote/reverse
   *   2. QUOTES_API_URL  — this exact URL, quote-service v3 shape
   *   3. QUOTES_PREPROD  — the preprod quote service (v3 shape)
   *   4. Eco API gateway — POST {baseUrl}/v1/quotes (default)
   */
  getQuoteEndpoint(envOverride?: GatewayEnv): QuoteEndpoint {
    const solverUrl = this.config.get<string>('SOLVER_URL')?.replace(/\/$/, '');
    if (solverUrl) {
      return { url: `${solverUrl}/api/v2/quote/reverse`, type: 'solver-v2' };
    }
    const quotesUrl = this.config.get<string>('QUOTES_API_URL');
    if (quotesUrl) {
      return { url: quotesUrl, type: 'custom' };
    }
    if (this.config.get('QUOTES_PREPROD')) {
      return { url: 'https://quotes-preprod.eco.com/api/v3/quotes/single', type: 'custom' };
    }
    const { baseUrl, env } = this.getGatewayBaseUrl(envOverride);
    const apiKey = this.getApiKey(env);
    return { type: 'gateway', baseUrl, env, ...(apiKey && { apiKey }) };
  }

  /** Gateway host: ECO_API_URL wins, else the ECO_ENV (or per-command override) host map. */
  getGatewayBaseUrl(envOverride?: GatewayEnv): { baseUrl: string; env: GatewayEnv } {
    const env = envOverride ?? this.config.get<GatewayEnv>('ECO_ENV') ?? 'production';
    const override = this.config.get<string>('ECO_API_URL')?.replace(/\/$/, '');
    return { baseUrl: override ?? GATEWAY_HOSTS[env], env };
  }

  /** API key for one gateway environment: ECO_API_KEY_<ENV>, else the ECO_API_KEY fallback. */
  getApiKey(env: GatewayEnv): string | undefined {
    return (
      this.config.get<string>(`ECO_API_KEY_${env.toUpperCase()}`) ??
      this.config.get<string>('ECO_API_KEY')
    );
  }

  getDeadlineOffsetSeconds(): number {
    return this.config.get<number>('DEADLINE_OFFSET_SECONDS') ?? 9000;
  }

  getRewardDeadlineBufferSeconds(): number {
    return this.config.get<number>('REWARD_DEADLINE_BUFFER_SECONDS') ?? 87000;
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
