/**
 * Tests for PortalEncoder utility
 *
 * Covers:
 * - isRoute() type guard
 * - EVM encode/decode round-trip for both Route and Reward
 * - SVM Borsh encode/decode round-trip for both Route and Reward
 * - Edge cases: empty token/call arrays, zero amounts, large BigInts
 */

import { ChainType, Intent } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { PortalEncoder } from '@/core/utils/portal-encoder';

// ── EVM fixtures ─────────────────────────────────────────────────────────────
const EVM_VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as BlockchainAddress;
const EVM_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as BlockchainAddress;
const EVM_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as BlockchainAddress;

const U_VITALIK = AddressNormalizer.normalize(EVM_VITALIK, ChainType.EVM);
const U_USDC = AddressNormalizer.normalize(EVM_USDC, ChainType.EVM);
const U_WETH = AddressNormalizer.normalize(EVM_WETH, ChainType.EVM);

// ── SVM fixtures ─────────────────────────────────────────────────────────────
// Well-known Solana public keys (Wrapped SOL and SPL Token program)
const SVM_WSOL = 'So11111111111111111111111111111111111111112' as BlockchainAddress;
const SVM_TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' as BlockchainAddress;
const SVM_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as BlockchainAddress;

const U_SVM_WSOL = AddressNormalizer.normalize(SVM_WSOL, ChainType.SVM);
const U_SVM_TOKEN_PROGRAM = AddressNormalizer.normalize(SVM_TOKEN_PROGRAM, ChainType.SVM);
const U_SVM_USDC = AddressNormalizer.normalize(SVM_USDC, ChainType.SVM);

// ── Shared route/reward builders ──────────────────────────────────────────────

function buildEvmRoute(overrides: Partial<Intent['route']> = {}): Intent['route'] {
  return {
    salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
    deadline: 9_999_999_999n,
    portal: U_VITALIK,
    nativeAmount: 0n,
    tokens: [{ token: U_USDC, amount: 1_000_000n }],
    calls: [{ target: U_WETH, data: '0x', value: 0n }],
    ...overrides,
  };
}

function buildEvmReward(overrides: Partial<Intent['reward']> = {}): Intent['reward'] {
  return {
    deadline: 9_999_999_999n,
    creator: U_VITALIK,
    prover: U_USDC,
    nativeAmount: 0n,
    tokens: [{ token: U_WETH, amount: 500_000n }],
    ...overrides,
  };
}

function buildSvmRoute(overrides: Partial<Intent['route']> = {}): Intent['route'] {
  return {
    salt: '0x0000000000000000000000000000000000000000000000000000000000000002',
    deadline: 9_999_999_999n,
    portal: U_SVM_WSOL,
    nativeAmount: 0n,
    tokens: [{ token: U_SVM_USDC, amount: 1_000_000n }],
    calls: [],
    ...overrides,
  };
}

function buildSvmReward(overrides: Partial<Intent['reward']> = {}): Intent['reward'] {
  return {
    deadline: 9_999_999_999n,
    creator: U_SVM_WSOL,
    prover: U_SVM_TOKEN_PROGRAM,
    nativeAmount: 0n,
    tokens: [{ token: U_SVM_USDC, amount: 1_000_000n }],
    ...overrides,
  };
}

// ── isRoute() type guard ──────────────────────────────────────────────────────

describe('PortalEncoder.isRoute()', () => {
  it('returns true for a Route object (has salt, portal, calls)', () => {
    const route = buildEvmRoute();
    expect(PortalEncoder.isRoute(route)).toBe(true);
  });

  it('returns false for a Reward object (no salt, portal, calls)', () => {
    const reward = buildEvmReward();
    expect(PortalEncoder.isRoute(reward)).toBe(false);
  });

  it('returns false for a reward that has no portal field', () => {
    // Rewards have creator/prover but no portal/salt/calls
    const reward: Intent['reward'] = {
      deadline: 1000n,
      creator: U_VITALIK,
      prover: U_USDC,
      nativeAmount: 0n,
      tokens: [],
    };
    expect(PortalEncoder.isRoute(reward)).toBe(false);
  });
});

// ── EVM encode / decode round-trips ──────────────────────────────────────────

describe('PortalEncoder EVM route', () => {
  it('encode() returns a hex string starting with 0x', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    expect(encoded).toMatch(/^0x/);
  });

  it('encode() returns a non-empty hex string', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    expect(encoded.length).toBeGreaterThan(2);
  });

  it('decode(encode(route)) round-trips the portal address', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.portal.toLowerCase()).toBe(route.portal.toLowerCase());
  });

  it('decode(encode(route)) preserves deadline', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.deadline).toBe(route.deadline);
  });

  it('decode(encode(route)) preserves token amount', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.tokens[0].amount).toBe(1_000_000n);
  });

  it('decode(encode(route)) preserves token address', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.tokens[0].token.toLowerCase()).toBe(route.tokens[0].token.toLowerCase());
  });

  it('decode(encode(route)) preserves call target', () => {
    const route = buildEvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.calls[0].target.toLowerCase()).toBe(route.calls[0].target.toLowerCase());
  });

  it('preserves multiple tokens across encode/decode', () => {
    const route = buildEvmRoute({
      tokens: [
        { token: U_USDC, amount: 1_000_000n },
        { token: U_WETH, amount: 2_000_000n },
      ],
    });
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.tokens).toHaveLength(2);
    expect(decoded.tokens[1].amount).toBe(2_000_000n);
  });

  it('handles empty tokens array', () => {
    const route = buildEvmRoute({ tokens: [], calls: [] });
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.tokens).toHaveLength(0);
    expect(decoded.calls).toHaveLength(0);
  });

  it('preserves a large BigInt amount without truncation', () => {
    const LARGE = 999_999_999_999_999_999n;
    const route = buildEvmRoute({ tokens: [{ token: U_USDC, amount: LARGE }] });
    const encoded = PortalEncoder.encode(route, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'route');

    expect(decoded.tokens[0].amount).toBe(LARGE);
  });
});

