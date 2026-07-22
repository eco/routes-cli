import { RAW_CHAIN_CONFIGS } from '@/blockchain/chains.config';
import { ChainType } from '@/shared/types';

describe('production chain config', () => {
  it('registers Plasma mainnet as an EVM production chain', () => {
    const plasma = RAW_CHAIN_CONFIGS.find(chain => chain.id === 9745n);

    expect(plasma).toMatchObject({
      id: 9745n,
      name: 'Plasma',
      type: ChainType.EVM,
      env: 'production',
      rpcUrl: 'https://rpc.plasma.to',
      nativeCurrency: { name: 'Plasma', symbol: 'XPL', decimals: 18 },
    });
  });
});
