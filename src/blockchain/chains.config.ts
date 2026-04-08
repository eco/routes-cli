import { arbitrum, bsc, hyperEvm, mainnet, polygon, ronin, sonic } from 'viem/chains';

import { ChainType } from '@/shared/types';

export interface RawChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: string; // raw string, normalized lazily by ChainsService
  proverAddress?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const RAW_CHAIN_CONFIGS: RawChainConfig[] = [
  // EVM - Production
  {
    id: BigInt(mainnet.id),
    name: 'Ethereum',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: mainnet.rpcUrls.default.http[0],
    nativeCurrency: mainnet.nativeCurrency,
  },
  {
    id: 10n,
    name: 'Optimism',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.optimism.io',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(bsc.id),
    name: bsc.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: bsc.rpcUrls.default.http[0],
    nativeCurrency: bsc.nativeCurrency,
  },
  {
    id: 8453n,
    name: 'Base',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.base.org',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(arbitrum.id),
    name: arbitrum.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: arbitrum.rpcUrls.default.http[0],
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(polygon.id),
    name: polygon.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: polygon.rpcUrls.default.http[0],
    nativeCurrency: polygon.nativeCurrency,
  },
  {
    id: BigInt(ronin.id),
    name: ronin.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: ronin.rpcUrls.default.http[0],
    nativeCurrency: ronin.nativeCurrency,
  },
  {
    id: BigInt(sonic.id),
    name: sonic.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: sonic.rpcUrls.default.http[0],
    nativeCurrency: sonic.nativeCurrency,
  },
  {
    id: BigInt(hyperEvm.id),
    name: hyperEvm.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: hyperEvm.rpcUrls.default.http[0],
    nativeCurrency: hyperEvm.nativeCurrency,
  },

  // EVM - Development
  {
    id: 84532n,
    name: 'Base Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://sepolia.base.org',
    proverAddress: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 11155420n,
    name: 'Optimism Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://sepolia.optimism.io',
    proverAddress: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 9746n,
    name: 'Plasma Testnet',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.testnet.plasm.technology',
    proverAddress: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 11155111n,
    name: 'Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.sepolia.org',
    proverAddress: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // TVM
  {
    id: 728126428n,
    name: 'Tron',
    type: ChainType.TVM,
    env: 'production',
    rpcUrl: 'https://api.trongrid.io',
    nativeCurrency: { name: 'Tron', symbol: 'TRX', decimals: 6 },
  },
  {
    id: 2494104990n,
    name: 'Tron Shasta',
    type: ChainType.TVM,
    env: 'development',
    rpcUrl: 'https://api.shasta.trongrid.io',
    nativeCurrency: { name: 'Tron', symbol: 'TRX', decimals: 6 },
  },

  // SVM
  {
    id: 1399811149n,
    name: 'Solana',
    type: ChainType.SVM,
    env: 'production',
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  },
  {
    id: 1399811150n,
    name: 'Solana Devnet',
    type: ChainType.SVM,
    env: 'development',
    rpcUrl: 'https://api.devnet.solana.com',
    nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
  },
];
