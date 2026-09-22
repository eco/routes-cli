import { TokenResolverService } from '@/cli/services/token-resolver.service';
import { ChainConfig, ChainType } from '@/shared/types';

const BASE: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

const NATIVE_USDC_ON_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: any = {
  get: () => ({
    validateAddress: (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a),
    getAddressFormat: () => 'hex',
  }),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizer: any = { denormalize: () => NATIVE_USDC_ON_BASE };

describe('TokenResolverService.resolve', () => {
  const resolver = new TokenResolverService(registry, normalizer);
  const opts = { decimalsFlag: '--reward-token-decimals' };

  it('resolves a known symbol (case-insensitive) to chain-native address + decimals', () => {
    const sel = resolver.resolve('usdc', BASE, opts);
    expect(sel).toEqual({ address: NATIVE_USDC_ON_BASE, decimals: 6, symbol: 'USDC' });
  });

  it('rejects a known symbol not configured on the chain, listing configured chains', () => {
    const SONIC = { ...BASE, id: 999999n, name: 'Nowhere' };
    expect(() => resolver.resolve('USDC', SONIC, opts)).toThrow(/not configured on Nowhere/);
  });

  it('accepts a raw address when decimals are provided', () => {
    const sel = resolver.resolve(NATIVE_USDC_ON_BASE, BASE, { decimals: 6, ...opts });
    expect(sel).toEqual({ address: NATIVE_USDC_ON_BASE, decimals: 6 });
  });

  it('rejects a raw address without decimals, naming the decimals flag', () => {
    expect(() => resolver.resolve(NATIVE_USDC_ON_BASE, BASE, opts)).toThrow(
      /--reward-token-decimals/
    );
  });

  it('rejects garbage input, listing known symbols', () => {
    expect(() => resolver.resolve('NOPE', BASE, opts)).toThrow(/USDC/);
  });

  describe('new production EVM chains', () => {
    const UNICHAIN: ChainConfig = { ...BASE, id: 130n, name: 'Unichain' };
    const WORLDCHAIN: ChainConfig = { ...BASE, id: 480n, name: 'World Chain' };
    const PLASMA: ChainConfig = { ...BASE, id: 9745n, name: 'Plasma' };
    const CELO: ChainConfig = { ...BASE, id: 42220n, name: 'Celo' };
    const INK: ChainConfig = { ...BASE, id: 57073n, name: 'Ink' };
    const ARBITRUM: ChainConfig = { ...BASE, id: 42161n, name: 'Arbitrum' };
    const POLYGON: ChainConfig = { ...BASE, id: 137n, name: 'Polygon' };

    it.each([
      ['USDC', UNICHAIN],
      ['USDC', WORLDCHAIN],
      ['USDC', CELO],
      ['USDT', CELO],
      ['USDT0', UNICHAIN],
      ['USDT0', POLYGON],
      ['USDT0', PLASMA],
      ['USDT0', ARBITRUM],
      ['USDT0', INK],
    ])('resolves %s on %s without throwing', (symbol, chain) => {
      expect(() => resolver.resolve(symbol, chain, opts)).not.toThrow();
    });

    it('USDT0 is not configured on HyperEVM (999) — it lives under USDT there instead', () => {
      const HYPEREVM: ChainConfig = { ...BASE, id: 999n, name: 'HyperEVM' };
      expect(() => resolver.resolve('USDT0', HYPEREVM, opts)).toThrow(/not configured on HyperEVM/);
      expect(() => resolver.resolve('USDT', HYPEREVM, opts)).not.toThrow();
    });
  });
});
