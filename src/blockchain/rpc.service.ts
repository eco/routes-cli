import { Injectable } from '@nestjs/common';

import { ConfigService } from '@/config/config.service';
import { RoutesCliError } from '@/shared/errors';
import { ChainConfig, ChainType } from '@/shared/types';

import 'dotenv/config';

import { RAW_CHAIN_CONFIGS } from './chains.config';

// Chain catalog endpoints describe network metadata; they are public/shared and
// must never become runtime defaults, including after a private endpoint fails.
const PUBLIC_RPC_HOSTS = new Set([
  ...RAW_CHAIN_CONFIGS.map(chain => new URL(chain.rpcUrl).hostname),
  'solana.publicnode.com',
  'tron.publicnode.com',
]);

@Injectable()
export class RpcService {
  constructor(private readonly config: ConfigService) {}

  getUrl(chain: ChainConfig): string {
    // 1. Per-chain override: EVM_RPC_URL_{CHAIN_ID} (e.g. EVM_RPC_URL_8453)
    // Uses process.env directly because Zod strips unknown keys during validation.
    if (chain.type === ChainType.EVM) {
      const perChainUrl = process.env[`EVM_RPC_URL_${chain.id}`]?.trim();
      if (perChainUrl) return this.validateUrl(perChainUrl, chain);
    }
    // 2. Explicit chain-type endpoint; absence fails before a client is built.
    const envOverride = this.config.getRpcUrl(chain.type, 'primary')?.trim();
    if (envOverride) return this.validateUrl(envOverride, chain);
    const variable =
      chain.type === ChainType.EVM
        ? `EVM_RPC_URL_${chain.id} (or EVM_RPC_URL)`
        : `${chain.type}_RPC_URL`;
    throw RoutesCliError.configurationError(
      `No RPC configured for ${chain.name} (${chain.id}). Set ${variable} to a dedicated provider endpoint.`
    );
  }

  getFallbackUrl(chain: ChainConfig): string | undefined {
    const url = this.config.getRpcUrl(chain.type, 'fallback')?.trim();
    return url ? this.validateUrl(url, chain) : undefined;
  }

  private validateUrl(url: string, chain: ChainConfig): string {
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      // URLs may embed credentials. Never include their value in error output.
      throw RoutesCliError.configurationError(
        `Invalid RPC endpoint for ${chain.name} (${chain.id}).`
      );
    }
    if (PUBLIC_RPC_HOSTS.has(parsed.hostname.toLowerCase().replace(/\.$/, ''))) {
      throw RoutesCliError.configurationError(
        `Public RPC endpoints are not permitted for ${chain.name} (${chain.id}); configure a dedicated provider endpoint.`
      );
    }
    return url;
  }

  async withFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch {
      return fallback();
    }
  }
}
