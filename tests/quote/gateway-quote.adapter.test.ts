import type { V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';

import { fromV1QuoteResponse, toV1QuoteRequest } from '@/quote/gateway-quote.adapter';
import type { QuoteRequest } from '@/quote/quote.service';
import { RoutesCliError } from '@/shared/errors';

const req: QuoteRequest = {
  source: 8453n,
  destination: 5042n,
  amount: 500_000n,
  funder: '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471',
  recipient: '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471',
  rewardToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  routeToken: '0x3600000000000000000000000000000000000000',
};

function quote(overrides: Partial<V1QuoteResponse> = {}): V1QuoteResponse {
  return {
    id: 'q-1',
    swapType: 'exact-in',
    visibility: 'public',
    guarantee: 'atomic-or-refund',
    source: {
      chainId: 8453,
      token: req.rewardToken,
      amount: '500000',
      symbol: 'USDC',
      decimals: 6,
    },
    destination: {
      chainId: 5042,
      token: req.routeToken,
      amount: '499000',
      minAmountOut: '499000',
      recipient: req.recipient,
      symbol: 'USDC',
      decimals: 6,
    },
    slippage: 0,
    fees: [],
    steps: [
      {
        kind: 'bridge',
        tool: 'eco',
        from: { chainId: 8453, token: req.rewardToken, amount: '500000' },
        to: { chainId: 5042, token: req.routeToken, amount: '499000' },
        fees: [],
        estimatedDurationSec: 12,
      },
      {
        kind: 'transfer',
        tool: 'eco',
        from: { chainId: 5042, token: req.routeToken, amount: '499000' },
        to: { chainId: 5042, token: req.routeToken, amount: '499000' },
        fees: [],
        estimatedDurationSec: 3,
      },
    ],
    relatedIntents: [],
    solver: { id: 'solver-1' },
    intentHash: `0x${'11'.repeat(32)}`,
    execution: {
      transaction: {
        kind: 'evm',
        chainId: 8453,
        to: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df',
        data: '0xdeadbeef',
        value: '0',
      },
      intent: {
        route: {
          salt: `0x${'22'.repeat(32)}`,
          deadline: 1_800_000_000,
          source: 8453,
          destination: 5042,
          portal: '0xEC002CA16cE20c2a9F3C6200EF04E7d92a3dfBD8',
          nativeAmount: '0',
          tokens: [{ token: req.routeToken, amount: '499000' }],
          calls: [],
        },
        reward: {
          deadline: 1_800_000_600,
          creator: req.funder,
          prover: '0xec004Ab4870c4e177c66949329dCdb503CE41022',
          nativeAmount: '0',
          tokens: [{ token: req.rewardToken, amount: '500000' }],
        },
      },
      encodedRoute: '0xabcdef',
      encodedReward: '0x0123',
    },
    expiresAt: 1_799_999_000,
    signature: '0xsig',
    quotes: null,
    ...overrides,
  };
}

describe('toV1QuoteRequest', () => {
  it('builds a public exact-in request with the funder as refund recipient', () => {
    expect(toV1QuoteRequest(req, 'eco-routes-cli')).toEqual({
      swapType: 'exact-in',
      source: { chainId: 8453, token: req.rewardToken, amount: '500000' },
      destination: { chainId: 5042, token: req.routeToken, recipient: req.recipient },
      funder: req.funder,
      refundRecipient: req.funder,
      dappId: 'eco-routes-cli',
      options: { visibility: 'public' },
    });
  });
});

describe('fromV1QuoteResponse', () => {
  it('maps execution material onto QuoteResult', () => {
    expect(fromV1QuoteResponse(quote(), req)).toEqual({
      encodedRoute: '0xabcdef',
      sourcePortal: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df',
      prover: '0xec004Ab4870c4e177c66949329dCdb503CE41022',
      deadline: 1_800_000_600,
      destinationAmount: '499000',
      estimatedFulfillTimeSec: 15,
      intentExecutionType: 'SELF_PUBLISH',
      destinationPortalAddress: '0xEC002CA16cE20c2a9F3C6200EF04E7d92a3dfBD8',
      destinationChainId: 5042,
    });
  });

  it('uses the configured source portal for a non-EVM funding transaction', () => {
    const svm = quote();
    svm.execution!.transaction = {
      kind: 'svm',
      chainId: 1399811149,
      feePayer: 'Fee111',
      instructions: [],
    };
    const result = fromV1QuoteResponse(svm, { ...req, sourcePortalFallback: 'PortalPubkey111' });
    expect(result.sourcePortal).toBe('PortalPubkey111');
  });

  it('refuses a non-EVM funding transaction without a configured source portal', () => {
    const svm = quote();
    svm.execution!.transaction = {
      kind: 'svm',
      chainId: 1399811149,
      feePayer: 'Fee111',
      instructions: [],
    };
    expect(() => fromV1QuoteResponse(svm, req)).toThrow(RoutesCliError);
  });

  it('refuses a quote without execution material', () => {
    expect(() => fromV1QuoteResponse(quote({ execution: null }), req)).toThrow(/execution/);
  });

  it('refuses a private quote (null encodedRoute)', () => {
    const priv = quote({ visibility: 'private' });
    priv.execution!.encodedRoute = null;
    expect(() => fromV1QuoteResponse(priv, req)).toThrow(/public/);
  });
});
