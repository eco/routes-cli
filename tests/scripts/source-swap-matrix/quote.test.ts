/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unsafe-assignment */
import { QuoteShapeError, requestQuote } from '@/scripts/source-swap-matrix/lib/quote';

function mockFetch(impl: jest.Mock) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = impl;
}

const baseInput = {
  solverUrl: 'http://localhost:3000',
  scenarioId: 'SS-1',
  sourceChain: 8453,
  destChain: 42161,
  sourceToken: '0x4200000000000000000000000000000000000006',
  destinationToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
  sourceAmount: 50_000_000_000_000_000n,
  funder: '0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1',
  recipient: '0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1',
};

describe('requestQuote', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('POSTs to /api/v2/quote/reverse with the matrix payload and returns the parsed body', async () => {
    const fetchMock = jest.fn(async (_url: string, _init: { body: string }) => ({
      ok: true,
      status: 200,
      json: async () => ({
        quoteResponses: [{ encodedRoute: '0xabcd', deadline: '999', destinationAmount: '1' }],
        contracts: { sourcePortal: '0xPORTAL', prover: '0xPROVER' },
      }),
    }));
    mockFetch(fetchMock as unknown as jest.Mock);
    const out = await requestQuote(baseInput);
    expect(out.quoteResponses[0].encodedRoute).toBe('0xabcd');
    expect(out.contracts.sourcePortal).toBe('0xPORTAL');
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('http://localhost:3000/api/v2/quote/reverse');
    const body = JSON.parse(call[1].body);
    expect(body.intentExecutionTypes).toEqual(['SELF_PUBLISH']);
    expect(body.quoteRequest.sourceChainID).toBe('8453');
    expect(body.quoteRequest.sourceAmount).toBe('50000000000000000');
  });

  it('throws Error on non-2xx with status code in the message', async () => {
    mockFetch(
      jest.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ message: 'boom' }),
      })) as unknown as jest.Mock
    );
    await expect(requestQuote(baseInput)).rejects.toThrow(/500/);
  });

  it('throws QuoteShapeError when encodedRoute is missing', async () => {
    mockFetch(
      jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          quoteResponses: [{ deadline: '1' }],
          contracts: { sourcePortal: '0xP' },
        }),
      })) as unknown as jest.Mock
    );
    await expect(requestQuote(baseInput)).rejects.toBeInstanceOf(QuoteShapeError);
  });

  it('throws QuoteShapeError when sourcePortal is missing', async () => {
    mockFetch(
      jest.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          quoteResponses: [{ encodedRoute: '0xabcd', deadline: '1' }],
          contracts: {},
        }),
      })) as unknown as jest.Mock
    );
    await expect(requestQuote(baseInput)).rejects.toBeInstanceOf(QuoteShapeError);
  });
});
