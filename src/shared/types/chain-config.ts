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
  // If set, this chain has no RPC/portal of its own. All operational lookups
  // (RPC URL, portal contract, fulfillment events, token catalog) delegate to
  // the chain referenced by this id. Only the `destination` field of the
  // published intent preserves this chain's id.
  fulfillmentChainId?: bigint;
}
