import { ChainType } from './intent.interface';
import { UniversalAddress } from './universal-address';

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
