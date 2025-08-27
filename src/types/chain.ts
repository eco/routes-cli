import { VMType, VMConfig } from './vm.js';

export interface ChainConfig {
  chainId: string | number;
  name: string;
  vmType: VMType;
  rpcUrl: string;
  portalAddress: string;
  blockExplorer?: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  vmConfig?: VMConfig;
}

export interface ChainInfo {
  chainId: string | number;
  chainName: string;
  vmType: VMType;
}

export interface NativeCurrency {
  name: string;
  symbol: string;
  decimals: number;
}
