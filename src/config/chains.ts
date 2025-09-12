/**
 * Chain Configuration
 */

import { UniversalAddress } from '../core/types/universal-address';
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
    portalAddress: AddressNormalizer.normalizeEvm('0x90F0c8aCC1E083Bcb4F487f84FC349ae8d5e28D7'),
    // proverAddress: AddressNormalizer.normalizeEvm('0xe6FEbF8C8bf6366eF6fE7337b0b5B394D46d9fc6'), // PolymerProver
    proverAddress: AddressNormalizer.normalizeEvm('0xde255Aab8e56a6Ae6913Df3a9Bbb6a9f22367f4C'), // HyperProver
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
    portalAddress: AddressNormalizer.normalizeEvm('0x90F0c8aCC1E083Bcb4F487f84FC349ae8d5e28D7'),
    // proverAddress: AddressNormalizer.normalizeEvm('0xe6FEbF8C8bf6366eF6fE7337b0b5B394D46d9fc6'), // Polymer
    proverAddress: AddressNormalizer.normalizeEvm('0xde255Aab8e56a6Ae6913Df3a9Bbb6a9f22367f4C'), // HyperProver
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
    rpcUrl: 'https://sepolia.base.org',
    portalAddress: AddressNormalizer.normalize(
      '0xBcdc2cfADcD6E026d4Da81D01D82BFa20bcf2CaC',
      ChainType.EVM
    ),
    proverAddress: AddressNormalizer.normalize(
      '0xdc9D0C27B0E76F3D7472aC7e10413667B12768Cc',
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
    rpcUrl: 'https://sepolia.optimism.io',
    portalAddress: AddressNormalizer.normalize(
      '0xBcdc2cfADcD6E026d4Da81D01D82BFa20bcf2CaC',
      ChainType.EVM
    ),
    proverAddress: AddressNormalizer.normalize(
      '0xdc9D0C27B0E76F3D7472aC7e10413667B12768Cc',
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
    rpcUrl: 'https://api.trongrid.io',
    portalAddress: AddressNormalizer.normalizeTvm('TQh8ig6rmuMqb5u8efU5LDvoott1oLzoqu'),
    proverAddress: AddressNormalizer.normalizeTvm('TSqwDT8qxNgExrkKu6qBo1XLjd5CdSYf2X'),
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
    proverAddress: AddressNormalizer.normalizeTvm('TAxmRePzN5XiBW99iF3vHQMwYzbXZjUHki'), // Dummy prover
    nativeCurrency: {
      name: 'Tron',
      symbol: 'TRX',
      decimals: 6,
    },
  },

  // SVM Chains
  solana: {
    id: 1399811149n, // Solana mainnet chain ID
    name: 'Solana',
    type: ChainType.SVM,
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    portalAddress: AddressNormalizer.normalizeSvm('7rNRf9CW4jwzS52kXUDtf1pG1rUPfho7tFxgjy2J6cLe'), // Portal program ID
    proverAddress: AddressNormalizer.normalizeSvm('DuZmeMYwc3tagKxQu2ZbRY7xoSsosFfjx5TNmWafCrkU'), // hyper prover
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },

  'solana-devnet': {
    id: 1399811150n, // Solana devnet chain ID
    name: 'Solana Devnet',
    type: ChainType.SVM,
    rpcUrl: 'https://api.devnet.solana.com',
    portalAddress: AddressNormalizer.normalizeSvm('5nCJDkRg8mhj9XHkjuFoR6Mcs6VcDZVsCbZ7pTJhRFEF'), // Portal program ID
    proverAddress: AddressNormalizer.normalizeSvm('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'), // dummy prover
    nativeCurrency: {
      name: 'Solana',
      symbol: 'SOL',
      decimals: 9,
    },
  },
};

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
          address,
          CHAIN_CONFIGS[chainKey].type
        );
      } catch (error) {
        console.warn(`Failed to set portal address for ${chainKey}:`, error);
      }
    }
  }
}
