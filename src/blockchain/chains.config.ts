import {
  arbitrum,
  bsc,
  celo,
  hyperEvm,
  ink,
  mainnet,
  plasma,
  polygon,
  ronin,
  sonic,
  unichain,
  worldchain,
} from 'viem/chains';

import { ChainType, ProverType } from '@/shared/types';

export interface RawChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: string; // raw string, normalized lazily by ChainsService
  provers?: Partial<Record<ProverType, string>>;
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
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97', // prod portal
    provers: { LayerZero: '0x0C4E3063239c9f4f323A956C79738916594D8Fd4' }, // prod prover
    nativeCurrency: mainnet.nativeCurrency,
  },
  {
    id: 10n,
    name: 'Optimism',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.optimism.io',
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97', // prod portal
    provers: { LayerZero: '0x0C4E3063239c9f4f323A956C79738916594D8Fd4' }, // prod prover
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
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97', // prod portal
    provers: {
      LayerZero: '0x0C4E3063239c9f4f323A956C79738916594D8Fd4', // prod prover
      // v2.6 Tron<>EVM Polymer mesh (Tron corridor endpoint). The same CREATE3
      // prover exists on Ethereum/Optimism/Arbitrum/Polygon but is deliberately
      // not listed there: a second common prover type between two EVM chains
      // would break the single-common-prover auto-selection in the manual
      // fallback. Use --prover-address 0xE3e4... on those chains if needed.
      Polymer: '0xE3e4e6F284f1c8E17bafE4268EB98c36886B4d8B',
    },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(arbitrum.id),
    name: arbitrum.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: arbitrum.rpcUrls.default.http[0],
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97', // prod portal
    provers: { LayerZero: '0x0C4E3063239c9f4f323A956C79738916594D8Fd4' }, // prod prover
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(polygon.id),
    name: polygon.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://polygon.drpc.org',
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97', // prod portal
    provers: { LayerZero: '0x0C4E3063239c9f4f323A956C79738916594D8Fd4' }, // prod prover
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
  {
    id: BigInt(unichain.id),
    name: unichain.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: unichain.rpcUrls.default.http[0],
    nativeCurrency: unichain.nativeCurrency,
  },
  {
    id: BigInt(worldchain.id),
    name: worldchain.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: worldchain.rpcUrls.default.http[0],
    nativeCurrency: worldchain.nativeCurrency,
  },
  {
    id: BigInt(plasma.id),
    name: plasma.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: plasma.rpcUrls.default.http[0],
    nativeCurrency: plasma.nativeCurrency,
  },
  {
    id: BigInt(celo.id),
    name: celo.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: celo.rpcUrls.default.http[0],
    nativeCurrency: celo.nativeCurrency,
  },
  {
    id: BigInt(ink.id),
    name: ink.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: ink.rpcUrls.default.http[0],
    nativeCurrency: ink.nativeCurrency,
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
      Hyperlane: '0x9523b6c0cAaC8122DbD5Dd1c1d336CEBA637038D',
      LayerZero: '0x6D8D9E68627b8eb2D4A3c1110be3FE46Ff6e92A3',
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
      Hyperlane: '0x9523b6c0cAaC8122DbD5Dd1c1d336CEBA637038D',
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
      Hyperlane: '0x9523b6c0cAaC8122DbD5Dd1c1d336CEBA637038D',
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
      Hyperlane: '0x9523b6c0cAaC8122DbD5Dd1c1d336CEBA637038D',
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
    // v2.6 Tron<>EVM Polymer mesh. Portal and prover must stay paired: the old
    // LayerZero prover (TFu38RELzp7jdR9s7vj4JSpw2kFuTSAq3E) belongs to the old
    // portal (TTXNcSeX5aYb1ETWYjcX3fvumynWoyFgYw) and cannot prove v2.6 intents.
    portalAddress: 'TT6jKgnBXoj7vZ7m2Yioq5mxTfrDpgir44',
    provers: { Polymer: 'TLvVHqZZbs4Juf7umHYAepYgZkSdKxb649' },
    nativeCurrency: { name: 'Tron', symbol: 'TRX', decimals: 6 },
  },
  {
    id: 2494104990n,
    name: 'Tron Shasta',
    type: ChainType.TVM,
    env: 'development',
    rpcUrl: 'https://api.shasta.trongrid.io',
    portalAddress: 'TScmM6ZoR6grho3pKCzX6M2MKBYVURG1s5',
    provers: { LayerZero: 'TM6cLaN3LStBFi9AjrhLQ9cc6QiVu5nFsD' },
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
