import { ConfigService as NestConfigService } from '@nestjs/config';

import { DisplayService } from '@/cli/services/display.service';
import { ConfigService, Ee528TestCase } from '@/config/config.service';
import { EnvSchema } from '@/config/validation/env.schema';
import { QuoteRequest, QuoteService } from '@/quote/quote.service';

const SOLVER = 'https://eco-solver-pr-528.eph.ecoinc.xyz';
const BASE_USDC = '0x833589fCD6eDb6E08f4c7c32D4f71b54bdA02913';
const ARB_USDT0 = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const WALLET = '0x1111111111111111111111111111111111111111';

function config(overrides: Record<string, string | undefined> = {}): ConfigService {
  const values = { SOLVER_URL: SOLVER, DAPP_ID: 'milkshake-ee528', ...overrides };
  return new ConfigService(new NestConfigService(values));
}

function request(caseId: Ee528TestCase = 'destination-mixture'): QuoteRequest {
  const destination = caseId === 'destination-mixture';
  return {
    source: destination ? 8453n : 42161n,
    destination: destination ? 42161n : 8453n,
    rewardToken: destination ? BASE_USDC : ARB_USDT0,
    routeToken: destination ? ARB_USDT0 : BASE_USDC,
    amount: 1_000_001n,
    funder: WALLET,
    recipient: WALLET,
  };
}

interface MockQuoteResponse {
  testing?: Record<string, unknown>;
  contracts: { sourcePortal: string; destinationPortal: string; prover: string };
  quoteResponses: Array<{
    encodedRoute: string;
    destinationAmount: string;
    sourceChainID: number;
    destinationChainID: number;
    finalDestinationChainID: number;
    intentExecutionType: string;
    deadline: number;
    quoteExpiry: number;
  }>;
}

function response(caseId: Ee528TestCase = 'destination-mixture'): MockQuoteResponse {
  return {
    testing: {
      forced: true,
      planner: 'pe',
      caseId,
      bridgeInventoryPercent: 50,
      ...(caseId === 'source-mixture' ? { sourceSwapPercent: 50 } : {}),
      economicAcceptance: false,
    } as Record<string, unknown> | undefined,
    contracts: { sourcePortal: WALLET, destinationPortal: WALLET, prover: WALLET },
    quoteResponses: [
      {
        encodedRoute: '0x1234',
        destinationAmount: '999999',
        sourceChainID: caseId === 'destination-mixture' ? 8453 : 42161,
        destinationChainID: caseId === 'destination-mixture' ? 8453 : 42161,
        finalDestinationChainID: caseId === 'destination-mixture' ? 42161 : 8453,
        intentExecutionType: 'SELF_PUBLISH',
        deadline: Math.floor(Date.now() / 1000) + 300,
        quoteExpiry: Math.floor(Date.now() / 1000) + 120,
      },
    ],
  };
}

function service(testCase?: string): QuoteService {
  return new QuoteService(config({ EE528_TEST_CASE: testCase }), {
    log: jest.fn(),
  } as unknown as DisplayService);
}

const originalFetch = global.fetch;
let fetchMock: jest.Mock;

