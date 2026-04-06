import { Injectable } from '@nestjs/common';

import { ConfigService } from '@/config/config.service';
import { ChainConfig, ChainType } from '@/shared/types';

import 'dotenv/config';

@Injectable()
export class RpcService {
  constructor(private readonly config: ConfigService) {}

  getUrl(chain: ChainConfig): string {
    // 1. Per-chain override: EVM_RPC_URL_{CHAIN_ID} (e.g. EVM_RPC_URL_8453)
    // Uses process.env directly because Zod strips unknown keys during validation.
    if (chain.type === ChainType.EVM) {
      const perChainUrl = process.env[`EVM_RPC_URL_${chain.id}`];
      if (perChainUrl) return perChainUrl;
    }
    // 2. Chain-type override (TVM_RPC_URL, SVM_RPC_URL)
    const envOverride = this.config.getRpcUrl(chain.type, 'primary');
    // 3. Hardcoded chain default
    return envOverride || chain.rpcUrl;
  }

  getFallbackUrl(chain: ChainConfig): string | undefined {
    return this.config.getRpcUrl(chain.type, 'fallback') || undefined;
  }

  async withFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
    try {
      return await primary();
    } catch {
      return fallback();
    }
  }
}
