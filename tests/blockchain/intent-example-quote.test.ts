import { encodeFunctionData, type Hex } from 'viem';

import {
  fetchQuote,
  portalAbi,
  type QuoteRequest,
  type Reward,
} from '@/scripts/evm-intent-simple/scripts/intent-creator-base';

const FUNDER = '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471';
const PORTAL = '0xEC000769A73b70e16f361a442292500b3BCf4A85';
const TOKEN = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const NOW = 1_790_000_000;
const ROUTE: Hex = '0xdeadbeef';
const REWARD: Reward = {
  deadline: BigInt(NOW + 3600),
  creator: FUNDER,
  prover: '0xEC08fb4647f3f50d1162a578d481266687C60fc5',
  nativeAmount: 0n,
  tokens: [{ token: TOKEN, amount: 100000n }],
};
const REQUEST: QuoteRequest = {
  source: 8453,
  sourceAmount: 100000n,
  sourceToken: TOKEN,
  funder: FUNDER,
  destination: 10,
  destinationToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  recipient: FUNDER,
};

function calldata(reward = REWARD, destination = 10n, allowPartial = false): Hex {
  return encodeFunctionData({
    abi: portalAbi,
    functionName: 'publishAndFund',
    args: [destination, ROUTE, reward, allowPartial],
  });
}

function quoteBody(data = calldata()): object {
  return {
    id: 'test-quote',
    expiresAt: NOW + 600,
    destination: { chainId: REQUEST.destination, amountOut: '99421' },
    execution: { transaction: { type: 'evm', to: PORTAL, data } },
  };
}

const invalidQuotes: ReadonlyArray<readonly [string, unknown]> = [
  ['missing execution', { ...quoteBody(), execution: null }],
  ['non-EVM funding', { ...quoteBody(), execution: { transaction: { type: 'svm' } } }],
  ['expiry boundary', { ...quoteBody(), expiresAt: NOW }],
  ['wrong creator', quoteBody(calldata({ ...REWARD, creator: PORTAL }))],
  ['wrong destination', { ...quoteBody(), destination: { chainId: 8453, amountOut: '99421' } }],
  ['wrong amount', quoteBody(calldata({ ...REWARD, tokens: [{ token: TOKEN, amount: 1n }] }))],
  ['wrong token', quoteBody(calldata({ ...REWARD, tokens: [{ token: PORTAL, amount: 100000n }] }))],
  ['missing reward', quoteBody(calldata({ ...REWARD, tokens: [] }))],
  [
    'extra reward',
    quoteBody(calldata({ ...REWARD, tokens: [...REWARD.tokens, ...REWARD.tokens] })),
  ],
  ['partial funding', quoteBody(calldata(REWARD, 10n, true))],
  ['native reward', quoteBody(calldata({ ...REWARD, nativeAmount: 1n }))],
  ['invalid calldata', quoteBody('0xdeadbeef')],
  [
    'wrong function',
    quoteBody(
      encodeFunctionData({
        abi: portalAbi,
        functionName: 'fulfill',
        args: [
          `0x${'11'.repeat(32)}`,
          {
            salt: `0x${'22'.repeat(32)}`,
            deadline: 1n,
            portal: PORTAL,
            nativeAmount: 0n,
            tokens: [],
            calls: [],
          },
          `0x${'33'.repeat(32)}`,
          `0x${'44'.repeat(32)}`,
        ],
      })
    ),
  ],
];

describe('example quotes v4', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  });
  afterEach(() => jest.restoreAllMocks());

  it('preserves the quoted reward and route instead of constructing a new intent', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(quoteBody())));
    expect(await fetchQuote(REQUEST, 'https://quotes.eco.com')).toEqual({
      quoteId: 'test-quote',
      portal: PORTAL,
      destinationChainId: 10n,
      routeBytes: ROUTE,
      reward: REWARD,
      destinationAmount: '99421',
    });
  });

  it('preserves a source-chain first hop in a quote with a different final destination', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(quoteBody(calldata(REWARD, 8453n)))));
    const quote = await fetchQuote(REQUEST, 'https://quotes.eco.com');
    expect(quote.destinationChainId).toBe(8453n);
    expect(quote.routeBytes).toBe(ROUTE);
    expect(quote.reward).toEqual(REWARD);
  });

  it.each(invalidQuotes)('rejects %s before allowing publication', async (_name, body) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body)));
    await expect(fetchQuote(REQUEST, 'https://quotes.eco.com')).rejects.toBeInstanceOf(Error);
  });

  it.each([410, 502])('preserves HTTP %s even when the response is not JSON', async status => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('upstream unavailable', { status }));
    await expect(fetchQuote(REQUEST, 'https://quotes.eco.com')).rejects.toThrow(`HTTP ${status}`);
  });
});
