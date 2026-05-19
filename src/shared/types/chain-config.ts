import { ChainType } from './intent.interface';
import { UniversalAddress } from './universal-address';

export const PROVER_TYPES = ['LayerZero', 'Hyperlane'] as const;
export type ProverType = (typeof PROVER_TYPES)[number];

export interface ChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: UniversalAddress;
  provers?: Partial<Record<ProverType, UniversalAddress>>;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}