beforeEach(() => {
  fetchMock = jest.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(response()) });
  global.fetch = fetchMock;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('EE528 configuration', () => {
  it('is opt-in and leaves normal solver endpoint unchanged', () => {
    expect(config().getEe528TestCase()).toBeUndefined();
    expect(config().getQuoteEndpoint()).toEqual({
      url: `${SOLVER}/api/v2/quote/reverse`,
      type: 'solver-v2',
    });
    expect(EnvSchema.safeParse({ EE528_TEST_CASE: 'destination-mixture' }).success).toBe(true);
    expect(EnvSchema.safeParse({ EE528_TEST_CASE: '' }).success).toBe(false);
    expect(() => config({ EE528_TEST_CASE: 'typo' }).getQuoteEndpoint()).toThrow('EE528_TEST_CASE');
  });

  it.each([
    undefined,
    'https://eco-solver-pr-416.eph.ecoinc.xyz',
    'http://eco-solver-pr-528.eph.ecoinc.xyz',
    'https://eco-solver-pr-528.eph.ecoinc.xyz.attacker.example',
    'https://eco-solver-pr-528.eph.ecoinc.xyz:8443',
    'https://eco-solver-pr-528.eph.ecoinc.xyz/path',
    'https://eco-solver-pr-528.eph.ecoinc.xyz?planner=stand-in',
    'https://eco-solver-pr-528.eph.ecoinc.xyz#fragment',
    'https://user:password@eco-solver-pr-528.eph.ecoinc.xyz',
    'https://localhost.example',
    'file://localhost/',
  ])('refuses unapproved solver origin %s before fetching', async solver => {
    const quote = new QuoteService(
      config({ EE528_TEST_CASE: 'destination-mixture', SOLVER_URL: solver }),
      {} as DisplayService
    );
    await expect(quote.getQuote(request())).rejects.toThrow('EE528_TEST_CASE');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['http://localhost:3000', 'http://127.0.0.1:3000', 'https://[::1]:3000'])(
    'allows explicit local testing origin %s',
    solver => {
      expect(
        config({ EE528_TEST_CASE: 'destination-mixture', SOLVER_URL: solver }).getQuoteEndpoint()
          .url
      ).toBe(`${solver}/api/v2/testing/split-quote`);
    }
  );

  it.each([undefined, 'eco-routes-cli', 'milkshake-ee416'])('refuses wrong partner %s', dapp => {
    expect(() =>
      config({ EE528_TEST_CASE: 'destination-mixture', DAPP_ID: dapp }).getQuoteEndpoint()
    ).toThrow('DAPP_ID=milkshake-ee528');
  });
});

describe('EE528 forced quotes', () => {
  it.each(['destination-mixture', 'source-mixture'] as const)(
    'requests only PE %s with exact ratios and propagates provenance',
    async caseId => {
      const raw = response(caseId);
      fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(raw) });
      const result = await service(caseId).getQuote(request(caseId));
      const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
      const body: unknown = JSON.parse(options.body as string);
      expect(url).toBe(`${SOLVER}/api/v2/testing/split-quote`);
      expect(options.redirect).toBe('error');
      expect(body).toEqual({
        dAppID: 'milkshake-ee528',
        quoteID: expect.any(String) as unknown,
        intentExecutionTypes: ['SELF_PUBLISH'],
        quoteRequest: {
          sourceChainID: request(caseId).source.toString(),
          destinationChainID: request(caseId).destination.toString(),
          sourceAmount: '1000001',
          sourceToken: request(caseId).rewardToken,
          destinationToken: request(caseId).routeToken,
          funder: WALLET,
          recipient: WALLET,
        },
        planner: 'pe',
        case: {
          caseId,
          bridgeInventoryPercent: 50,
          ...(caseId === 'source-mixture' ? { sourceSwapPercent: 50 } : {}),
          destination: 'per-leg',
        },
      });
      expect(result.testing).toEqual(raw.testing);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['destination-mixture', 'source-mixture'] as const)(
    'rejects unsupported direction, token and rounded-empty input for %s',
    async caseId => {
      const valid = request(caseId);
      for (const params of [
        { ...valid, source: 10n },
        { ...valid, destination: 1337n },
        { ...valid, routeToken: WALLET },
        { ...valid, rewardToken: WALLET },
        { ...valid, amount: 1n },
        { ...valid, amount: 0n },
        request(caseId === 'source-mixture' ? 'destination-mixture' : 'source-mixture'),
      ]) {
        await expect(service(caseId).getQuote(params)).rejects.toThrow('requires');
      }
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    undefined,
    {},
    { planner: 'stand-in' },
    { forced: false },
    { economicAcceptance: true },
    { caseId: 'source-mixture' },
    { bridgeInventoryPercent: 49 },
    { bridgeInventoryPercent: '50' },
    { sourceSwapPercent: 50 },
    { unexpected: true },
  ])('rejects missing or altered destination provenance %j', async altered => {
    const raw = response();
    raw.testing = altered === undefined ? undefined : { ...raw.testing, ...altered };
    if (altered && Object.keys(altered).length === 0) raw.testing = {};
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(raw) });
    await expect(service('destination-mixture').getQuote(request())).rejects.toThrow('provenance');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 49, '50'])('requires exact source ratio %s', async sourceSwapPercent => {
    const raw = response('source-mixture');
    raw.testing!.sourceSwapPercent = sourceSwapPercent;
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(raw) });
    await expect(service('source-mixture').getQuote(request('source-mixture'))).rejects.toThrow(
      'provenance'
    );
  });

  it.each([
    'empty',
    'multiple',
    'route',
    'amount',
    'expired',
    'quoteExpiry',
    'chain',
    'finalChain',
    'sourceChain',
    'gasless',
    'contracts',
  ])('rejects %s forced response without a second request', async fault => {
    const raw = response();
    switch (fault) {
      case 'empty':
        raw.quoteResponses = [];
        break;
      case 'multiple':
        raw.quoteResponses.push(raw.quoteResponses[0]);
        break;
      case 'route':
        raw.quoteResponses[0].encodedRoute = '0x';
        break;
      case 'amount':
        raw.quoteResponses[0].destinationAmount = '0';
        break;
      case 'expired':
        raw.quoteResponses[0].deadline = 1;
        break;
      case 'chain':
        raw.quoteResponses[0].destinationChainID = 10;
        break;
      case 'finalChain':
        raw.quoteResponses[0].finalDestinationChainID = 10;
        break;
      case 'sourceChain':
        raw.quoteResponses[0].sourceChainID = 10;
        break;
      case 'quoteExpiry':
        raw.quoteResponses[0].quoteExpiry = 1;
        break;
      case 'gasless':
        raw.quoteResponses[0].intentExecutionType = 'GASLESS';
        break;
      case 'contracts':
        raw.contracts.destinationPortal = '';
        break;
    }
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(raw) });
    await expect(service('destination-mixture').getQuote(request())).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(['decline', 'network', 'malformed'])('does not retry after %s failure', async fault => {
    if (fault === 'decline')
      fetchMock.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ reason: 'inventory' }),
      });
    if (fault === 'network') fetchMock.mockRejectedValueOnce(new Error('network'));
    if (fault === 'malformed')
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.reject(new Error('invalid JSON')),
      });
    await expect(service('destination-mixture').getQuote(request())).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('normal quote regression', () => {
  it('keeps normal solver request and response shape unchanged', async () => {
    const raw = response();
    delete raw.testing;
    fetchMock.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(raw) });
    const result = await service().getQuote(request());
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      quoteRequest: { sourceChainID: string | number; sourceAmount: string };
    };
    expect(url).toBe(`${SOLVER}/api/v2/quote/reverse`);
    expect(Object.keys(body).sort()).toEqual([
      'dAppID',
      'intentExecutionTypes',
      'quoteID',
      'quoteRequest',
    ]);
    expect(body.quoteRequest.sourceChainID).toBe('8453');
    expect(body.quoteRequest.sourceAmount).toBe('1000001');
    expect(options.redirect).toBeUndefined();
    expect(result.testing).toBeUndefined();
    expect(result.encodedRoute).toBe('0x1234');
  });

  it('keeps wrapped production quote request and response unchanged', async () => {
    const raw = response();
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          data: { contracts: raw.contracts, quoteResponse: raw.quoteResponses[0] },
        }),
    });
    const quote = new QuoteService(config({ SOLVER_URL: undefined }), {} as DisplayService);
    expect((await quote.getQuote(request())).encodedRoute).toBe('0x1234');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      quoteRequest: { sourceChainID: string | number; sourceAmount: string };
    };
    expect(url).toBe('https://quotes.eco.com/api/v3/quotes/single');
    expect(Object.keys(body).sort()).toEqual(['dAppID', 'quoteRequest']);
    expect(body.quoteRequest.sourceChainID).toBe(8453);
  });
});
