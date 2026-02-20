/**
 * Config Service
 *
 * Centralizes configuration initialization. Use `ConfigService.fromEnvironment()`
 * as the single initialization point; never call `updatePortalAddresses` at module scope.
 */

import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { CHAIN_CONFIGS, ChainConfig } from './chains';
import { EnvConfig, loadEnvConfig } from './env';
import { TOKEN_CONFIGS, TokenConfig } from './tokens';

export type ChainConfigs = Record<string, ChainConfig>;
export type TokenConfigs = Record<string, TokenConfig>;

const PORTAL_ADDRESS_ENV_MAP: Record<string, string> = {
  PORTAL_ADDRESS_ETH: 'ethereum',
  PORTAL_ADDRESS_OPTIMISM: 'optimism',
  PORTAL_ADDRESS_BASE: 'base',
  PORTAL_ADDRESS_TRON: 'tron',
  PORTAL_ADDRESS_SOLANA: 'solana',
};

export class ConfigService {
  constructor(
    private readonly chains: ChainConfigs,
    private readonly tokens: TokenConfigs,
    private readonly env: EnvConfig
  ) {}

  getChain(idOrName: bigint | string): ChainConfig | undefined {
    if (typeof idOrName === 'bigint') {
      return Object.values(this.chains).find(c => c.id === idOrName);
    }
    return this.chains[String(idOrName).toLowerCase()];
  }

  getToken(symbol: string, chainId: bigint): UniversalAddress | undefined {
    return this.tokens[symbol]?.addresses[chainId.toString()];
  }

  overridePortalAddress(chainId: bigint, address: UniversalAddress): void {
    const chain = Object.values(this.chains).find(c => c.id === chainId);
    if (chain) {
      chain.portalAddress = address;
    }
  }

  getEnv(): EnvConfig {
    return this.env;
  }

  /**
   * Creates a ConfigService from the current process environment.
   * Shallow-copies each ChainConfig so mutations don't affect the module-level CHAIN_CONFIGS,
   * then applies any PORTAL_ADDRESS_* env var overrides.
   */
  static fromEnvironment(): ConfigService {
    const chains: ChainConfigs = {};
    for (const [key, config] of Object.entries(CHAIN_CONFIGS)) {
      chains[key] = { ...config };
    }

    const envConfig = loadEnvConfig();

    for (const [envKey, chainKey] of Object.entries(PORTAL_ADDRESS_ENV_MAP)) {
      const address = process.env[envKey];
      if (address && chains[chainKey]) {
        try {
          chains[chainKey].portalAddress = AddressNormalizer.normalize(
            address as BlockchainAddress,
            chains[chainKey].type
          );
        } catch (error) {
          logger.warning(
            `Failed to set portal address for ${chainKey}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }
    }

    return new ConfigService(chains, TOKEN_CONFIGS, envConfig);
  }
}
