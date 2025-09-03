/**
 * Chain Configuration
 */

import { UniversalAddress, toUniversalAddress } from '../core/types/universal-address';
import { AddressNormalizer } from '../core/utils/address-normalizer';
import { ChainType } from '../core/interfaces/intent';

export interface ChainConfig {
  id: bigint;
  name: string;
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
export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  // EVM Chains
  optimism: {
    id: 10n,
    name: 'Optimism',
    type: ChainType.EVM,
    rpcUrl: 'https://mainnet.optimism.io',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
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
    rpcUrl: 'https://mainnet.base.org',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  arbitrum: {
    id: 42161n,
    name: 'Arbitrum One',
    type: ChainType.EVM,
    rpcUrl: 'https://arb1.arbitrum.io/rpc',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
  },
  polygon: {
    id: 137n,
    name: 'Polygon',
    type: ChainType.EVM,
    rpcUrl: 'https://polygon-rpc.com',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    nativeCurrency: {
      name: 'MATIC',
      symbol: 'MATIC',
      decimals: 18,
    },
  },
  bsc: {
    id: 56n,
    name: 'BNB Smart Chain',
    type: ChainType.EVM,
    rpcUrl: 'https://bsc-dataseed.binance.org',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
  },
  avalanche: {
    id: 43114n,
    name: 'Avalanche',
    type: ChainType.EVM,
    rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    nativeCurrency: {
      name: 'Avalanche',
      symbol: 'AVAX',
      decimals: 18,
    },
  },
  
  // Testnet Chains
  'base-sepolia': {
    id: 84532n,
    name: 'Base Sepolia',
    type: ChainType.EVM,
    rpcUrl: 'https://sepolia.base.org',
    portalAddress: AddressNormalizer.normalize('0xBcdc2cfADcD6E026d4Da81D01D82BFa20bcf2CaC', ChainType.EVM),
    proverAddress: AddressNormalizer.normalize('0xdc9D0C27B0E76F3D7472aC7e10413667B12768Cc', ChainType.EVM),
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
    rpcUrl: 'https://sepolia.optimism.io',
    portalAddress: AddressNormalizer.normalize('0xBcdc2cfADcD6E026d4Da81D01D82BFa20bcf2CaC', ChainType.EVM),
    proverAddress: AddressNormalizer.normalize('0xdc9D0C27B0E76F3D7472aC7e10413667B12768Cc', ChainType.EVM),
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
    rpcUrl: 'https://api.trongrid.io',
    portalAddress: AddressNormalizer.normalizeTvm('TQh8ig6rmuMqb5u8efU5LDvoott1oLzoqu'),
    proverAddress: AddressNormalizer.normalizeTvm('TXBv2UfhyZteqbAvsempfa26Avo8LQz9iG'),
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
    rpcUrl: 'https://api.shasta.trongrid.io',
    portalAddress: AddressNormalizer.normalizeTvm('TKWwVSTacc9iToWgfef6cbkXPiBAKeSX2t'),
    proverAddress: AddressNormalizer.normalizeTvm('TAxmRePzN5XiBW99iF3vHQMwYzbXZjUHki'),
    nativeCurrency: {
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
    },
  },
  
  // SVM Chains
  solana: {
    id: 999999999n,
    name: 'Solana',
    type: ChainType.SVM,
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    portalAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    proverAddress: toUniversalAddress('0x' + '0'.repeat(64)), // Placeholder
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },
};

// Helper function to get chain by ID
export function getChainById(chainId: bigint): ChainConfig | undefined {
  return Object.values(CHAIN_CONFIGS).find(chain => chain.id === chainId);
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
    'PORTAL_ADDRESS_ETH': 'ethereum',
    'PORTAL_ADDRESS_OPTIMISM': 'optimism',
    'PORTAL_ADDRESS_BASE': 'base',
    'PORTAL_ADDRESS_TRON': 'tron',
    'PORTAL_ADDRESS_SOLANA': 'solana',
  };
  
  for (const [envKey, chainKey] of Object.entries(addressMappings)) {
    const address = env[envKey];
    if (address && CHAIN_CONFIGS[chainKey]) {
      try {
        const normalizedAddress = AddressNormalizer.normalize(
          address,
          CHAIN_CONFIGS[chainKey].type
        );
        CHAIN_CONFIGS[chainKey].portalAddress = normalizedAddress;
      } catch (error) {
        console.warn(`Failed to set portal address for ${chainKey}:`, error);
      }
    }
  }
}