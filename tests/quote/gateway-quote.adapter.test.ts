import type { V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';
import { encodeAbiParameters, encodeFunctionData, type Hex } from 'viem';

import { EVMRouteAbiItem, portalAbi } from '@/commons/abis/portal.abi';
import { fromV1QuoteResponse, toV1QuoteRequest } from '@/quote/gateway-quote.adapter';
import type { QuoteRequest } from '@/quote/quote.service';
import { RoutesCliError } from '@/shared/errors';

const FUNDER = '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471' as const;
const BASE_PORTAL = '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df' as const;
const ARC_PORTAL = '0xEC002CA16cE20c2a9F3C6200EF04E7d92a3dfBD8' as const;
const PROVER = '0xec004Ab4870c4e177c66949329dCdb503CE41022' as const;
const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
const ARC_USDC = '0x3600000000000000000000000000000000000000' as const;

const req: QuoteRequest = {
  source: 8453n,
  destination: 5042n,
  amount: 500_000n,
  funder: FUNDER,
  recipient: FUNDER,
  rewardToken: BASE_USDC,
  routeToken: ARC_USDC,
};

/** The route the router decoded for the caller — and the bytes it encoded into publishAndFund. */
const route = {
  salt: `0x${'22'.repeat(32)}` as Hex,
  deadline: 1_800_000_000n,
  source: 8453n,
  destination: 5042n,
  portal: ARC_PORTAL,
  nativeAmount: 0n,
  tokens: [{ token: ARC_USDC, amount: 500_000n }],
  calls: [{ target: ARC_USDC, data: '0xa9059cbb' as Hex, value: 0n }],
};
const reward = {
  deadline: 1_800_000_600n,
  creator: FUNDER,
  prover: PROVER,
  nativeAmount: 0n,
  tokens: [{ token: BASE_USDC, amount: 500_000n }],
};
const ENCODED_ROUTE = encodeAbiParameters([EVMRouteAbiItem], [route]);
const PUBLISH_AND_FUND_DATA = encodeFunctionData({
  abi: portalAbi,
  functionName: 'publishAndFund',
  args: [5042n, ENCODED_ROUTE, reward, false],
});

function quote(overrides: Partial<V1QuoteResponse> = {}): V1QuoteResponse {
  return {
    id: 'quote:q-1',
    type: 'exact-in',
    source: {
      chainId: 8453,
      token: BASE_USDC,
      amount: '500000',
      funder: FUNDER,
      symbol: 'USDC',
      decimals: 6,
    },
    destination: {
      chainId: 5042,
      token: ARC_USDC,
      amountOut: '499000',
      minAmountOut: '499000',
      recipient: FUNDER,
      symbol: 'USDC',
      decimals: 6,
    },
    slippage: 0,
    fees: [],
    steps: [
      {
        type: 'bridge',
        provider: 'eco',
        from: { chainId: 8453, token: BASE_USDC, amount: '500000' },
        to: { chainId: 5042, token: ARC_USDC, amount: '499000' },
        fees: [],
        estimatedDurationSec: 12,
        intents: [],
      },
      {
        type: 'transfer',
        provider: 'eco',
        from: { chainId: 5042, token: ARC_USDC, amount: '499000' },
        to: { chainId: 5042, token: ARC_USDC, amount: '499000' },
        fees: [],
        estimatedDurationSec: 3,
        intents: [],
      },
    ],
    solver: { id: 'solver-1' },
    intentHash: `0x${'11'.repeat(32)}`,
    execution: {
      transaction: {
        type: 'evm',
        chainId: 8453,
        to: BASE_PORTAL,
        data: PUBLISH_AND_FUND_DATA,
        value: '0',
      },
      intent: {
        route: {
          salt: route.salt,
          deadline: 1_800_000_000,
          source: 8453,
          destination: 5042,
          portal: ARC_PORTAL,
          nativeAmount: '0',
          tokens: [{ token: ARC_USDC, amount: '500000' }],
          calls: [{ target: ARC_USDC, data: '0xa9059cbb', value: '0' }],
        },
        reward: {
          deadline: 1_800_000_600,
          creator: FUNDER,
          prover: PROVER,
          nativeAmount: '0',
          tokens: [{ token: BASE_USDC, amount: '500000' }],
        },
      },
    },
    expiresAt: 1_799_999_000,
    signature: '0xsig',
    quotes: null,
    ...overrides,
  };
}

describe('toV1QuoteRequest (api-schemas 0.9.0 wire)', () => {
  it('builds an exact-in request with the funder under source and the funder as refund recipient', () => {
    expect(toV1QuoteRequest(req, 'eco-routes-cli')).toEqual({
      type: 'exact-in',
      source: { chainId: 8453, token: BASE_USDC, amount: '500000', funder: FUNDER },
      destination: { chainId: 5042, token: ARC_USDC, recipient: FUNDER },
      refundRecipient: FUNDER,
      dappId: 'eco-routes-cli',
    });
  });
});

describe('fromV1QuoteResponse', () => {
  it('takes the encoded route from the publishAndFund calldata and maps the rest of the execution', () => {
    expect(fromV1QuoteResponse(quote(), req)).toEqual({
      encodedRoute: ENCODED_ROUTE,
      sourcePortal: BASE_PORTAL,
      prover: PROVER,
      deadline: 1_800_000_600,
      destinationAmount: '499000',
      estimatedFulfillTimeSec: 15,
      intentExecutionType: 'SELF_PUBLISH',
      destinationPortalAddress: ARC_PORTAL,
      destinationChainId: 5042,
    });
  });

  it('refuses a quote without execution material', () => {
    expect(() => fromV1QuoteResponse(quote({ execution: null }), req)).toThrow(/execution/);
  });

  it('refuses a non-EVM funding transaction (SVM sources go through SOLVER_URL for now)', () => {
    const svm = quote();
    svm.execution!.transaction = {
      type: 'svm',
      chainId: 1399811149,
      feePayer: 'Fee111',
      instructions: [],
    };
    expect(() => fromV1QuoteResponse(svm, req)).toThrow(RoutesCliError);
    expect(() => fromV1QuoteResponse(svm, req)).toThrow(/svm/);
  });

  it('refuses a funding transaction that is not Portal.publishAndFund', () => {
    const odd = quote();
    odd.execution!.transaction = {
      type: 'evm',
      chainId: 8453,
      to: BASE_PORTAL,
      // ERC-20 transfer(address,uint256) selector — not a Portal call at all.
      data: `0xa9059cbb${'00'.repeat(64)}`,
      value: '0',
    };
    expect(() => fromV1QuoteResponse(odd, req)).toThrow(/publishAndFund/);
  });
});
