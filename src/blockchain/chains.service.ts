import { Injectable, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@/config/config.service';
import { ChainConfig } from '@/shared/types';
import { RoutesCliError } from '@/shared/errors';

import { RAW_CHAIN_CONFIGS, RawChainConfig } from './chains.config';
import { AddressNormalizerService } from './address-normalizer.service';
import { ChainRegistryService } from './chain-registry.service';

@Injectable()
export class ChainsService implements OnModuleInit {
  private chains: ChainConfig[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly registry: ChainRegistryService,
  ) {}

  onModuleInit(): void {
    const env = this.config.getChainsEnv();
    this.chains = RAW_CHAIN_CONFIGS
      .filter(c => c.env === env || c.env === 'production')
      .map(c => this.normalizeChain(c));

    for (const chain of this.chains) {
      this.registry.registerChainId(chain.id);
    }
  }

  private normalizeChain(raw: RawChainConfig): ChainConfig {
    return {
      ...raw,
      portalAddress: raw.portalAddress
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? this.normalizer.normalize(raw.portalAddress as any, raw.type)
        : undefined,
      proverAddress: raw.proverAddress
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ? this.normalizer.normalize(raw.proverAddress as any, raw.type)
        : undefined,
    };
  }

  listChains(): ChainConfig[] {
    return this.chains;
  }

  getChainById(id: bigint): ChainConfig {
    const chain = this.chains.find(c => c.id === id);
    if (!chain) throw RoutesCliError.unsupportedChain(id);
    return chain;
  }

  findChainById(id: bigint): ChainConfig | undefined {
    return this.chains.find(c => c.id === id);
  }

  getChainByName(name: string): ChainConfig {
    const chain = this.chains.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!chain) throw RoutesCliError.unsupportedChain(name);
    return chain;
  }

  resolveChain(nameOrId: string): ChainConfig {
    if (/^\d+$/.test(nameOrId)) return this.getChainById(BigInt(nameOrId));
    return this.getChainByName(nameOrId);
  }
}
