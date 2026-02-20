/**
 * Chain Configuration
 */

import { arbitrum, bsc, hyperEvm, mainnet, polygon, ronin, sonic } from 'viem/chains';

import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

/** Describes a supported blockchain and the configuration needed to interact with it. */
export interface ChainConfig {
  /** Numeric chain identifier (e.g. `1n` for Ethereum, `8453n` for Base). */
  id: bigint;
  /** Human-readable chain name (e.g. `"Ethereum"`, `"Base"`). */
  name: string;
  /**
   * Deployment environment filter.
   * `"production"` chains are loaded by default; `"development"` chains
   * are only included when `NODE_CHAINS_ENV=development`.
   */
  env: 'production' | 'development';
  /** VM model category: EVM, TVM (Tron), or SVM (Solana). */
  type: ChainType;
  /** Default RPC endpoint used when no override is supplied. */
  rpcUrl: string;
  /**
   * Universal-format address of the Eco Portal contract on this chain.
   * Required for publishing intents; omitted for chains where no Portal is deployed.
   */
  portalAddress?: UniversalAddress;
  /**
   * Universal-format address of the default prover contract.
   * Used when the caller does not supply an explicit `proverAddress` to a publisher.
   */
  proverAddress?: UniversalAddress;
  /** Metadata for the chain's native gas token. */
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Default chain configurations
const chains: Record<string, ChainConfig> = {
  // EVM Chains
  ethereum: {
    id: 1n,
    name: 'Ethereum',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: mainnet.rpcUrls.default.http[0],
    nativeCurrency: mainnet.nativeCurrency,
  },
  optimism: {
    id: 10n,
    name: 'Optimism',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.optimism.io',
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  bsc: {
    id: BigInt(bsc.id),
    name: bsc.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: bsc.rpcUrls.default.http[0],
    nativeCurrency: bsc.nativeCurrency,
  },
  base: {
    id: 8453n,
    name: 'Base',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.base.org',
    portalAddress: AddressNormalizer.normalize(
      '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97' as BlockchainAddress,
      ChainType.EVM
    ),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  arbitrum: {
    id: BigInt(arbitrum.id),
    name: arbitrum.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: arbitrum.rpcUrls.default.http[0],
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  polygon: {
    id: BigInt(polygon.id),
    name: polygon.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: polygon.rpcUrls.default.http[0],
    nativeCurrency: polygon.nativeCurrency,
  },
  ronin: {
    id: BigInt(ronin.id),
    name: ronin.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: ronin.rpcUrls.default.http[0],
    nativeCurrency: ronin.nativeCurrency,
  },

  sonic: {
    id: BigInt(sonic.id),
    name: sonic.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: sonic.rpcUrls.default.http[0],
    nativeCurrency: sonic.nativeCurrency,
  },

  hyperevm: {
    id: BigInt(hyperEvm.id),
    name: hyperEvm.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: hyperEvm.rpcUrls.default.http[0],
    nativeCurrency: hyperEvm.nativeCurrency,
  },

  // Testnet Chains
  'base-sepolia': {
    id: 84532n,
    name: 'Base Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://sepolia.base.org',
    portalAddress: AddressNormalizer.normalize(
      '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
      ChainType.EVM
    ),
    proverAddress: AddressNormalizer.normalize(
      '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      ChainType.EVM
    ),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  'optimism-sepolia': {
    id: 11155420n,
    name: 'Optimism Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://sepolia.optimism.io',
    portalAddress: AddressNormalizer.normalize(
      '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
      ChainType.EVM
    ),
    proverAddress: AddressNormalizer.normalize(
      '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      ChainType.EVM
    ),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  'plasma-testnet': {
    id: 9746n,
    name: 'Plasma Testnet',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.testnet.plasm.technology',
    portalAddress: AddressNormalizer.normalize(
      '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
      ChainType.EVM
    ),
    proverAddress: AddressNormalizer.normalize(
      '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      ChainType.EVM
    ),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  sepolia: {
    id: 11155111n,
    name: 'Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.sepolia.org',
    portalAddress: AddressNormalizer.normalize(
      '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
      ChainType.EVM
    ),
    proverAddress: AddressNormalizer.normalize(
      '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      ChainType.EVM
    ),
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },

  // TVM Chains
  tron: {
    id: 728126428n,
    name: 'Tron',
    type: ChainType.TVM,
    env: 'production',
    rpcUrl: 'https://api.trongrid.io',
    nativeCurrency: {
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
    },
  },
  'tron-shasta': {
    id: 2494104990n,
    name: 'Tron Shasta',
    type: ChainType.TVM,
    env: 'development',
    rpcUrl: 'https://api.shasta.trongrid.io',
    nativeCurrency: {
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
    },
  },

  // SVM Chains
  solana: {
    id: 1399811149n,
    name: 'Solana',
    type: ChainType.SVM,
    env: 'production',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },

  'solana-devnet': {
    id: 1399811150n, // Solana devnet chain ID (from onchain)
    name: 'Solana Devnet',
    type: ChainType.SVM,
    env: 'development',
    rpcUrl: 'https://api.devnet.solana.com',
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },
};

const ENV = process.env.NODE_CHAINS_ENV || 'production';
export const CHAIN_CONFIGS: typeof chains = Object.fromEntries(
  Object.entries(chains).filter(([, chain]) => chain.env === ENV)
);

/**
 * Finds a chain configuration by its numeric chain ID.
 *
 * Only searches chains included in the active {@link CHAIN_CONFIGS} set,
 * which is determined by `NODE_CHAINS_ENV` (default: `"production"`).
 *
 * @param chainId - The BigInt chain ID to look up.
 * @returns The matching {@link ChainConfig}, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const base = getChainById(8453n);
 * // base?.name === 'Base'
 * ```
 */
export function getChainById(chainId: bigint): ChainConfig | undefined {
  return Object.values(CHAIN_CONFIGS).find(chain => chain.id.toString() === chainId.toString());
}

/**
 * Finds a chain configuration by its key name (case-insensitive).
 *
 * @param name - The chain key, e.g. `"base"`, `"optimism"`, `"solana"`.
 * @returns The matching {@link ChainConfig}, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const chain = getChainByName('Optimism');
 * // chain?.id === 10n
 * ```
 */
export function getChainByName(name: string): ChainConfig | undefined {
  return CHAIN_CONFIGS[name.toLowerCase()];
}

/**
 * Returns all chains in the active configuration set.
 *
 * @returns An array of every {@link ChainConfig} currently loaded.
 *
 * @example
 * ```ts
 * listChains().forEach(c => console.log(c.name, c.id));
 * ```
 */
export function listChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS);
}

/**
 * Applies `PORTAL_ADDRESS_*` environment variable overrides to {@link CHAIN_CONFIGS}.
 *
 * Supported variables: `PORTAL_ADDRESS_ETH`, `PORTAL_ADDRESS_OPTIMISM`,
 * `PORTAL_ADDRESS_BASE`, `PORTAL_ADDRESS_TRON`, `PORTAL_ADDRESS_SOLANA`.
 *
 * Invalid addresses are logged as warnings and skipped rather than throwing.
 *
 * @param env - An env-variable map (typically `process.env`).
 *
 * @example
 * ```ts
 * process.env.PORTAL_ADDRESS_BASE = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97';
 * updatePortalAddresses(process.env);
 * // CHAIN_CONFIGS.base.portalAddress is now updated
 * ```
 */
export function updatePortalAddresses(env: Record<string, string | undefined>): void {
  const addressMappings: Record<string, string> = {
    PORTAL_ADDRESS_ETH: 'ethereum',
    PORTAL_ADDRESS_OPTIMISM: 'optimism',
    PORTAL_ADDRESS_BASE: 'base',
    PORTAL_ADDRESS_TRON: 'tron',
    PORTAL_ADDRESS_SOLANA: 'solana',
  };

  for (const [envKey, chainKey] of Object.entries(addressMappings)) {
    const address = env[envKey];
    if (address && CHAIN_CONFIGS[chainKey]) {
      try {
        CHAIN_CONFIGS[chainKey].portalAddress = AddressNormalizer.normalize(
          address as BlockchainAddress,
          CHAIN_CONFIGS[chainKey].type
        );
      } catch (error) {
        logger.warning(
          `Failed to set portal address for ${chainKey}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  }
}
