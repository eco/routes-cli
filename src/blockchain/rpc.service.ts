import { Injectable } from '@nestjs/common';

import { ConfigService } from '@/config/config.service';
import { ChainConfig } from '@/shared/types';

@Injectable()
export class RpcService {
  constructor(private readonly config: ConfigService) {}

  getUrl(chain: ChainConfig): string {
    // Chain-specific RPC overrides env override default
    const envOverride = this.config.getRpcUrl(chain.type, 'primary');
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
