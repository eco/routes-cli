import { QuoteHttpError, QuoteService } from '@/quote/quote.service';

const REQUEST = {
  source: 8453n,
  destination: 42161n,
  amount: 300_000_000_000_000n,
  funder: '0x000000000000000000000000000000000000dEaD',
  recipient: '0x000000000000000000000000000000000000dEaD',
  routeToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  rewardToken: '0x0000000000000000000000000000000000000000',
};

function service(endpoint: { url: string; type: string; apiKey?: string }): QuoteService {
  const config = {
    getQuoteEndpoint: jest.fn(() => endpoint),
    getDappId: jest.fn(() => 'a2a-production-matrix'),
    isDebug: jest.fn(() => false),
  };
  const display = { log: jest.fn() };
  return new QuoteService(config as never, display as never);
}

describe('QuoteService diagnostics', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserves HTTP status, response body, and latency on quote failure', async () => {
    const body = {
      message: 'Source-swap routes from this chain are temporarily unavailable.',
      statusCode: 400,
    };
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: jest.fn().mockResolvedValue(body),
    } as unknown as Response);

    const result = service({
      url: 'https://solver-yellow.eco.com/api/v2/quote/reverse',
      type: 'solver-v2',
    }).getQuote(REQUEST);

    await expect(result).rejects.toMatchObject({
      name: 'QuoteHttpError',
      status: 400,
      body,
    });
    await expect(result).rejects.toHaveProperty('elapsedMs', expect.any(Number));
    await expect(result).rejects.toBeInstanceOf(QuoteHttpError);
  });

  it('returns latency and solver identity for a gateway quote', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: jest.fn().mockResolvedValue({
        data: [
          {
            quoteID: 'quote-1',
            solverID: 'yellow',
            quoteData: {
              contracts: {
                sourcePortal: '0x0000000000000000000000000000000000000001',
                destinationPortal: '0x0000000000000000000000000000000000000002',
                prover: '0x0000000000000000000000000000000000000003',
              },
              quoteResponse: {
                encodedRoute: '0x01',
                deadline: 1,
                destinationAmount: '1',
                destinationChainID: 42161,
              },
            },
          },
        ],
      }),
    } as unknown as Response);

    const quote = await service({ url: 'https://api.eco.com/quotes', type: 'gateway' }).getQuote(
      REQUEST
    );

    expect(quote.solverId).toBe('yellow');
    expect(quote.quoteId).toBe('quote-1');
    expect(quote.elapsedMs).toEqual(expect.any(Number));
  });

  it('uses the source funder as refund recipient for a cross-VM quote', async () => {
    const destinationRecipient = '3vvcFp6rUuTrrYK7SSqQKeYYiwvZXWmMnmgLfXDKgAu6';
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: jest.fn().mockResolvedValue({ message: 'stop after request' }),
    } as unknown as Response);

    await expect(
      service({
        url: 'https://solver-yellow.eco.com/api/v2/quote/reverse',
        type: 'solver-v2',
      }).getQuote({ ...REQUEST, recipient: destinationRecipient })
    ).rejects.toBeInstanceOf(QuoteHttpError);

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    const body = JSON.parse(String(request.body)) as {
      quoteRequest: { funder: string; refundRecipient: string; recipient: string };
    };
    expect(body.quoteRequest).toMatchObject({
      funder: REQUEST.funder,
      refundRecipient: REQUEST.funder,
      recipient: destinationRecipient,
    });
  });
});
