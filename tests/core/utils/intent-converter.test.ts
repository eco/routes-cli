/**
 * Tests for IntentConverter utility
 *
 * Covers toEVMIntent, toRouteEVMIntent, and toRewardEVMIntent:
 * - All universal addresses are converted to EVM checksummed hex
 * - Multiple tokens and calls are all converted (not just first item)
 * - Zero amounts and large BigInt values are preserved exactly
 */

import { ChainType, Intent } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { toEVMIntent, toRewardEVMIntent, toRouteEVMIntent } from '@/core/utils/intent-converter';

// Well-known EVM addresses for fixtures
const EVM_VITALIK = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as BlockchainAddress;
const EVM_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as BlockchainAddress;
const EVM_WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' as BlockchainAddress;
const EVM_DAI = '0x6B175474E89094C44Da98b954EedeAC495271d0F' as BlockchainAddress;
const EVM_ZERO = '0x0000000000000000000000000000000000000000' as BlockchainAddress;

// Normalize each to universal format once (shared across all tests)
const U_VITALIK = AddressNormalizer.normalize(EVM_VITALIK, ChainType.EVM);
const U_USDC = AddressNormalizer.normalize(EVM_USDC, ChainType.EVM);
const U_WETH = AddressNormalizer.normalize(EVM_WETH, ChainType.EVM);
const U_DAI = AddressNormalizer.normalize(EVM_DAI, ChainType.EVM);
const U_ZERO = AddressNormalizer.normalize(EVM_ZERO, ChainType.EVM);

/** Minimal valid Intent fixture with universal addresses */
function buildIntent(overrides: Partial<Intent> = {}): Intent {
  return {
    destination: 10n, // Optimism
    sourceChainId: 1n, // Ethereum
    route: {
      salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
      deadline: 9999999999n,
      portal: U_VITALIK,
      nativeAmount: 0n,
      tokens: [{ token: U_USDC, amount: 1_000_000n }],
      calls: [{ target: U_WETH, data: '0x', value: 0n }],
    },
    reward: {
      deadline: 9999999999n,
      creator: U_VITALIK,
      prover: U_USDC,
      nativeAmount: 0n,
      tokens: [{ token: U_DAI, amount: 500_000_000_000_000_000n }],
    },
    ...overrides,
  };
}

// ── EVM address format regex ────────────────────────────────────────────────
const EVM_ADDR_RE = /^0x[0-9a-fA-F]{40}$/;

describe('toRewardEVMIntent', () => {
  it('converts creator and prover to EVM address format', () => {
    const reward = buildIntent().reward;
    const result = toRewardEVMIntent(reward);

    expect(result.creator).toMatch(EVM_ADDR_RE);
    expect(result.prover).toMatch(EVM_ADDR_RE);
  });

  it('round-trips creator back to the original EVM address', () => {
    const reward = buildIntent().reward;
    const result = toRewardEVMIntent(reward);

    expect(result.creator.toLowerCase()).toBe(EVM_VITALIK.toLowerCase());
  });

  it('converts all token addresses to EVM format', () => {
    const reward = {
      ...buildIntent().reward,
      tokens: [
        { token: U_USDC, amount: 1_000_000n },
        { token: U_DAI, amount: 2_000_000n },
        { token: U_WETH, amount: 3_000_000n },
      ],
    };
    const result = toRewardEVMIntent(reward);

    expect(result.tokens).toHaveLength(3);
    result.tokens.forEach(t => expect(t.token).toMatch(EVM_ADDR_RE));
  });

  it('preserves zero nativeAmount', () => {
    const reward = buildIntent().reward;
    const result = toRewardEVMIntent(reward);
    expect(result.nativeAmount).toBe(0n);
  });

  it('preserves large BigInt token amount without truncation', () => {
    const LARGE = 123_456_789_012_345_678_901n;
    const reward = {
      ...buildIntent().reward,
      tokens: [{ token: U_USDC, amount: LARGE }],
    };
    const result = toRewardEVMIntent(reward);
    expect(result.tokens[0].amount).toBe(LARGE);
  });

  it('preserves deadline exactly', () => {
    const reward = buildIntent().reward;
    const result = toRewardEVMIntent(reward);
    expect(result.deadline).toBe(9999999999n);
  });

  it('handles an empty tokens array', () => {
    const reward = { ...buildIntent().reward, tokens: [] };
    const result = toRewardEVMIntent(reward);
    expect(result.tokens).toEqual([]);
  });
});

