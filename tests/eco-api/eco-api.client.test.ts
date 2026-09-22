import type { V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';

import { EcoApiClient, EcoApiRequestError } from '@/eco-api/eco-api.client';
import { RoutesCliError } from '@/shared/errors';

const display = { log: jest.fn() };

function client(
  overrides: { apiKey?: string; debug?: boolean; baseUrl?: string } = {}
): EcoApiClient {
  const config = {
    getGatewayBaseUrl: (env?: 'production' | 'staging') => ({
      baseUrl:
        overrides.baseUrl ??
        (env === 'staging' ? 'https://api.stag.eco.com' : 'https://api.eco.com'),
      env: env ?? 'production',
    }),
    getApiKey: jest.fn((_env?: 'production' | 'staging') => overrides.apiKey),
    isDebug: () => overrides.debug ?? false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new EcoApiClient(config as any, display as any);
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const minimalQuote = { id: 'q1', execution: null } as unknown as V1QuoteResponse;

describe('EcoApiClient', () => {
  let fetchMock: jest.SpyInstance;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    display.log.mockClear();
  });
  afterEach(() => fetchMock.mockRestore());

  it('POSTs /v1/quotes on the production host with JSON and the API key header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, minimalQuote));
    const req = {
      type: 'exact-in',
      source: { chainId: 8453, token: '0xa', funder: '0xf' },
      destination: { chainId: 10, token: '0xb', recipient: '0xr' },
      dappId: 'eco-routes-cli',
    } as const;

    const res = await client({ apiKey: 'secret-key' }).quote(req);

    expect(res.id).toBe('q1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eco.com/v1/quotes');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-api-key': 'secret-key',
    });
    expect(JSON.parse(init.body as string)).toEqual(req);
  });

  it('omits x-api-key when no key is configured and honours the env override', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, minimalQuote));
    const c = client();
    await c.quote({} as never, { env: 'staging' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stag.eco.com/v1/quotes');
    expect(init.headers).not.toHaveProperty('x-api-key');
    // The key is looked up for the environment actually being called.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((c as any).config.getApiKey).toHaveBeenCalledWith('staging');
  });

  it('GETs /v1/intents/status with the hash as a query parameter and unwraps results', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        results: [{ id: 'intent:0xab', type: 'intent', status: 'pending', updatedAt: null }],
        nextCursor: null,
      })
    );
    const entries = await client().intentStatus({ intentHash: '0xab' });
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('pending');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eco.com/v1/intents/status?intentHash=0xab');
    expect(init.method).toBe('GET');
  });

  it('turns an auth problem into a RoutesCliError naming ECO_API_KEY', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, {
        type: 'https://api.eco.com/v1/errors/invalid-api-key',
        title: 'API key is missing, unknown, or revoked',
        status: 401,
        code: 'invalid-api-key',
        requestId: 'r-9',
      })
    );
    const err: unknown = await client()
      .quote({} as never)
      .catch(e => e);
    expect(err).toBeInstanceOf(RoutesCliError);
    expect((err as Error).message).toContain('ECO_API_KEY');
    expect((err as Error).message).toContain('r-9');
  });

  it('turns any other problem into an EcoApiRequestError (so publish can fall back)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        type: 'https://api.eco.com/v1/errors/no-route-found',
        title: 'No route',
        status: 400,
        code: 'no-route-found',
        detail: 'nothing quoted',
      })
    );
    const err: unknown = await client()
      .quote({} as never)
      .catch(e => e);
    expect(err).toBeInstanceOf(EcoApiRequestError);
    expect(err).not.toBeInstanceOf(RoutesCliError);
    expect((err as EcoApiRequestError).problem?.code).toBe('no-route-found');
    expect((err as Error).message).toContain('nothing quoted');
  });

  it('falls back to the HTTP status text when the body is not a problem document', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' })
    );
    const err: unknown = await client()
      .quote({} as never)
      .catch(e => e);
    expect(err).toBeInstanceOf(EcoApiRequestError);
    expect((err as Error).message).toContain('502');
  });

  it('treats a bare 403 (gateway resource policy, no problem body) as an auth error', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, {
        Message: 'User is not authorized to access this resource with an explicit deny',
      })
    );
    const err: unknown = await client()
      .quote({} as never)
      .catch(e => e);
    expect(err).toBeInstanceOf(RoutesCliError);
    expect((err as Error).message).toContain('ECO_API_KEY');
  });

  it('wraps a network failure in EcoApiRequestError with the cause', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const err: unknown = await client()
      .quote({} as never)
      .catch(e => e);
    expect(err).toBeInstanceOf(EcoApiRequestError);
    expect((err as Error).message).toContain('api.eco.com');
    expect((err as Error).message).toContain('fetch failed');
  });

  it('debug logging names headers but never prints the key value', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, minimalQuote));
    await client({ apiKey: 'super-secret', debug: true }).quote({} as never);
    const logged = display.log.mock.calls.map(c => String(c[0])).join('\n');
    expect(logged).toContain('x-api-key');
    expect(logged).not.toContain('super-secret');
  });
});
