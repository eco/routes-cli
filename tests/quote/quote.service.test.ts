import { ConfigService as NestConfigService } from '@nestjs/config';

import { type Address, encodeAbiParameters, encodeFunctionData, type Hex } from 'viem';

import { DisplayService } from '@/cli/services/display.service';
import { EVMRouteAbiItem, portalAbi } from '@/commons/abis/portal.abi';
import { ConfigService } from '@/config/config.service';
import { EcoApiClient } from '@/eco-api/eco-api.client';
import { QuoteRequest, QuoteService } from '@/quote/quote.service';

const FUNDER = '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471';
const PORTAL: Address = '0xEC000769A73b70e16f361a442292500b3BCf4A85';
const SALT: Hex = `0x${'22'.repeat(32)}`;
const req: QuoteRequest = {
  source: 8453n,
  destination: 10n,
  amount: 1_000_000n,
  funder: FUNDER,
  recipient: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  rewardToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  routeToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  env: 'staging',
};
const ROUTE = {
  deadline: 1_800_000_000n,
  salt: SALT,
  source: 8453n,
  destination: 10n,
  portal: PORTAL,
  nativeAmount: 0n,
  tokens: [],
  calls: [],
};
const ENCODED_ROUTE = encodeAbiParameters([EVMRouteAbiItem], [ROUTE]);
const quote = {
  id: 'q',
  type: 'exact-in',
  destination: { chainId: 10, amountOut: '990000' },
  steps: [],
  execution: {
    transaction: {
      type: 'evm',
      chainId: 8453,
      to: PORTAL,
      data: encodeFunctionData({
        abi: portalAbi,
        functionName: 'publishAndFund',
        args: [
          10n,
          ENCODED_ROUTE,
          {
            deadline: 1_800_000_000n,
            creator: FUNDER,
            prover: '0xEC08fb4647f3f50d1162a578d481266687C60fc5',
            nativeAmount: 0n,
            tokens: [],
          },
          false,
        ],
      }),
      value: '0',
    },
    intent: {
      route: { portal: PORTAL },
      reward: { prover: '0xEC08fb4647f3f50d1162a578d481266687C60fc5', deadline: 1_800_000_000 },
    },
  },
};

function build(env: Record<string, string>): QuoteService {
  const config = new ConfigService(new NestConfigService(env));
  const display = new DisplayService();
  return new QuoteService(config, display, new EcoApiClient(config, display));
}

const sources: ReadonlyArray<readonly [string, Record<string, string>]> = [
  ['gateway', {}],
  ['quotes-v4', { QUOTES_API_URL: 'https://quotes.eco.com' }],
];

describe('QuoteService', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(sources)(
    'preserves %s calldata and maps the destination amount',
    async (_source, env) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(quote)));
      const result = await build(env).getQuote(req);
      expect(result).toMatchObject({
        encodedRoute: ENCODED_ROUTE,
        sourcePortal: PORTAL,
        prover: '0xEC08fb4647f3f50d1162a578d481266687C60fc5',
        destinationAmount: '990000',
        destinationChainId: 10,
      });
    }
  );

  it('still accepts the solver-v2 response shape', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          contracts: { sourcePortal: '0x1', prover: '0x2', destinationPortal: '0x3' },
          quoteResponses: [
            { encodedRoute: '0xaa', deadline: 1, destinationAmount: '1', destinationChainID: 10 },
          ],
        })
      )
    );
    const result = await build({ SOLVER_URL: 'https://solver.example.com' }).getQuote(req);
    expect(result).toMatchObject({
      encodedRoute: '0xaa',
      destinationAmount: '1',
      destinationChainId: 10,
    });
  });
});
