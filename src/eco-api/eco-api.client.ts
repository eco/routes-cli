/**
 * Client for the public Eco API (AWS API Gateway front door, `/v1`).
 *
 * Hosts come from ConfigService (ECO_API_URL, else ECO_ENV → api.eco.com / api.stag.eco.com);
 * `ECO_API_KEY` is sent as `x-api-key` when present. Non-2xx responses are RFC 7807 problem
 * documents: auth problems become RoutesCliError (hard stop), everything else becomes
 * EcoApiRequestError — a plain Error subclass — so callers such as the publish flow can treat it
 * like any other quote-service outage and fall back to a manual route.
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
  /** Per-command gateway environment (`--env`); overrides ECO_ENV. */
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

type ProblemLike = Partial<V1ProblemBody> & { requestId?: string };

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
    const { baseUrl, env } = this.config.getGatewayBaseUrl(opts.env);
    const url = `${baseUrl}${path}`;
    const apiKey = this.config.getApiKey(env);
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...(apiKey && { 'x-api-key': apiKey }),
    };

    if (this.config.isDebug()) {
      // Header NAMES only — the key value must never reach a log.
      this.display.log(
        `[DEBUG] Eco API ${method} ${url} headers=[${Object.keys(headers).join(', ')}]`
      );
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
      throw new EcoApiRequestError(
        `Eco API unreachable at ${url}: ${reason}`,
        undefined,
        undefined,
        cause
      );
    }

    const text = await response.text();
    if (this.config.isDebug()) {
      const elapsed = (performance.now() - started).toFixed(0);
      this.display.log(
        `[DEBUG] Eco API ${response.status} in ${elapsed}ms: ${text.slice(0, 2000)}`
      );
    }

    if (!response.ok) throw this.toError(response, text);
    return JSON.parse(text) as T;
  }

  private toError(response: Response, text: string): Error {
    let parsed: ProblemLike | undefined;
    try {
      parsed = JSON.parse(text) as ProblemLike;
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
      // API Gateway itself (resource policy, usage plan) can reject before the authorizer
      // produces a problem document; the only fix on the caller's side is a valid key.
      return RoutesCliError.apiError(
        {
          status: response.status,
          code: 'unauthorized',
          title: response.statusText || 'Request rejected by the Eco API gateway',
        },
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
