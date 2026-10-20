import {
  arbitrum,
  hyperEvm,
  mainnet,
  plasma,
  polygon,
  ronin,
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

// eco-routes v2.12 (proven cancellation): one CREATE3 address on every v2.12
// EVM chain. Must match the generation the production solvers run — a solver
// cannot fill an intent published on another Portal generation.
const V2_12_PORTAL = '0xEC000769A73b70e16f361a442292500b3BCf4A85';
const V2_12_HYPER_PROVER = '0xEC08fb4647f3f50d1162a578d481266687C60fc5';

export const RAW_CHAIN_CONFIGS: RawChainConfig[] = [
  // EVM - Production
  {
    id: BigInt(mainnet.id),
    name: 'Ethereum',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://ethereum-rpc.publicnode.com',
    portalAddress: V2_12_PORTAL,
    provers: { Hyperlane: V2_12_HYPER_PROVER },
    nativeCurrency: mainnet.nativeCurrency,
  },
  {
    id: 10n,
    name: 'Optimism',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.optimism.io',
    portalAddress: V2_12_PORTAL,
    provers: { Hyperlane: V2_12_HYPER_PROVER },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: 8453n,
    name: 'Base',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://mainnet.base.org',
    portalAddress: V2_12_PORTAL,
    provers: {
      Hyperlane: V2_12_HYPER_PROVER,
      // Tron<>EVM Polymer corridor endpoint. The same CREATE3 prover exists on
      // every v2.12 EVM chain but is deliberately not listed elsewhere: a
      // second common prover type between two EVM chains would break the
      // single-common-prover auto-selection in the manual fallback. Use
      // --prover-address 0xEC0DeD08... on those chains if needed.
      Polymer: '0xEC0DeD087Ee6C55991Bb4D4567ca1134c5353Ed6',
    },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(arbitrum.id),
    name: arbitrum.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: arbitrum.rpcUrls.default.http[0],
    portalAddress: V2_12_PORTAL,
    provers: { Hyperlane: V2_12_HYPER_PROVER },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },
  {
    id: BigInt(polygon.id),
    name: polygon.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://polygon.drpc.org',
    portalAddress: V2_12_PORTAL,
    provers: { Hyperlane: V2_12_HYPER_PROVER },
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
    id: BigInt(hyperEvm.id),
    name: hyperEvm.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: hyperEvm.rpcUrls.default.http[0],
    nativeCurrency: hyperEvm.nativeCurrency,
  },
  {
    id: 9745n,
    name: 'Plasma',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://rpc.plasma.to',
    portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97',
    provers: { Hyperlane: '0xC972B26C1E208845Ca8C18c6B83466bFCeED8c2F' },
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
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
    // Arc — Circle's L1 (private mainnet until the 2026-09-16 public launch). Native gas token
    // is USDC (18 dp at the native layer); the 6-dp ERC-20 view is the precompile 0x3600…0000.
    // rpc.mainnet.arc.io is IP-allowlisted while private: set EVM_RPC_URL_5042 (e.g. Alchemy).
    id: 5042n,
    name: 'Arc',
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://rpc.mainnet.arc.io',
    portalAddress: V2_12_PORTAL,
    provers: { Hyperlane: V2_12_HYPER_PROVER },
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
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
    id: 5042002n,
    name: 'Arc Testnet',
    type: ChainType.EVM,
    env: 'development',
    rpcUrl: 'https://rpc.testnet.arc.network',
    portalAddress: '0x9bA7F9Fa8E5F6B8A216Ca8e4640E6Fd95a55668e',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
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
    // v2.12 Tron<>EVM Polymer corridor. Portal and prover must stay paired: a
    // prover's PORTAL() is immutable, so an older-generation prover (e.g. the
    // v2.6 TLvVHqZZ... bound to TT6jKgnB...) cannot prove v2.12 intents.
    portalAddress: 'TDYD42VmbScmqYkqG97aLgRN74Dqq9Fuva',
    provers: { Polymer: 'TU42qLG4ixTZ56jYFVAke32DmTcEkiU4zv' },
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
