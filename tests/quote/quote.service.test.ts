import type { V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';

import { QuoteRequest, QuoteService } from '@/quote/quote.service';

const req: QuoteRequest = {
  source: 8453n,
  destination: 10n,
  amount: 1_000_000n,
  funder: '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471',
  recipient: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  rewardToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  routeToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
  env: 'staging',
};

const v1Quote = {
  id: 'q',
  visibility: 'public',
  destination: { chainId: 10, amount: '990000' },
  steps: [],
  execution: {
    transaction: {
      kind: 'evm',
      chainId: 8453,
      to: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df',
      data: '0x',
      value: '0',
    },
    intent: {
      route: { portal: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df' },
      reward: { prover: '0xec004Ab4870c4e177c66949329dCdb503CE41022', deadline: 1_800_000_000 },
    },
    encodedRoute: '0xfeed',
    encodedReward: '0x',
  },
} as unknown as V1QuoteResponse;

function build(endpoint: unknown): {
  service: QuoteService;
  config: { getQuoteEndpoint: jest.Mock };
  ecoApi: { quote: jest.Mock };
} {
  const config = {
    getQuoteEndpoint: jest.fn().mockReturnValue(endpoint),
    getDappId: () => 'eco-routes-cli',
    isDebug: () => false,
  };
  const display = { log: jest.fn() };
  const ecoApi = { quote: jest.fn().mockResolvedValue(v1Quote) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new QuoteService(config as any, display as any, ecoApi as any);
  return { service, config, ecoApi };
}

describe('QuoteService — gateway branch', () => {
  it('quotes through EcoApiClient with the per-command env and maps the result', async () => {
    const { service, config, ecoApi } = build({
      type: 'gateway',
      baseUrl: 'https://api.stag.eco.com',
      env: 'staging',
    });
    const result = await service.getQuote(req);

    expect(config.getQuoteEndpoint).toHaveBeenCalledWith('staging');
    expect(ecoApi.quote).toHaveBeenCalledWith(
      expect.objectContaining({
        swapType: 'exact-in',
        funder: req.funder,
        dappId: 'eco-routes-cli',
        options: { visibility: 'public' },
      }),
      { env: 'staging' }
    );
    expect(result.encodedRoute).toBe('0xfeed');
    expect(result.sourcePortal).toBe('0xEC000064576f9C95a8623Bc0eff3db6d296ea6df');
    expect(result.prover).toBe('0xec004Ab4870c4e177c66949329dCdb503CE41022');
    expect(result.destinationAmount).toBe('990000');
  });

  it('does not touch EcoApiClient for the solver-v2 branch', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          contracts: { sourcePortal: '0x1', prover: '0x2', destinationPortal: '0x3' },
          quoteResponses: [
            { encodedRoute: '0xaa', deadline: 1, destinationAmount: '1', destinationChainID: 10 },
          ],
        }),
        { status: 200 }
      )
    );
    const { service, ecoApi } = build({
      type: 'solver-v2',
      url: 'https://solver.example.com/api/v2/quote/reverse',
    });
    const result = await service.getQuote(req);
    expect(ecoApi.quote).not.toHaveBeenCalled();
    expect(result.encodedRoute).toBe('0xaa');
    fetchMock.mockRestore();
  });
});