describe('toRouteEVMIntent', () => {
  it('converts portal to EVM address format', () => {
    const route = buildIntent().route;
    const result = toRouteEVMIntent(route);
    expect(result.portal).toMatch(EVM_ADDR_RE);
  });

  it('round-trips portal back to the original EVM address', () => {
    const route = buildIntent().route;
    const result = toRouteEVMIntent(route);
    expect(result.portal.toLowerCase()).toBe(EVM_VITALIK.toLowerCase());
  });

  it('converts all token addresses to EVM format', () => {
    const route = {
      ...buildIntent().route,
      tokens: [
        { token: U_USDC, amount: 1_000_000n },
        { token: U_DAI, amount: 2_000_000n },
      ],
    };
    const result = toRouteEVMIntent(route);

    expect(result.tokens).toHaveLength(2);
    result.tokens.forEach(t => expect(t.token).toMatch(EVM_ADDR_RE));
  });

  it('converts all call targets to EVM format', () => {
    const route = {
      ...buildIntent().route,
      calls: [
        { target: U_WETH, data: '0x1234' as `0x${string}`, value: 100n },
        { target: U_DAI, data: '0xabcd' as `0x${string}`, value: 200n },
        { target: U_ZERO, data: '0x' as `0x${string}`, value: 0n },
      ],
    };
    const result = toRouteEVMIntent(route);

    expect(result.calls).toHaveLength(3);
    result.calls.forEach(c => expect(c.target).toMatch(EVM_ADDR_RE));
  });

  it('preserves call data and value unchanged', () => {
    const route = {
      ...buildIntent().route,
      calls: [{ target: U_WETH, data: '0xdeadbeef' as `0x${string}`, value: 42n }],
    };
    const result = toRouteEVMIntent(route);

    expect(result.calls[0].data).toBe('0xdeadbeef');
    expect(result.calls[0].value).toBe(42n);
  });

  it('preserves salt and deadline unchanged', () => {
    const route = buildIntent().route;
    const result = toRouteEVMIntent(route);

    expect(result.salt).toBe(route.salt);
    expect(result.deadline).toBe(9999999999n);
  });

  it('handles empty tokens and calls arrays', () => {
    const route = { ...buildIntent().route, tokens: [], calls: [] };
    const result = toRouteEVMIntent(route);

    expect(result.tokens).toEqual([]);
    expect(result.calls).toEqual([]);
  });

  it('preserves zero nativeAmount', () => {
    const route = buildIntent().route;
    const result = toRouteEVMIntent(route);
    expect(result.nativeAmount).toBe(0n);
  });
});

describe('toEVMIntent', () => {
  it('converts the full intent to EVM format, including route and reward', () => {
    const intent = buildIntent();
    const result = toEVMIntent(intent);

    expect(result.route.portal).toMatch(EVM_ADDR_RE);
    expect(result.reward.creator).toMatch(EVM_ADDR_RE);
  });

  it('preserves chain IDs and intentHash unchanged', () => {
    const intent = buildIntent();
    intent.intentHash = ('0x' + 'a'.repeat(64)) as `0x${string}`;
    const result = toEVMIntent(intent);

    expect(result.destination).toBe(10n);
    expect(result.sourceChainId).toBe(1n);
    expect(result.intentHash).toBe(intent.intentHash);
  });

  it('passes intentHash through as undefined when not set', () => {
    const intent = buildIntent();
    const result = toEVMIntent(intent);
    expect(result.intentHash).toBeUndefined();
  });
});
