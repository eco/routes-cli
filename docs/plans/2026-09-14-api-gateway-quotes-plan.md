# Eco API Gateway Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the public Eco API gateway (`api.eco.com/v1`, staging `api.stag.eco.com/v1`) the default quote source of routes-cli and back `status` with `GET /v1/intents/status`, without changing how intents are built or published.

**Architecture:** A new `EcoApiClient` (NestJS injectable, `src/eco-api/`) speaks the public `/v1` contract with types from `@eco-foundation/api-schemas`. A pure adapter (`src/quote/gateway-quote.adapter.ts`) maps between the CLI's existing `QuoteRequest`/`QuoteResult` and `V1QuoteRequest`/`V1QuoteResponse`, so `QuoteService` only gains a third dispatch branch. `StatusService` gains a gateway path used when no `--chain` is given.

**Tech Stack:** TypeScript, NestJS + nest-commander, zod 4 (env schema), global `fetch` (Node ≥ 18), jest + ts-jest, `@eco-foundation/api-schemas@0.8.0` (types only, devDependency — already added).

**Spec:** `docs/plans/2026-09-14-api-gateway-quotes-design.md`

## Global Constraints

- Never print `ECO_API_KEY` (or any header value) — debug output logs header names only.
- `@eco-foundation/api-schemas` is imported with `import type` only; nothing from it may reach the ncc bundle.
- Resolution order is fixed: `SOLVER_URL` → `QUOTES_API_URL` → gateway. `quotes.eco.com` is no longer a default.
- Gateway hosts: production `https://api.eco.com`, staging `https://api.stag.eco.com`; `ECO_API_URL` overrides; `--env` beats `ECO_ENV`.
- Quote requests use `options.visibility: 'public'`; a quote with `execution: null` or `encodedRoute: null` is a hard error (no manual fallback).
- Auth failures (HTTP 401/403 or Problem `code` `invalid-api-key`) are hard errors; other Problems and network failures behave like today's quote failures (the publish flow falls back to a manual route).
- Fulfilled ⇔ gateway status word ∈ {`filled`, `settled`}.
- Commit after every task with the trailer `Claude-Session: https://claude.ai/code/session_01ENQw9Ze2ZdghQGCNpKjo9L`; do not co-author; commit only files this plan touches. Run `pnpm -s typecheck`, `npx eslint <files>`, `npx prettier --check <files>` before each commit.

---

### Task 1: Gateway environment config

**Files:**
- Modify: `src/config/validation/env.schema.ts`
- Modify: `src/config/config.service.ts` (`getQuoteEndpoint`, new `getGatewayBaseUrl`, `getApiKey`)
- Test: `tests/config/quote-endpoint.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type GatewayEnv = 'production' | 'staging';
  export type QuoteEndpoint =
    | { type: 'solver-v2'; url: string }
    | { type: 'custom'; url: string }
    | { type: 'gateway'; baseUrl: string; env: GatewayEnv; apiKey?: string };
  ConfigService.getQuoteEndpoint(envOverride?: GatewayEnv): QuoteEndpoint
  ConfigService.getGatewayBaseUrl(envOverride?: GatewayEnv): { baseUrl: string; env: GatewayEnv }
  ConfigService.getApiKey(): string | undefined
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/config/quote-endpoint.test.ts
import { ConfigService as NestConfigService } from '@nestjs/config';

import { ConfigService } from '@/config/config.service';
import { EnvSchema } from '@/config/validation/env.schema';

function build(env: Record<string, string>): ConfigService {
  const parsed = EnvSchema.parse(env);
  return new ConfigService(new NestConfigService(parsed));
}

describe('ConfigService.getQuoteEndpoint — gateway default', () => {
  it('defaults to the production gateway when nothing is set', () => {
    expect(build({}).getQuoteEndpoint()).toEqual({
      type: 'gateway',
      baseUrl: 'https://api.eco.com',
      env: 'production',
    });
  });

  it('ECO_ENV=staging selects the staging gateway host', () => {
    expect(build({ ECO_ENV: 'staging' }).getQuoteEndpoint()).toMatchObject({
      type: 'gateway',
      baseUrl: 'https://api.stag.eco.com',
      env: 'staging',
    });
  });

  it('a per-command env override beats ECO_ENV', () => {
    expect(build({ ECO_ENV: 'production' }).getQuoteEndpoint('staging')).toMatchObject({
      baseUrl: 'https://api.stag.eco.com',
      env: 'staging',
    });
  });

  it('ECO_API_URL overrides the host and strips a trailing slash', () => {
    expect(build({ ECO_API_URL: 'https://gw.example.com/' }).getQuoteEndpoint()).toMatchObject({
      type: 'gateway',
      baseUrl: 'https://gw.example.com',
    });
  });

  it('carries ECO_API_KEY without exposing it anywhere else', () => {
    const cfg = build({ ECO_API_KEY: 'k-123' });
    expect(cfg.getQuoteEndpoint()).toMatchObject({ type: 'gateway', apiKey: 'k-123' });
    expect(cfg.getApiKey()).toBe('k-123');
  });

  it('SOLVER_URL still wins over everything', () => {
    expect(build({ SOLVER_URL: 'https://solver.example.com/', ECO_API_KEY: 'k' }).getQuoteEndpoint()).toEqual(
      { type: 'solver-v2', url: 'https://solver.example.com/api/v2/quote/reverse' }
    );
  });

  it('QUOTES_API_URL beats the gateway but not SOLVER_URL', () => {
    expect(build({ QUOTES_API_URL: 'https://q.example.com/api/v3/quotes/single' }).getQuoteEndpoint()).toEqual(
      { type: 'custom', url: 'https://q.example.com/api/v3/quotes/single' }
    );
  });

  it('rejects an unknown ECO_ENV at schema level', () => {
    expect(() => EnvSchema.parse({ ECO_ENV: 'prod' })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/config/quote-endpoint.test.ts`
Expected: FAIL — the first test receives `{ type: 'production', url: 'https://quotes.eco.com/...' }`; `getApiKey` is not a function.

- [ ] **Step 3: Write minimal implementation**

`src/config/validation/env.schema.ts` — add after `QUOTES_API_URL`:

```ts
  ECO_ENV: z.enum(['production', 'staging']).default('production'),
  ECO_API_URL: z.string().url().optional(),
  ECO_API_KEY: z.string().min(1).optional(),
```

`src/config/config.service.ts` — replace `getQuoteEndpoint` with:

```ts
export type GatewayEnv = 'production' | 'staging';

export type QuoteEndpoint =
  | { type: 'solver-v2'; url: string }
  | { type: 'custom'; url: string }
  | { type: 'gateway'; baseUrl: string; env: GatewayEnv; apiKey?: string };

const GATEWAY_HOSTS: Record<GatewayEnv, string> = {
  production: 'https://api.eco.com',
  staging: 'https://api.stag.eco.com',
};
```

