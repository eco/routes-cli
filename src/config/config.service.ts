import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

import { Hex } from 'viem';

import { RoutesCliError } from '@/shared/errors';
import { ChainType } from '@/shared/types';

export type GatewayEnv = 'production' | 'staging';

export type QuoteEndpoint =
  | { type: 'solver-v2'; url: string }
  | { type: 'quotes-v4'; baseUrl: string }
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
        primary: this.config.get<string>('EVM_RPC_URL') ?? '',
        fallback: this.config.get<string>('EVM_RPC_URL_2') ?? '',
      },
      [ChainType.TVM]: {
        primary: this.config.get<string>('TVM_RPC_URL') ?? '',
        fallback: this.config.get<string>('TVM_RPC_URL_2') ?? '',
      },
      [ChainType.SVM]: {
        primary: this.config.get<string>('SVM_RPC_URL') ?? '',
        fallback: this.config.get<string>('SVM_RPC_URL_2') ?? '',
      },
    };
    return map[chainType][variant] || undefined;
  }

  /**
   * Quote source, highest priority first:
   *   1. SOLVER_URL      — solver-v2 API at {SOLVER_URL}/api/v2/quote/reverse
   *   2. QUOTES_API_URL  — an eco-quotes host (https://quotes.eco.com or
   *                        https://quotes.stag.eco.com); the CLI calls the
   *                        keyless {host}/v4/quotes endpoint. Quote-service v3
   *                        URLs (/api/v3/...) retire on 2026-12-01 and are
   *                        rejected at configuration time.
   *   3. Eco API gateway — POST {baseUrl}/v1/quotes (default)
   */
  getQuoteEndpoint(envOverride?: GatewayEnv): QuoteEndpoint {
    const solverUrl = this.config.get<string>('SOLVER_URL')?.replace(/\/$/, '');
    if (solverUrl) {
      return { url: `${solverUrl}/api/v2/quote/reverse`, type: 'solver-v2' };
    }
    const quotesUrl = this.config.get<string>('QUOTES_API_URL');
    if (quotesUrl) {
      const invalidUrl = (): RoutesCliError =>
        RoutesCliError.configurationError(
          'QUOTES_API_URL must be an eco-quotes host such as https://quotes.eco.com; ' +
            'quote-service v3 URLs (/api/v3/...) retire on 2026-12-01 and the CLI now ' +
            'calls <host>/v4/quotes'
        );
      let parsed: URL;
      try {
        parsed = new URL(quotesUrl);
      } catch {
        throw invalidUrl();
      }
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.pathname !== '/' ||
        parsed.username ||
        parsed.password ||
        parsed.search ||
        parsed.hash
      ) {
        throw invalidUrl();
      }
      return { type: 'quotes-v4', baseUrl: parsed.origin };
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
