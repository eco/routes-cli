/**
 * Tests for TOKEN_CONFIGS additions supporting the newly-added production
 * EVM chains (Unichain, World Chain, Plasma, Celo, Ink): USDC/USDT on Celo,
 * the new USDT0 symbol, and USDG's EVM deployments.
 */
import { getTokenAddress, TOKEN_CONFIGS } from '@/config/tokens.config';

describe('USDC — new chain deployments', () => {
  it.each([
    ['Unichain', 130n, '0x078d782b760474a361dda0af3839290b0ef57ad6'],
    ['World Chain', 480n, '0x79a02482a880bce3f13e09da970dc34db4cd24d1'],
    ['Celo', 42220n, '0xceba9300f2b948710d2653dd7b07f33a8b32118c'],
  ])('resolves on %s (chain %s)', (_name, chainId, expectedLower) => {
    const address = getTokenAddress('USDC', chainId);
    expect(address).toBeDefined();
    expect(address?.toLowerCase()).toContain(expectedLower.replace(/^0x/, ''));
  });
});

describe('USDT — Celo', () => {
  it('resolves on Celo (42220)', () => {
    const address = getTokenAddress('USDT', 42220n);
    expect(address).toBeDefined();
  });
});

describe('USDT0', () => {
  it.each([
    ['Unichain', 130n],
    ['Polygon', 137n],
    ['Plasma', 9745n],
    ['Arbitrum', 42161n],
    ['Ink', 57073n],
  ])('resolves on %s (chain %s)', (_name, chainId) => {
    expect(getTokenAddress('USDT0', chainId)).toBeDefined();
  });

  it('is undefined on HyperEVM (999) — same address already lives under USDT there', () => {
    // HyperEVM's bridged "USDT" (0xB8CE59FC...25ebb) IS USDT0; it is kept
    // under the pre-existing USDT symbol rather than duplicated here.
    expect(getTokenAddress('USDT0', 999n)).toBeUndefined();
    expect(getTokenAddress('USDT', 999n)).toBeDefined();
  });
});

describe('USDG — EVM deployments', () => {
  it.each([
    ['Ethereum', 1n],
    ['Base', 8453n],
    ['Ink', 57073n],
  ])('resolves on %s (chain %s)', (_name, chainId) => {
    expect(getTokenAddress('USDG', chainId)).toBeDefined();
  });

  it('still resolves on Solana (unchanged)', () => {
    expect(getTokenAddress('USDG', 1399811149n)).toBeDefined();
  });
});

describe('no cross-symbol address collisions on a single chain', () => {
  // A guard against accidentally listing the same contract address under two
  // different symbols on the same chain (the HyperEVM USDT/USDT0 case this
  // PR deliberately avoided duplicating).
  it('every (chainId, address) pair maps to exactly one symbol', () => {
    const seen = new Map<string, string>();
    for (const token of Object.values(TOKEN_CONFIGS)) {
      for (const [chainId, address] of Object.entries(token.addresses)) {
        const key = `${chainId}:${address.toLowerCase()}`;
        const existing = seen.get(key);
        if (existing) {
          expect(existing).toBe(token.symbol);
        } else {
          seen.set(key, token.symbol);
        }
      }
    }
  });
});
