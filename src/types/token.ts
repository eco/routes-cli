import { VMType } from './vm.js';

export interface TokenEntry {
  symbol: string;
  name: string;
  chainId: string | number;
  chainName: string;
  vmType: VMType;
  address: string;
  decimals: number;
  logoURI?: string;
  coingeckoId?: string;
  tags?: string[];
  verified?: boolean;
}

export interface TokenRegistry {
  version: string;
  lastUpdated: string;
  tokens: TokenEntry[];
}

export interface TokenAmount {
  token: string;
  amount: bigint;
  vmType: VMType;
}

export interface TokenInfo {
  address: string;
  amount: bigint;
  decimals: number;
  symbol: string;
  vmType: VMType;
  chainId: string | number;
}