(module-level, above the class) and inside the class:

```ts
  /**
   * Quote source, highest priority first:
   *   1. SOLVER_URL          — solver-v2 API at {SOLVER_URL}/api/v2/quote/reverse
   *   2. QUOTES_API_URL — this exact URL, quote-service v3 shape
   *   3. Eco API gateway     — POST {baseUrl}/v1/quotes (default)
   */
  getQuoteEndpoint(envOverride?: GatewayEnv): QuoteEndpoint {
    const solverUrl = this.config.get<string>('SOLVER_URL')?.replace(/\/$/, '');
    if (solverUrl) {
      return { url: `${solverUrl}/api/v2/quote/reverse`, type: 'solver-v2' };
    }
    const endpointUrl = this.config.get<string>('QUOTES_API_URL');
    if (endpointUrl) {
      return { url: endpointUrl, type: 'custom' };
    }
    const { baseUrl, env } = this.getGatewayBaseUrl(envOverride);
    const apiKey = this.getApiKey();
    return { type: 'gateway', baseUrl, env, ...(apiKey && { apiKey }) };
  }

  /** Gateway host: ECO_API_URL wins, else the ECO_ENV (or override) host map. */
  getGatewayBaseUrl(envOverride?: GatewayEnv): { baseUrl: string; env: GatewayEnv } {
    const env = envOverride ?? this.config.get<GatewayEnv>('ECO_ENV') ?? 'production';
    const override = this.config.get<string>('ECO_API_URL')?.replace(/\/$/, '');
    return { baseUrl: override ?? GATEWAY_HOSTS[env], env };
  }

  getApiKey(): string | undefined {
    return this.config.get<string>('ECO_API_KEY');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/config/quote-endpoint.test.ts && pnpm -s typecheck`
Expected: PASS; typecheck will flag `quote.service.ts` (it reads `.url` off the union) — that is fixed in Task 5; for now make `quote.service.ts` compile by narrowing: `if (endpoint.type === 'gateway') throw new Error('gateway quotes are wired in Task 5');` and read `url` only from the other two branches.

- [ ] **Step 5: Commit**

```bash
git add src/config/validation/env.schema.ts src/config/config.service.ts src/quote/quote.service.ts tests/config/quote-endpoint.test.ts
git commit -m "feat(config): ECO_ENV / ECO_API_URL / ECO_API_KEY and a gateway quote endpoint"
```

---

### Task 2: `RoutesCliError.apiError` for RFC 7807 problems

**Files:**
- Modify: `src/shared/errors/routes-cli-error.ts`
- Test: `tests/core/routes-cli-error.test.ts` (create)

**Interfaces:**
- Produces:
  ```ts
  export interface ApiProblem { status: number; code: string; title: string; detail?: string }
  RoutesCliError.apiError(problem: ApiProblem, requestId?: string): RoutesCliError
  // code = ErrorCode.QUOTE_SERVICE_ERROR; isUserError = true for 401/403/invalid-api-key
  RoutesCliError.isAuthProblem(problem: ApiProblem): boolean
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/core/routes-cli-error.test.ts
import { ErrorCode, RoutesCliError } from '@/shared/errors';

describe('RoutesCliError.apiError', () => {
  it('formats a problem with code, title, detail and request id', () => {
    const err = RoutesCliError.apiError(
      { status: 400, code: 'no-route-found', title: 'No route', detail: 'No solver quoted 8453→5042' },
      'req-1'
    );
    expect(err).toBeInstanceOf(RoutesCliError);
    expect(err.code).toBe(ErrorCode.QUOTE_SERVICE_ERROR);
    expect(err.message).toContain('no-route-found');
    expect(err.message).toContain('No route');
    expect(err.message).toContain('No solver quoted 8453→5042');
    expect(err.message).toContain('req-1');
    expect(err.isUserError).toBe(false);
  });

  it.each([
    [{ status: 401, code: 'unauthorized', title: 'Unauthorized' }],
    [{ status: 403, code: 'forbidden', title: 'Forbidden' }],
    [{ status: 400, code: 'invalid-api-key', title: 'API key is missing, unknown, or revoked' }],
  ])('marks auth problems as user errors and names ECO_API_KEY: %j', problem => {
    expect(RoutesCliError.isAuthProblem(problem)).toBe(true);
    const err = RoutesCliError.apiError(problem);
    expect(err.isUserError).toBe(true);
    expect(err.message).toContain('ECO_API_KEY');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/core/routes-cli-error.test.ts`
Expected: FAIL — `RoutesCliError.apiError is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append inside `RoutesCliError` (before the closing brace) and export the interface from the same file:

```ts
export interface ApiProblem {
  status: number;
  code: string;
  title: string;
  detail?: string;
}
```

```ts
  static isAuthProblem(problem: ApiProblem): boolean {
    return problem.status === 401 || problem.status === 403 || problem.code === 'invalid-api-key';
  }

  /** An RFC 7807 problem returned by the Eco API gateway. */
  static apiError(problem: ApiProblem, requestId?: string): RoutesCliError {
    const auth = RoutesCliError.isAuthProblem(problem);
    const lines = [
      `Eco API error ${problem.status} (${problem.code}): ${problem.title}`,
      ...(problem.detail ? [`  ${problem.detail}`] : []),
      ...(requestId ? [`  Request ID: ${requestId}`] : []),
      ...(auth
        ? ['  Fix: set ECO_API_KEY in your .env file to a key with access to the v1 API (see the API key dashboard).']
        : []),
    ];
    return new RoutesCliError(ErrorCode.QUOTE_SERVICE_ERROR, lines.join('\n'), auth);
  }
```

Make sure `src/shared/errors/index.ts` re-exports `ApiProblem` (it already re-exports everything from `routes-cli-error` if it uses `export *`; otherwise add it).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/core/routes-cli-error.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/errors tests/core/routes-cli-error.test.ts
git commit -m "feat(errors): RoutesCliError.apiError for gateway RFC 7807 problems"
```

---

### Task 3: `EcoApiClient`

**Files:**
- Create: `src/eco-api/eco-api.client.ts`
- Create: `src/eco-api/eco-api.module.ts`
- Test: `tests/eco-api/eco-api.client.test.ts`

