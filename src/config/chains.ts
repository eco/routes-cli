/**
 * Chain Configuration
 */

import { arbitrum } from 'viem/chains';

import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

export interface ChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: UniversalAddress;
  proverAddress?: UniversalAddress;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

// Default chain configurations
const chains: Record<string, ChainConfig> = {
  // EVM Chains
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
  base: {
    id: 8453n,
    name: 'Base',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.base.org',
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

  // Testnet Chains
  'base-sepolia': {
    id: 84532n,
    name: 'Base Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://sepolia.base.org',
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

// Helper function to get chain by ID
export function getChainById(chainId: bigint): ChainConfig | undefined {
  return Object.values(CHAIN_CONFIGS).find(chain => chain.id.toString() === chainId.toString());
}

// Helper function to get chain by name
export function getChainByName(name: string): ChainConfig | undefined {
  return CHAIN_CONFIGS[name.toLowerCase()];
}

// Helper function to list all supported chains
export function listChains(): ChainConfig[] {
  return Object.values(CHAIN_CONFIGS);
}

// Update Portal address from environment if available
export function updatePortalAddresses(env: Record<string, string | undefined>) {
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
