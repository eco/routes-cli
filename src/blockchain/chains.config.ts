import { arbitrum, bsc, hyperEvm, mainnet, polygon, ronin, sonic } from 'viem/chains';

import { ChainType } from '@/shared/types';

export interface RawChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: string; // raw string, normalized lazily by ChainsService
  provers?: Record<string, string>;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const RAW_CHAIN_CONFIGS: RawChainConfig[] = [
  // EVM - Production
  {
    id: BigInt(mainnet.id),
    name: 'Ethereum',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    portalAddress: '0xfD12115CD8F37C7667050eD8499EDa6B9d9c03bA', // preprod portal
    provers: { LayerZero: '0xc20c5c9f9311d8446f0345F8727066DaF1e3e06A' },
    nativeCurrency: mainnet.nativeCurrency,
  },
  {
    id: 10n,
    name: 'Optimism',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.optimism.io',
    portalAddress: '0xfD12115CD8F37C7667050eD8499EDa6B9d9c03bA', // preprod portal
    provers: { LayerZero: '0xc20c5c9f9311d8446f0345F8727066DaF1e3e06A' },
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
    portalAddress: '0xfD12115CD8F37C7667050eD8499EDa6B9d9c03bA', // preprod portal
    provers: { LayerZero: '0xc20c5c9f9311d8446f0345F8727066DaF1e3e06A' },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(arbitrum.id),
    name: arbitrum.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: arbitrum.rpcUrls.default.http[0],
    portalAddress: '0xfD12115CD8F37C7667050eD8499EDa6B9d9c03bA', // preprod portal
    provers: { LayerZero: '0xc20c5c9f9311d8446f0345F8727066DaF1e3e06A' },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(polygon.id),
    name: polygon.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://polygon.drpc.org',
    portalAddress: '0xfD12115CD8F37C7667050eD8499EDa6B9d9c03bA', // preprod portal
    provers: { LayerZero: '0xc20c5c9f9311d8446f0345F8727066DaF1e3e06A' },
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
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97',
    provers: {
      Hyperlane: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      LayerZero: '0x5Ae3569c6f5B6F80aa8f234AEf4b9c00b43aC32A',
    },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 11155420n,
    name: 'Optimism Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://sepolia.optimism.io',
    portalAddress: '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
    provers: {
      Hyperlane: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      LayerZero: '0x0000000000000000000000000000000000000000', // TODO
    },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 9746n,
    name: 'Plasma Testnet',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.testnet.plasm.technology',
    portalAddress: '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
    provers: {
      Hyperlane: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      LayerZero: '0x0000000000000000000000000000000000000000', // TODO
    },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 11155111n,
    name: 'Sepolia',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.sepolia.org',
    portalAddress: '0x06EFdb68dbF245ECb49E3aE10Cd0f893B674443c',
    provers: {
      Hyperlane: '0x9523b6c0caac8122dbd5dd1c1d336ceba637038d',
      LayerZero: '0x0000000000000000000000000000000000000000', // TODO
    },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // TVM
  {
    id: 728126428n,
    name: 'Tron',
    type: ChainType.TVM,
    env: 'production',
    rpcUrl: 'https://api.trongrid.io',
    portalAddress: 'THABsbqqmfGtjBDvaeFTmaT5rnaz2fSXuE',
    provers: { LayerZero: 'TTL198uR3Q3RhLjffsMb8osUunLQeKmcqZ' },
    nativeCurrency: { name: 'Tron', symbol: 'TRX', decimals: 6 },
  },
  {
    id: 2494104990n,
    name: 'Tron Shasta',
    type: ChainType.TVM,
    env: 'development',
    rpcUrl: 'https://api.shasta.trongrid.io',
    portalAddress: 'TVNJyezi2bUJZjnUnRYcpcq4vK9hX4yecP',
    provers: { LayerZero: 'TJQSbrRjqdodh3aFQwfQEasTSEnUxqmDMy' },
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