describe('PortalEncoder EVM reward', () => {
  it('encode() returns a hex string', () => {
    const reward = buildEvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    expect(encoded).toMatch(/^0x/);
  });

  it('decode(encode(reward)) round-trips creator address', () => {
    const reward = buildEvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.creator.toLowerCase()).toBe(reward.creator.toLowerCase());
  });

  it('decode(encode(reward)) round-trips prover address', () => {
    const reward = buildEvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.prover.toLowerCase()).toBe(reward.prover.toLowerCase());
  });

  it('decode(encode(reward)) preserves deadline', () => {
    const reward = buildEvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.deadline).toBe(9_999_999_999n);
  });

  it('decode(encode(reward)) preserves nativeAmount', () => {
    const reward = buildEvmReward({ nativeAmount: 100n });
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.nativeAmount).toBe(100n);
  });

  it('decode(encode(reward)) preserves token amount', () => {
    const reward = buildEvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.tokens[0].amount).toBe(500_000n);
  });

  it('preserves multiple tokens in reward across encode/decode', () => {
    const reward = buildEvmReward({
      tokens: [
        { token: U_USDC, amount: 1_000_000n },
        { token: U_WETH, amount: 2_000_000n },
      ],
    });
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.tokens).toHaveLength(2);
    expect(decoded.tokens[1].amount).toBe(2_000_000n);
  });

  it('handles empty tokens array in reward', () => {
    const reward = buildEvmReward({ tokens: [] });
    const encoded = PortalEncoder.encode(reward, ChainType.EVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.EVM, 'reward');

    expect(decoded.tokens).toHaveLength(0);
  });
});

// ── TVM encode / decode (uses same ABI encoding as EVM) ──────────────────────

describe('PortalEncoder TVM', () => {
  it('TVM encode produces the same bytes as EVM for a route', () => {
    const route = buildEvmRoute();
    const evmEncoded = PortalEncoder.encode(route, ChainType.EVM);
    const tvmEncoded = PortalEncoder.encode(route, ChainType.TVM);
    // Both use encodeAbiParameters — bytes should be identical
    expect(tvmEncoded).toBe(evmEncoded);
  });
});

// ── SVM Borsh encode / decode round-trips ─────────────────────────────────────

describe('PortalEncoder SVM route', () => {
  it('encode() returns a hex string for a valid SVM route', () => {
    const route = buildSvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.SVM);
    expect(encoded).toMatch(/^0x/);
    expect(encoded.length).toBeGreaterThan(2);
  });

  it('decode(encode(route)) round-trips the portal address', () => {
    const route = buildSvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'route');

    expect(decoded.portal.toLowerCase()).toBe(route.portal.toLowerCase());
  });

  it('decode(encode(route)) preserves deadline', () => {
    const route = buildSvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'route');

    expect(decoded.deadline).toBe(route.deadline);
  });

  it('decode(encode(route)) preserves token amount', () => {
    const route = buildSvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'route');

    expect(decoded.tokens[0].amount).toBe(1_000_000n);
  });

  it('decode(encode(route)) preserves token address', () => {
    const route = buildSvmRoute();
    const encoded = PortalEncoder.encode(route, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'route');

    expect(decoded.tokens[0].token.toLowerCase()).toBe(route.tokens[0].token.toLowerCase());
  });

  it('handles empty tokens array for SVM route', () => {
    const route = buildSvmRoute({ tokens: [], calls: [] });
    const encoded = PortalEncoder.encode(route, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'route');

    expect(decoded.tokens).toHaveLength(0);
    expect(decoded.calls).toHaveLength(0);
  });
});

describe('PortalEncoder SVM reward', () => {
  it('encode() returns a hex string for a valid SVM reward', () => {
    const reward = buildSvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.SVM);
    expect(encoded).toMatch(/^0x/);
    expect(encoded.length).toBeGreaterThan(2);
  });

  it('decode(encode(reward)) round-trips creator address', () => {
    const reward = buildSvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'reward');

    expect(decoded.creator.toLowerCase()).toBe(reward.creator.toLowerCase());
  });

  it('decode(encode(reward)) preserves deadline', () => {
    const reward = buildSvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'reward');

    expect(decoded.deadline).toBe(reward.deadline);
  });

  it('decode(encode(reward)) preserves token amount', () => {
    const reward = buildSvmReward();
    const encoded = PortalEncoder.encode(reward, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'reward');

    expect(decoded.tokens[0].amount).toBe(1_000_000n);
  });

  it('handles empty tokens array in SVM reward', () => {
    const reward = buildSvmReward({ tokens: [] });
    const encoded = PortalEncoder.encode(reward, ChainType.SVM);
    const decoded = PortalEncoder.decode(encoded, ChainType.SVM, 'reward');

    expect(decoded.tokens).toHaveLength(0);
  });
});

// ── Unsupported chain type ────────────────────────────────────────────────────

describe('PortalEncoder unsupported chain type', () => {
  it('encode() throws for an unsupported chain type', () => {
    const route = buildEvmRoute();
    const UNSUPPORTED = 99 as unknown as ChainType;
    expect(() => PortalEncoder.encode(route, UNSUPPORTED)).toThrow(/unsupported chain type/i);
  });

  it('decode() throws for an unsupported chain type', () => {
    const UNSUPPORTED = 99 as unknown as ChainType;
    expect(() => PortalEncoder.decode('0x1234', UNSUPPORTED, 'route')).toThrow(
      /unsupported chain type/i
    );
  });
});
