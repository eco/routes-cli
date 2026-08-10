import { RAW_CHAIN_CONFIGS } from '@/blockchain/chains.config';
import { TOKEN_CONFIGS } from '@/config/tokens.config';
import { ChainType } from '@/shared/types';

describe('Plasma mainnet chain config', () => {
  const plasma = RAW_CHAIN_CONFIGS.find(c => c.id === 9745n);

  it('exists in RAW_CHAIN_CONFIGS', () => {
    expect(plasma).toBeDefined();
  });

  it('has correct static properties', () => {
    expect(plasma).toMatchObject({
      id: 9745n,
      name: 'Plasma',
      type: ChainType.EVM,
      env: 'production',
      rpcUrl: 'https://rpc.plasma.to',
      portalAddress: '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97',
    });
  });

  it('has Hyperlane prover address', () => {
    expect(plasma?.provers?.Hyperlane).toBe('0xC972B26C1E208845Ca8C18c6B83466bFCeED8c2F');
  });
});

describe('USDT0 token config', () => {
  const usdt0 = TOKEN_CONFIGS['USDT0'];

  it('exists in TOKEN_CONFIGS', () => {
    expect(usdt0).toBeDefined();
  });

  it('has correct symbol and decimals', () => {
    expect(usdt0.symbol).toBe('USDT0');
    expect(usdt0.decimals).toBe(6);
  });

  it('has a normalized address for Plasma mainnet (chain 9745)', () => {
    const addr = usdt0.addresses['9745'];
    expect(addr).toBeDefined();
    expect(addr).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(addr.toLowerCase()).toContain('b8ce59fc3717ada4c02eadf9682a9e934f625ebb');
  });
});