**Interfaces:**
- Consumes: `ConfigService.getGatewayBaseUrl`, `getApiKey`, `isDebug` (Task 1); `RoutesCliError.apiError`, `isAuthProblem` (Task 2); `DisplayService.log`.
- Produces:
  ```ts
  export class EcoApiRequestError extends Error { constructor(message: string, readonly problem?: ApiProblem, readonly requestId?: string) }
  @Injectable() export class EcoApiClient {
    constructor(config: ConfigService, display: DisplayService)
    quote(req: V1QuoteRequest, opts?: { env?: GatewayEnv }): Promise<V1QuoteResponse>
    intentStatus(params: { intentHash: string }, opts?: { env?: GatewayEnv }): Promise<V1StatusEntry[]>
  }
  ```
  Throw rules: auth problem → `RoutesCliError.apiError` (hard stop); any other non-2xx → `EcoApiRequestError` (plain `Error` subclass, so the publish flow's manual fallback still triggers); fetch rejection → `EcoApiRequestError` wrapping the cause.

- [ ] **Step 1: Write the failing test**

```ts
// tests/eco-api/eco-api.client.test.ts
import type { V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';

import { EcoApiClient, EcoApiRequestError } from '@/eco-api/eco-api.client';
import { RoutesCliError } from '@/shared/errors';

const display = { log: jest.fn() };

function client(overrides: { apiKey?: string; debug?: boolean; baseUrl?: string } = {}): EcoApiClient {
  const config = {
    getGatewayBaseUrl: (env?: 'production' | 'staging') => ({
      baseUrl: overrides.baseUrl ?? (env === 'staging' ? 'https://api.stag.eco.com' : 'https://api.eco.com'),
      env: env ?? 'production',
    }),
    getApiKey: () => overrides.apiKey,
    isDebug: () => overrides.debug ?? false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new EcoApiClient(config as any, display as any);
}

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
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
    const req = { swapType: 'exact-in', funder: '0xf', source: { chainId: 8453, token: '0xa' }, destination: { chainId: 10, token: '0xb' } } as const;

    const res = await client({ apiKey: 'secret-key' }).quote(req);

    expect(res.id).toBe('q1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eco.com/v1/quotes');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json', 'x-api-key': 'secret-key' });
    expect(JSON.parse(init.body as string)).toEqual(req);
  });

  it('omits x-api-key when no key is configured and honours the env override', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, minimalQuote));
    await client().quote({} as never, { env: 'staging' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.stag.eco.com/v1/quotes');
    expect(init.headers).not.toHaveProperty('x-api-key');
  });

  it('GETs /v1/intents/status with the hash as a query parameter and unwraps results', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { results: [{ id: 'intent:0xab', type: 'intent', status: 'pending', updatedAt: null }], nextCursor: null }));
    const entries = await client().intentStatus({ intentHash: '0xab' });
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('pending');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.eco.com/v1/intents/status?intentHash=0xab');
    expect(init.method).toBe('GET');
  });

  it('turns an auth problem into a RoutesCliError naming ECO_API_KEY', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { type: 'https://api.eco.com/v1/errors/invalid-api-key', title: 'API key is missing, unknown, or revoked', status: 401, code: 'invalid-api-key', requestId: 'r-9' })
    );
    const err = await client().quote({} as never).catch(e => e);
    expect(err).toBeInstanceOf(RoutesCliError);
    expect((err as Error).message).toContain('ECO_API_KEY');
    expect((err as Error).message).toContain('r-9');
  });

  it('turns any other problem into an EcoApiRequestError (so publish can fall back)', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { type: 'https://api.eco.com/v1/errors/no-route-found', title: 'No route', status: 400, code: 'no-route-found', detail: 'nothing quoted' })
    );
    const err = await client().quote({} as never).catch(e => e);
    expect(err).toBeInstanceOf(EcoApiRequestError);
    expect(err).not.toBeInstanceOf(RoutesCliError);
    expect((err as EcoApiRequestError).problem?.code).toBe('no-route-found');
    expect((err as Error).message).toContain('nothing quoted');
  });

  it('falls back to the HTTP status text when the body is not a problem document', async () => {
    fetchMock.mockResolvedValue(new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const err = await client().quote({} as never).catch(e => e);
    expect(err).toBeInstanceOf(EcoApiRequestError);
    expect((err as Error).message).toContain('502');
  });

  it('wraps a network failure in EcoApiRequestError with the cause', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const err = await client().quote({} as never).catch(e => e);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/eco-api/eco-api.client.test.ts`
Expected: FAIL — cannot find module `@/eco-api/eco-api.client`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/eco-api/eco-api.client.ts
/**
 * Client for the public Eco API (AWS API Gateway front door, `/v1`).
 *
 * Hosts come from ConfigService (ECO_API_URL, else ECO_ENV → api.eco.com / api.stag.eco.com);
 * `ECO_API_KEY` is sent as `x-api-key` when present. Non-2xx responses are RFC 7807 problem
 * documents: auth problems become RoutesCliError (hard stop), everything else becomes
 * EcoApiRequestError — a plain Error subclass — so callers such as the publish flow can treat it
 * like any other quote-service outage and fall back.
 */
import { Injectable } from '@nestjs/common';

import type {
  V1ProblemBody,
  V1QuoteRequest,
  V1QuoteResponse,
  V1StatusEntry,
} from '@eco-foundation/api-schemas/v1/types';

import { DisplayService } from '@/cli/services/display.service';
import { ConfigService, GatewayEnv } from '@/config/config.service';
import { ApiProblem, RoutesCliError } from '@/shared/errors';

export interface EcoApiCallOptions {
  env?: GatewayEnv;
}

export class EcoApiRequestError extends Error {
  constructor(
    message: string,
    public readonly problem?: ApiProblem,
    public readonly requestId?: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EcoApiRequestError';
  }
}

interface StatusPage {
  results: V1StatusEntry[];
  nextCursor: string | null;
}

@Injectable()
export class EcoApiClient {
  constructor(
    private readonly config: ConfigService,
    private readonly display: DisplayService
  ) {}

  quote(req: V1QuoteRequest, opts: EcoApiCallOptions = {}): Promise<V1QuoteResponse> {
    return this.request<V1QuoteResponse>('POST', '/v1/quotes', opts, req);
  }

  async intentStatus(
    params: { intentHash: string },
    opts: EcoApiCallOptions = {}
  ): Promise<V1StatusEntry[]> {
    const query = new URLSearchParams({ intentHash: params.intentHash }).toString();
    const page = await this.request<StatusPage>('GET', `/v1/intents/status?${query}`, opts);
    return page.results ?? [];
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    opts: EcoApiCallOptions,
    body?: unknown
  ): Promise<T> {
    const { baseUrl } = this.config.getGatewayBaseUrl(opts.env);
    const url = `${baseUrl}${path}`;
    const apiKey = this.config.getApiKey();
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(apiKey && { 'x-api-key': apiKey }),
    };

    if (this.config.isDebug()) {
      // Header NAMES only — the key value must never reach a log.
      this.display.log(`[DEBUG] Eco API ${method} ${url} headers=[${Object.keys(headers).join(', ')}]`);
    }

    const started = performance.now();
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : String(cause);
      throw new EcoApiRequestError(`Eco API unreachable at ${url}: ${reason}`, undefined, undefined, cause);
    }

    const text = await response.text();
    if (this.config.isDebug()) {
      this.display.log(
        `[DEBUG] Eco API ${response.status} in ${(performance.now() - started).toFixed(0)}ms: ${text.slice(0, 2000)}`
      );
    }

    if (!response.ok) throw this.toError(response, text);
    return JSON.parse(text) as T;
  }

  private toError(response: Response, text: string): Error {
    let parsed: (Partial<V1ProblemBody> & { requestId?: string }) | undefined;
    try {
      parsed = JSON.parse(text) as Partial<V1ProblemBody> & { requestId?: string };
    } catch {
      parsed = undefined;
    }
    const requestId = parsed?.requestId ?? response.headers.get('x-amzn-requestid') ?? undefined;

    if (parsed && typeof parsed.code === 'string' && typeof parsed.title === 'string') {
      const problem: ApiProblem = {
        status: typeof parsed.status === 'number' ? parsed.status : response.status,
        code: parsed.code,
        title: parsed.title,
        ...(parsed.detail && { detail: parsed.detail }),
      };
      if (RoutesCliError.isAuthProblem(problem)) return RoutesCliError.apiError(problem, requestId);
      const detail = problem.detail ? ` — ${problem.detail}` : '';
      return new EcoApiRequestError(
        `Eco API error ${problem.status} (${problem.code}): ${problem.title}${detail}`,
        problem,
        requestId
      );
    }

    if (response.status === 401 || response.status === 403) {
      // API Gateway itself can reject before the authorizer produces a problem body.
      return RoutesCliError.apiError(
        { status: response.status, code: 'unauthorized', title: response.statusText || 'Unauthorized' },
        requestId
      );
    }
    return new EcoApiRequestError(
      `Eco API error ${response.status} ${response.statusText}: ${text.slice(0, 300)}`,
      undefined,
      requestId
    );
  }
}
```

```ts
// src/eco-api/eco-api.module.ts
import { Module } from '@nestjs/common';

