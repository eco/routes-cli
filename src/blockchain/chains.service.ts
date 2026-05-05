import { Injectable, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@/config/config.service';
import { RoutesCliError } from '@/shared/errors';
import { ChainConfig } from '@/shared/types';

import { AddressNormalizerService } from './address-normalizer.service';
import { ChainRegistryService } from './chain-registry.service';
import { RAW_CHAIN_CONFIGS, RawChainConfig } from './chains.config';

@Injectable()
export class ChainsService implements OnModuleInit {
  private chains: ChainConfig[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly registry: ChainRegistryService
  ) {}

  onModuleInit(): void {
    const env = this.config.getChainsEnv();
    this.chains = RAW_CHAIN_CONFIGS.filter(c => c.env === env || c.env === 'production').map(c =>
      this.normalizeChain(c)
    );

    ChainsService.validateFacadeReferences(this.chains, env);

    for (const chain of this.chains) {
      this.registry.registerChainId(chain.id);
    }
  }

  // Asserts that every facade chain in the list points at a loaded, non-facade
  // chain. Catches: unresolved fulfillmentChainId, fulfillment chain filtered
  // out by env, and chained delegation (facade → facade).
  static validateFacadeReferences(chains: ChainConfig[], env: string): void {
    for (const chain of chains) {
      if (chain.fulfillmentChainId === undefined) continue;
      const target = chains.find(c => c.id === chain.fulfillmentChainId);
      if (!target) {
        throw new Error(
          `Chain "${chain.name}" (${chain.id}) has fulfillmentChainId ${chain.fulfillmentChainId} ` +
            `which is not loaded in env "${env}". Add the target chain or remove the facade.`
        );
      }
      if (target.fulfillmentChainId !== undefined) {
        throw new Error(
          `Chain "${chain.name}" (${chain.id}) delegates to "${target.name}" (${target.id}), ` +
            `which is itself a facade. Chained delegation is not supported.`
        );
      }
    }
  }

  private normalizeChain(raw: RawChainConfig): ChainConfig {
    return {
      ...raw,
      portalAddress: raw.portalAddress
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.normalizer.normalize(raw.portalAddress as any, raw.type)
        : undefined,
      proverAddress: raw.proverAddress
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.normalizer.normalize(raw.proverAddress as any, raw.type)
        : undefined,
    };
  }

  listChains(): ChainConfig[] {
    return this.chains;
  }

  listSourceChains(): ChainConfig[] {
    return this.chains.filter(c => c.fulfillmentChainId === undefined);
  }

  getOperationalChain(chain: ChainConfig): ChainConfig {
    if (chain.fulfillmentChainId === undefined) return chain;
    return this.getChainById(chain.fulfillmentChainId);
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