import { DisplayModule } from '@/cli/services/display.module';

import { EcoApiClient } from './eco-api.client';

@Module({
  imports: [DisplayModule],
  providers: [EcoApiClient],
  exports: [EcoApiClient],
})
export class EcoApiModule {}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/eco-api && pnpm -s typecheck`
Expected: PASS. If the `import type` from `@eco-foundation/api-schemas/v1/types` fails to resolve under ts-jest (`moduleResolution: node`), add `"@eco-foundation/api-schemas/v1/types": ["node_modules/@eco-foundation/api-schemas/v1/types.d.ts"]` under `paths` in `tests/tsconfig.json` and mirror it in `tsconfig.json`.

- [ ] **Step 5: Commit**

```bash
git add src/eco-api tests/eco-api tsconfig.json tests/tsconfig.json
git commit -m "feat(eco-api): EcoApiClient for the public /v1 gateway (quotes, intent status)"
```

---

### Task 4: Gateway quote adapter (pure)

**Files:**
- Create: `src/quote/gateway-quote.adapter.ts`
- Modify: `src/quote/quote.service.ts:8-16` (`QuoteRequest` gains `env?` and `sourcePortalFallback?`)
- Test: `tests/quote/gateway-quote.adapter.test.ts`

**Interfaces:**
- Consumes: `QuoteRequest`, `QuoteResult` from `src/quote/quote.service.ts`.
- Produces:
  ```ts
  export function toV1QuoteRequest(req: QuoteRequest, dappId: string): V1QuoteRequest
  export function fromV1QuoteResponse(res: V1QuoteResponse, req: QuoteRequest): QuoteResult
  // fromV1QuoteResponse throws RoutesCliError (QUOTE_SERVICE_ERROR) when execution is null,
  // encodedRoute is null, or the funding tx is not EVM and req.sourcePortalFallback is unset.
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/quote/gateway-quote.adapter.test.ts
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
    source: { chainId: 8453, token: req.rewardToken, amount: '500000', symbol: 'USDC', decimals: 6 },
    destination: { chainId: 5042, token: req.routeToken, amount: '499000', minAmountOut: '499000', recipient: req.recipient, symbol: 'USDC', decimals: 6 },
    slippage: 0,
    fees: [],
    steps: [
      { kind: 'bridge', tool: 'eco', from: { chainId: 8453, token: req.rewardToken, amount: '500000' }, to: { chainId: 5042, token: req.routeToken, amount: '499000' }, fees: [], estimatedDurationSec: 12 },
      { kind: 'transfer', tool: 'eco', from: { chainId: 5042, token: req.routeToken, amount: '499000' }, to: { chainId: 5042, token: req.routeToken, amount: '499000' }, fees: [], estimatedDurationSec: 3 },
    ],
    relatedIntents: [],
    solver: { id: 'solver-1' },
    intentHash: '0x' + '11'.repeat(32),
    execution: {
      transaction: { kind: 'evm', chainId: 8453, to: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df', data: '0xdeadbeef', value: '0' },
      intent: {
        route: { salt: '0x' + '22'.repeat(32), deadline: 1_800_000_000, source: 8453, destination: 5042, portal: '0xEC002CA16cE20c2a9F3C6200EF04E7d92a3dfBD8', nativeAmount: '0', tokens: [{ token: req.routeToken, amount: '499000' }], calls: [] },
        reward: { deadline: 1_800_000_600, creator: req.funder, prover: '0xec004Ab4870c4e177c66949329dCdb503CE41022', nativeAmount: '0', tokens: [{ token: req.rewardToken, amount: '500000' }] },
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
    const result = fromV1QuoteResponse(quote(), req);
    expect(result).toEqual({
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
    svm.execution!.transaction = { kind: 'svm', chainId: 1399811149, feePayer: 'Fee111', instructions: [] };
    const result = fromV1QuoteResponse(svm, { ...req, sourcePortalFallback: 'PortalPubkey111' });
    expect(result.sourcePortal).toBe('PortalPubkey111');
  });

  it('refuses a non-EVM funding transaction without a configured source portal', () => {
    const svm = quote();
    svm.execution!.transaction = { kind: 'svm', chainId: 1399811149, feePayer: 'Fee111', instructions: [] };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/quote/gateway-quote.adapter.test.ts`
Expected: FAIL — cannot find module `@/quote/gateway-quote.adapter`.

- [ ] **Step 3: Write minimal implementation**

`src/quote/quote.service.ts` — extend `QuoteRequest`:

```ts
export interface QuoteRequest {
  source: bigint;
  destination: bigint;
  amount: bigint;
  funder: string;
  recipient: string;
  routeToken: string;
  rewardToken: string;
  /** Gateway only: per-command `--env` override. */
  env?: GatewayEnv;
  /**
   * Gateway only: chain-native source Portal used when the funding transaction is not EVM
   * (an SVM funding tx has no `to`). Comes from the source chain's configured portalAddress.
   */
  sourcePortalFallback?: string;
}
```

(import `GatewayEnv` from `@/config/config.service`.)

```ts
// src/quote/gateway-quote.adapter.ts
/**
 * Maps between routes-cli's QuoteRequest/QuoteResult and the public Eco API /v1/quotes contract.
 * Pure functions — no I/O — so the mapping is unit-testable without the client.
 */
import type { Address } from 'viem';

import type { V1QuoteRequest, V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';

import { ErrorCode, RoutesCliError } from '@/shared/errors';

import type { QuoteRequest, QuoteResult } from './quote.service';

export function toV1QuoteRequest(req: QuoteRequest, dappId: string): V1QuoteRequest {
  return {
    swapType: 'exact-in',
    source: { chainId: Number(req.source), token: req.rewardToken, amount: req.amount.toString() },
    destination: { chainId: Number(req.destination), token: req.routeToken, recipient: req.recipient },
    funder: req.funder,
    refundRecipient: req.funder,
    dappId,
    // The CLI self-publishes, so it needs encodedRoute — private quotes null it.
    options: { visibility: 'public' },
  };
}

export function fromV1QuoteResponse(res: V1QuoteResponse, req: QuoteRequest): QuoteResult {
  const execution = res.execution;
  if (!execution) {
    throw new RoutesCliError(
      ErrorCode.QUOTE_SERVICE_ERROR,
      `Gateway quote ${res.id} carries no execution material (execution is null); it cannot be self-published.`,
      false
    );
  }
  if (!execution.encodedRoute) {
    throw new RoutesCliError(
      ErrorCode.QUOTE_SERVICE_ERROR,
      `Gateway quote ${res.id} is ${res.visibility}; routes-cli needs a public quote (encodedRoute) to self-publish.`,
      false
    );
  }

  let sourcePortal: string;
  if (execution.transaction.kind === 'evm') {
    sourcePortal = execution.transaction.to;
  } else if (req.sourcePortalFallback) {
    sourcePortal = req.sourcePortalFallback;
  } else {
    throw new RoutesCliError(
      ErrorCode.QUOTE_SERVICE_ERROR,
      `Gateway quote ${res.id} funds via a ${execution.transaction.kind} transaction and the source chain has no configured portal; pass --portal-address.`,
      true
    );
  }

  return {
    encodedRoute: execution.encodedRoute,
    sourcePortal: sourcePortal as Address,
    prover: execution.intent.reward.prover as Address,
    deadline: execution.intent.reward.deadline,
    destinationAmount: res.destination.amount,
    estimatedFulfillTimeSec: res.steps.reduce((sum, s) => sum + (s.estimatedDurationSec ?? 0), 0),
    intentExecutionType: 'SELF_PUBLISH',
    destinationPortalAddress: execution.intent.route.portal as Address,
    destinationChainId: res.destination.chainId,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/quote/gateway-quote.adapter.test.ts && pnpm -s typecheck`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/quote/gateway-quote.adapter.ts src/quote/quote.service.ts tests/quote/gateway-quote.adapter.test.ts
git commit -m "feat(quote): pure adapter between QuoteRequest/QuoteResult and the /v1/quotes contract"
```

---

### Task 5: `QuoteService` gateway branch + publish flow wiring

**Files:**
- Modify: `src/quote/quote.service.ts` (constructor gains `EcoApiClient`; `getQuote` dispatches on `endpoint.type`)
- Modify: `src/quote/quote.module.ts` (import `EcoApiModule`)
- Modify: `src/cli/services/intent-publish-flow.service.ts:31-42` (`PublishFlowOptions.env`), `:318-327` (pass `env` and `sourcePortalFallback`)
- Modify: `src/cli/commands/publish.command.ts` (`--env` option)
- Test: `tests/quote/quote.service.test.ts` (create); `tests/cli/intent-publish-flow.test.ts` (extend one assertion)

**Interfaces:**
- Consumes: `EcoApiClient.quote` (Task 3), `toV1QuoteRequest`/`fromV1QuoteResponse` (Task 4), `ConfigService.getQuoteEndpoint(env?)` (Task 1).
- Produces: `QuoteService` constructor `(config: ConfigService, display: DisplayService, ecoApi: EcoApiClient)`; `PublishFlowOptions.env?: GatewayEnv`; `publish --env <production|staging>`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/quote/quote.service.test.ts
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
    transaction: { kind: 'evm', chainId: 8453, to: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df', data: '0x', value: '0' },
    intent: {
      route: { portal: '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df' },
      reward: { prover: '0xec004Ab4870c4e177c66949329dCdb503CE41022', deadline: 1_800_000_000 },
    },
    encodedRoute: '0xfeed',
    encodedReward: '0x',
  },
} as unknown as V1QuoteResponse;

function build(endpoint: unknown) {
  const config = { getQuoteEndpoint: jest.fn().mockReturnValue(endpoint), getDappId: () => 'eco-routes-cli', isDebug: () => false };
  const display = { log: jest.fn() };
  const ecoApi = { quote: jest.fn().mockResolvedValue(v1Quote) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new QuoteService(config as any, display as any, ecoApi as any);
  return { service, config, ecoApi };
}

describe('QuoteService — gateway branch', () => {
  it('quotes through EcoApiClient with the per-command env and maps the result', async () => {
    const { service, config, ecoApi } = build({ type: 'gateway', baseUrl: 'https://api.stag.eco.com', env: 'staging' });
    const result = await service.getQuote(req);

    expect(config.getQuoteEndpoint).toHaveBeenCalledWith('staging');
    expect(ecoApi.quote).toHaveBeenCalledWith(
      expect.objectContaining({ swapType: 'exact-in', funder: req.funder, dappId: 'eco-routes-cli', options: { visibility: 'public' } }),
      { env: 'staging' }
    );
    expect(result.encodedRoute).toBe('0xfeed');
    expect(result.sourcePortal).toBe('0xEC000064576f9C95a8623Bc0eff3db6d296ea6df');
    expect(result.prover).toBe('0xec004Ab4870c4e177c66949329dCdb503CE41022');
    expect(result.destinationAmount).toBe('990000');
  });

  it('does not touch fetch or EcoApiClient for the solver-v2 branch', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ contracts: { sourcePortal: '0x1', prover: '0x2', destinationPortal: '0x3' }, quoteResponses: [{ encodedRoute: '0xaa', deadline: 1, destinationAmount: '1', destinationChainID: 10 }] }), { status: 200 })
    );
    const { service, ecoApi } = build({ type: 'solver-v2', url: 'https://solver.example.com/api/v2/quote/reverse' });
    const result = await service.getQuote(req);
    expect(ecoApi.quote).not.toHaveBeenCalled();
    expect(result.encodedRoute).toBe('0xaa');
    fetchMock.mockRestore();
  });
});
```

In `tests/cli/intent-publish-flow.test.ts`, find the test that inspects `quoteService.getQuote.mock.calls[0][0]` (around line 261) and add a sibling test in the same `describe`:

```ts
  it('forwards --env and the source chain portal to the quote request', async () => {
    const m = buildFlow();
    await m.flow.publish({
      sourceChain: m.sourceChain,
      destChain: m.destChain,
      options: { yes: true, dryRun: true, recipient: RECIPIENT, env: 'staging' },
      overrides: m.overrides,
    });
    const quoteCall = m.quoteService.getQuote.mock.calls[0][0] as { env?: string; sourcePortalFallback?: string };
    expect(quoteCall.env).toBe('staging');
    expect(quoteCall.sourcePortalFallback).toBeDefined();
  });
```

Adapt the property names (`m.sourceChain`, `m.overrides`, `RECIPIENT`) to whatever `buildFlow()` in that file actually returns — read the file first; the existing test at ~line 247-262 shows the exact call shape to copy.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/quote/quote.service.test.ts tests/cli/intent-publish-flow.test.ts`
Expected: FAIL — `QuoteService` constructed with 3 args still hits the "wired in Task 5" throw / `env` not forwarded.

- [ ] **Step 3: Write minimal implementation**

`src/quote/quote.service.ts`:

```ts
import { EcoApiClient } from '@/eco-api/eco-api.client';
import { fromV1QuoteResponse, toV1QuoteRequest } from './gateway-quote.adapter';
```

```ts
  constructor(
    private readonly config: ConfigService,
    private readonly display: DisplayService,
    private readonly ecoApi: EcoApiClient
  ) {}

  async getQuote(params: QuoteRequest): Promise<QuoteResult> {
    const endpoint = this.config.getQuoteEndpoint(params.env);
    if (endpoint.type === 'gateway') return this.getGatewayQuote(params);
    return this.getLegacyQuote(params, endpoint);
  }

  private async getGatewayQuote(params: QuoteRequest): Promise<QuoteResult> {
    const request = toV1QuoteRequest(params, this.config.getDappId());
    const response = await this.ecoApi.quote(request, { env: params.env });
    return fromV1QuoteResponse(response, params);
  }

  private async getLegacyQuote(
    params: QuoteRequest,
    { url, type }: Extract<QuoteEndpoint, { type: 'solver-v2' | 'custom' }>
  ): Promise<QuoteResult> {
    const dAppID = this.config.getDappId();
    const isSolverV2 = type === 'solver-v2';
    // … existing body unchanged from here (request building, fetch, parsing) …
  }
```

Remove the temporary `throw new Error('gateway quotes are wired in Task 5')` from Task 1.

`src/quote/quote.module.ts` — add `EcoApiModule` to `imports`.

`src/cli/services/intent-publish-flow.service.ts`:

```ts
export interface PublishFlowOptions {
  // …existing…
  /** Eco API gateway environment for quotes (`--env`); overrides ECO_ENV. */
  env?: GatewayEnv;
}
```

and in `fetchQuoteOrManualRoute`, extend the `getQuote` call:

```ts
      const quote = await this.quoteService.getQuote({
        source: sourceChain.id,
        destination: quoteDestinationChainId,
        amount: rewardAmount,
        funder: senderAddress,
        recipient: recipientRaw,
        routeToken: routeToken.address,
        rewardToken: rewardToken.address,
        env: options.env,
        sourcePortalFallback: sourceChain.portalAddress
          ? this.normalizer.denormalize(sourceChain.portalAddress, sourceChain.type)
          : undefined,
      });
```

(`options` is already in scope via `args`; if `fetchQuoteOrManualRoute` does not receive `options`, add it to its args object and pass it from `publish()`.)

`src/cli/commands/publish.command.ts` — add an option next to `--dry-run`:

```ts
  @Option({
    flags: '--env <environment>',
    description: 'Eco API gateway environment for quotes: production (default) or staging',
  })
  parseEnv(val: string): GatewayEnv {
    if (val !== 'production' && val !== 'staging') {
      throw RoutesCliError.configurationError(`--env must be "production" or "staging", got "${val}".`);
    }
    return val;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/quote tests/cli && pnpm -s typecheck`
Expected: PASS (all cli suites still green — the flow's constructor signature is unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/quote src/cli/services/intent-publish-flow.service.ts src/cli/commands/publish.command.ts tests/quote/quote.service.test.ts tests/cli/intent-publish-flow.test.ts
git commit -m "feat(quote): route quotes through the Eco API gateway by default; publish --env"
```

---

### Task 6: `status` via the gateway

**Files:**
- Modify: `src/blockchain/base.publisher.ts:10-16` (`IntentStatus.state?`)
- Modify: `src/status/status.service.ts`, `src/status/status.module.ts`
- Modify: `src/cli/commands/status.command.ts`
- Test: `tests/status/status.service.test.ts` (create)

**Interfaces:**
- Consumes: `EcoApiClient.intentStatus` (Task 3).
- Produces:
  ```ts
  interface IntentStatus { fulfilled: boolean; solver?; fulfillmentTxHash?; blockNumber?; timestamp?; state?: string }
  StatusService.getStatus(intentHash: string, chain?: ChainConfig, opts?: { env?: GatewayEnv }): Promise<IntentStatus>
  StatusService.watch(intentHash, chain | undefined, onUpdate, options & { env? })
  export function fromV1StatusEntries(entries: V1StatusEntry[], intentHash: string): IntentStatus
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/status/status.service.test.ts
import type { V1StatusEntry } from '@eco-foundation/api-schemas/v1/types';

import { fromV1StatusEntries, StatusService } from '@/status/status.service';

const HASH = '0x' + 'ab'.repeat(32);

function entry(overrides: Partial<V1StatusEntry>): V1StatusEntry {
  return { id: `intent:${HASH}`, type: 'intent', status: 'pending', updatedAt: 1_760_000_000, intentHashes: [HASH], ...overrides };
}

describe('fromV1StatusEntries', () => {
  it.each(['filled', 'settled'])('treats %s as fulfilled and carries the destination tx', word => {
    const status = fromV1StatusEntries(
      [entry({ status: word, destinationTx: { chainId: 5042, txHash: '0xdest', token: '0x36', amount: '1' } })],
      HASH
    );
    expect(status).toEqual({ fulfilled: true, state: word, fulfillmentTxHash: '0xdest', timestamp: 1_760_000_000 });
  });

  it.each(['pending', 'refundable', 'refunded', 'expired', 'unknown', 'something-new'])('treats %s as not fulfilled but keeps the word', word => {
    const status = fromV1StatusEntries([entry({ status: word })], HASH);
    expect(status.fulfilled).toBe(false);
    expect(status.state).toBe(word);
  });

  it('prefers the entry that lists the hash and reports unknown when nothing matches', () => {
    const other = entry({ id: 'intent:0xother', intentHashes: ['0xother'], status: 'filled' });
    expect(fromV1StatusEntries([other, entry({ status: 'pending' })], HASH).state).toBe('pending');
    expect(fromV1StatusEntries([], HASH)).toEqual({ fulfilled: false, state: 'unknown' });
  });
});

describe('StatusService.getStatus', () => {
  const publisher = { getStatus: jest.fn().mockResolvedValue({ fulfilled: true }) };
  const publisherFactory = { create: jest.fn().mockReturnValue(publisher) };
  const ecoApi = { intentStatus: jest.fn().mockResolvedValue([entry({ status: 'filled' })]) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new StatusService(publisherFactory as any, ecoApi as any);
  const chain = { id: 5042n, name: 'Arc' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('uses the gateway when no chain is given, forwarding the env', async () => {
    const status = await service.getStatus(HASH, undefined, { env: 'staging' });
    expect(ecoApi.intentStatus).toHaveBeenCalledWith({ intentHash: HASH }, { env: 'staging' });
    expect(publisherFactory.create).not.toHaveBeenCalled();
    expect(status.fulfilled).toBe(true);
  });

  it('keeps the on-chain lookup when a chain is given', async () => {
    await service.getStatus(HASH, chain);
    expect(publisherFactory.create).toHaveBeenCalledWith(chain);
    expect(publisher.getStatus).toHaveBeenCalledWith(HASH, chain);
    expect(ecoApi.intentStatus).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/status/status.service.test.ts`
Expected: FAIL — `fromV1StatusEntries` is not exported; `StatusService` constructor takes one argument.

- [ ] **Step 3: Write minimal implementation**

`src/blockchain/base.publisher.ts`:

```ts
export interface IntentStatus {
  fulfilled: boolean;
  solver?: string;
  fulfillmentTxHash?: string;
  blockNumber?: bigint;
  timestamp?: number;
  /** Raw status word from the Eco API gateway (pending, filled, refundable, refunded, …). */
  state?: string;
}
```

`src/status/status.service.ts`:

```ts
import { Injectable } from '@nestjs/common';

import type { V1StatusEntry } from '@eco-foundation/api-schemas/v1/types';

import { IntentStatus } from '@/blockchain/base.publisher';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { GatewayEnv } from '@/config/config.service';
import { EcoApiClient } from '@/eco-api/eco-api.client';
import { ChainConfig } from '@/shared/types';

export { IntentStatus };

/** Gateway words that mean the destination leg executed. `settled` = claimed/withdrawn. */
const FULFILLED_STATES = new Set(['filled', 'settled']);

export function fromV1StatusEntries(entries: V1StatusEntry[], intentHash: string): IntentStatus {
  const wanted = intentHash.toLowerCase();
  const match =
    entries.find(e => (e.intentHashes ?? []).some(h => h.toLowerCase() === wanted)) ?? entries[0];
  if (!match) return { fulfilled: false, state: 'unknown' };
  return {
    fulfilled: FULFILLED_STATES.has(match.status),
    state: match.status,
    ...(match.destinationTx?.txHash && { fulfillmentTxHash: match.destinationTx.txHash }),
    ...(match.updatedAt != null && { timestamp: match.updatedAt }),
  };
}

export interface StatusLookupOptions {
  env?: GatewayEnv;
}

@Injectable()
export class StatusService {
  constructor(
    private readonly publisherFactory: PublisherFactory,
    private readonly ecoApi: EcoApiClient
  ) {}

  /** With a chain: on-chain Portal lookup (unchanged). Without: the Eco API gateway. */
  async getStatus(
    intentHash: string,
    chain?: ChainConfig,
    opts: StatusLookupOptions = {}
  ): Promise<IntentStatus> {
    if (chain) {
      const publisher = this.publisherFactory.create(chain);
      return publisher.getStatus(intentHash, chain);
    }
    const entries = await this.ecoApi.intentStatus({ intentHash }, { env: opts.env });
    return fromV1StatusEntries(entries, intentHash);
  }

  async watch(
    intentHash: string,
    chain: ChainConfig | undefined,
    onUpdate: (status: IntentStatus) => void,
    options: { intervalMs?: number; timeoutMs?: number } & StatusLookupOptions = {}
  ): Promise<'fulfilled' | 'timeout'> {
    const { intervalMs = 10_000, timeoutMs, env } = options;
    // … loop body unchanged except: const status = await this.getStatus(intentHash, chain, { env });
  }
}
```

`src/status/status.module.ts` — `imports: [EcoApiModule]`.

`src/cli/commands/status.command.ts`:
- `StatusOptions` gains `env?: GatewayEnv`.
- Replace the `--chain` required check with: `const chain = options.chain ? this.chains.resolveChain(options.chain) : undefined;`
- Header lines: `Chain: …` only when `chain`; otherwise `Source: Eco API (${env})` where `env = options.env ?? 'ECO_ENV'`-resolved via `this.config.getGatewayBaseUrl(options.env).env` (inject `ConfigService`).
- Pass `chain` and `{ env: options.env }` into `getStatus` / `watch`.
- In `displayStatus`, after the status line: `if (status.state) this.display.log(\`Gateway state: ${status.state}\`);`
- Add the same `--env` `@Option` as Task 5 (copy the code; do not import from `publish.command`).
- Update the `--chain` description to `'Destination chain (name or ID) — forces the on-chain Portal lookup instead of the Eco API'`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/status tests/cli && pnpm -s typecheck`
Expected: PASS. Then smoke: `pnpm -s dev status 0x1111111111111111111111111111111111111111111111111111111111111111` (no `--chain`) prints `Source: Eco API (production)` and `Gateway state: unknown`; with `--chain arc` it behaves exactly as before.

- [ ] **Step 5: Commit**

```bash
git add src/blockchain/base.publisher.ts src/status src/cli/commands/status.command.ts tests/status/status.service.test.ts
git commit -m "feat(status): look intents up through the Eco API gateway when no --chain is given"
```

---

### Task 7: Redaction, integration fallback test, docs

**Files:**
- Modify: `src/cli/commands/config.command.ts:131`
- Modify: `tests/integration/publish-non-interactive.test.ts`
- Modify: `README.md` (Configuration Reference table), `.env.example` (Quote Service section), `CLAUDE.md` (Environment Configuration), `.claude/skills/routes-cli/SKILL.md` (Setup + recipe)

- [ ] **Step 1: Write the failing integration test**

Add to `tests/integration/publish-non-interactive.test.ts`:

```ts
  it('with nothing but an unreachable ECO_API_URL, the gateway quote fails and the manual route still publishes (dry run)', () => {
    const res = spawnSync(
      'npx',
      ['ts-node', '--transpile-only', '-r', 'tsconfig-paths/register', 'src/main.ts', 'publish', ...FULL_FLAGS, '--json'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        input: '',
        timeout: 120_000,
        env: {
          ...process.env,
          SOLVER_URL: '',
          QUOTES_API_URL: '',
          ECO_API_URL: 'http://127.0.0.1:9', // unroutable → EcoApiRequestError → manual fallback
          EVM_PRIVATE_KEY: TEST_PRIVATE_KEY,
        },
      }
    );
    expect(res.status).toBe(0);
    expect(res.stderr).toContain('Quote failed');
    const payload = JSON.parse(res.stdout.trim()) as Record<string, unknown>;
    expect(payload.dryRun).toBe(true);
  });
```

Check how `runCli` strips empty env values: zod `z.string().url().optional()` rejects `''`, so instead of setting them to `''` build the env with `delete env.SOLVER_URL; delete env.QUOTES_API_URL;` after spreading `process.env`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest tests/integration/publish-non-interactive.test.ts -t "unreachable ECO_API_URL"`
Expected: FAIL only if Tasks 1-5 regressed; if it passes immediately that is acceptable here because the behaviour under test was implemented in Task 5 — record that in the commit message.

- [ ] **Step 3: Implement redaction + docs**

`src/cli/commands/config.command.ts:131`:

```ts
      const lower = key.toLowerCase();
      const secret = lower.includes('private') || lower.includes('api_key') || lower.includes('apikey');
      console.log(secret ? '***[HIDDEN]***' : String(val));
```

`README.md` Configuration Reference — add rows:

```
| `ECO_ENV` | No | Eco API gateway environment for quotes and status: `production` (default, `api.eco.com`) or `staging` (`api.stag.eco.com`). `--env` on `publish`/`status` overrides it |
| `ECO_API_URL` | No | Override the Eco API gateway base URL |
| `ECO_API_KEY` | No | API key sent as `x-api-key` to the Eco API gateway (required on staging) |
```

and rewrite the `SOLVER_URL` / `QUOTES_API_URL` descriptions to say they are escape hatches that bypass the gateway.

`.env.example` — replace the Quote Service block with:

```
# =============================================================================
# OPTIONAL: Quote source
# By default quotes (and `status`) go through the public Eco API gateway.
#
# Priority order (highest first):
#   1. SOLVER_URL          — solver-v2 API at {SOLVER_URL}/api/v2/quote/reverse
#   2. QUOTES_API_URL — use this exact URL as a quote-service v3 endpoint
#   3. Eco API gateway     — POST {ECO_API_URL or ECO_ENV host}/v1/quotes  (default)
# =============================================================================

# Gateway environment: production (api.eco.com, default) or staging (api.stag.eco.com).
# `publish --env` / `status --env` override this per command.
# ECO_ENV=production

# Override the gateway host outright (rarely needed).
# ECO_API_URL=https://api.eco.com

# API key sent as x-api-key. Production currently answers keyless; staging requires one.
# Mint keys in the API key dashboard. NEVER commit this value.
# ECO_API_KEY=

# Escape hatches — bypass the gateway entirely:
# SOLVER_URL=https://your-solver.example.com
# QUOTES_API_URL=https://quotes.eco.com/api/v3/quotes/single
```

`CLAUDE.md` → under "Environment Configuration / Optional" add `ECO_ENV`, `ECO_API_URL`, `ECO_API_KEY` one line each and note the default quote source is the Eco API gateway.

`.claude/skills/routes-cli/SKILL.md` → Setup: `Optional env: ECO_ENV=staging|production (gateway host; default production), ECO_API_KEY (x-api-key; required on staging), ECO_API_URL (host override), SOLVER_URL / QUOTES_API_URL (bypass the gateway), …`. Recipe table: add `--env <production|staging>`. "After publishing": `pnpm dev status <intentHash>` (no `--chain` needed; `--chain <c>` forces the on-chain lookup). Errors table: `Eco API error 401/403 … invalid-api-key` → set `ECO_API_KEY`.

- [ ] **Step 4: Verify**

Run: `pnpm -s test:unit && pnpm -s test:integration && pnpm -s typecheck && pnpm -s lint && pnpm -s format:check`
Expected: all green (lint: 0 errors; pre-existing `no-unsafe-assignment` warnings only).

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/config.command.ts tests/integration/publish-non-interactive.test.ts README.md .env.example CLAUDE.md .claude/skills/routes-cli/SKILL.md
git commit -m "feat(cli): redact API keys, gateway fallback integration test, docs for ECO_ENV/ECO_API_URL/ECO_API_KEY"
```

---

### Task 8: Live smoke and PR

- [ ] **Step 1: Live quotes (dry run, nothing broadcast)**

With `ECO_API_KEY` present in `.env` (the user adds it; never print it):

```bash
pnpm -s dev publish -s base -d optimism --reward-token USDC --route-token USDC --amount 0.5 \
  --recipient 0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471 -y --dry-run --json          # production gateway
pnpm -s dev publish -s base -d arc --reward-token USDC --route-token USDC --amount 0.5 \
  --recipient 0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471 -y --dry-run --json --env staging
pnpm -s dev status <a known intent hash>            # gateway
pnpm -s dev status <a known intent hash> --chain arc  # on-chain, unchanged
```

Record outcomes (host hit, HTTP status, quote portal/prover, gateway state) in the PR body. A staging 403 with no key is the expected network-policy answer — say so rather than treating it as a bug.

- [ ] **Step 2: Open the stacked PR**

```bash
git push -u origin cfebres/api-gateway-quotes
gh pr create --base cfebres/arc-mainnet --head cfebres/api-gateway-quotes \
  --title "feat: Eco API gateway as the default quote source (+ status via /v1/intents/status)" \
  --body-file <body>
```

Body sections: Why / What changed (per file) / Behaviour change (default quote source moved; escape hatches) / How verified (test counts, live smoke) / Stacked on #30. One line per paragraph. End with `https://claude.ai/code/session_01ENQw9Ze2ZdghQGCNpKjo9L`.
