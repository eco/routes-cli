import { Injectable } from '@nestjs/common';

import { Address } from 'viem';

import { DisplayService } from '@/cli/services/display.service';
import { ConfigService, GatewayEnv, QuoteEndpoint } from '@/config/config.service';
import { EcoApiClient } from '@/eco-api/eco-api.client';

import { fromV1QuoteResponse, toV1QuoteRequest } from './gateway-quote.adapter';

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
}

export interface QuoteResult {
  encodedRoute: string;
  sourcePortal: Address;
  prover: Address;
  deadline: number;
  destinationAmount: string;
  estimatedFulfillTimeSec?: number;
  intentExecutionType?: 'SELF_PUBLISH' | 'GASLESS';
  destinationPortalAddress: Address;
  destinationChainId?: number;
}

// Internal API response types

interface SolverV2QuoteData {
  intentExecutionType?: 'SELF_PUBLISH' | 'GASLESS';
  sourceChainID: number;
  destinationChainID: number;
  sourceToken: string;
  destinationToken: string;
  sourceAmount: string;
  destinationAmount: string;
  funder: string;
  refundRecipient: string;
  recipient: string;
  encodedRoute: string;
  fees: Array<{
    name: string;
    description: string;
    token: { address: Address; decimals: number; symbol: string };
    amount: string;
  }>;
  deadline: number;
  estimatedFulfillTimeSec?: number;
}

interface RawQuoteResponse {
  quoteResponses?: SolverV2QuoteData[];
  contracts?: {
    sourcePortal?: Address;
    prover?: Address;
    destinationPortal: Address;
  };
}

interface QuoteRequestPayload {
  dAppID: string;
  quoteRequest: {
    sourceChainID: number | string;
    sourceToken: string;
    destinationChainID: number | string;
    destinationToken: string;
    sourceAmount: string;
    funder: string;
    recipient: string;
  };
  quoteID?: string;
  intentExecutionTypes?: string[];
}

@Injectable()
export class QuoteService {
  constructor(
    private readonly config: ConfigService,
    private readonly display: DisplayService,
    private readonly ecoApi: EcoApiClient
  ) {}

  async getQuote(params: QuoteRequest): Promise<QuoteResult> {
    const endpoint = this.config.getQuoteEndpoint(params.env);
    switch (endpoint.type) {
      case 'gateway':
        return this.getGatewayQuote(params);
      case 'quotes-v4':
        return this.getQuotesV4Quote(params, endpoint);
      case 'solver-v2':
        return this.getSolverV2Quote(params, endpoint);
      default: {
        const exhaustive: never = endpoint;
        throw new Error(`Unhandled quote endpoint type: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  /** Default path: the public Eco API gateway (`POST /v1/quotes`). */
  private async getGatewayQuote(params: QuoteRequest): Promise<QuoteResult> {
    const request = toV1QuoteRequest(params, this.config.getDappId());
    const response = await this.ecoApi.quote(request, { env: params.env });
    return fromV1QuoteResponse(response, params);
  }

  /**
   * Escape hatch: an eco-quotes host (QUOTES_API_URL), calling the keyless
   * `{host}/v4/quotes` endpoint through the same v1 request/response contract
   * the gateway uses. Quote-service v3 retires on 2026-12-01.
   */
  private async getQuotesV4Quote(
    params: QuoteRequest,
    endpoint: Extract<QuoteEndpoint, { type: 'quotes-v4' }>
  ): Promise<QuoteResult> {
    const request = toV1QuoteRequest(params, this.config.getDappId());
    const response = await this.ecoApi.quoteV4(request, endpoint.baseUrl);
    return fromV1QuoteResponse(response, params);
  }

  /** Escape hatch: a solver-v2 host (SOLVER_URL). */
  private async getSolverV2Quote(
    params: QuoteRequest,
    { url }: Extract<QuoteEndpoint, { type: 'solver-v2' }>
  ): Promise<QuoteResult> {
    const dAppID = this.config.getDappId();

    const request: QuoteRequestPayload = {
      dAppID,
      quoteRequest: {
        sourceChainID: params.source.toString(),
        sourceToken: params.rewardToken,
        destinationChainID: params.destination.toString(),
        destinationToken: params.routeToken,
        sourceAmount: params.amount.toString(),
        funder: params.funder,
        recipient: params.recipient,
      },
      quoteID: crypto.randomUUID(),
      intentExecutionTypes: ['SELF_PUBLISH'],
    };

    if (this.config.isDebug()) {
      this.display.log(
        `[DEBUG] Quote request: ${JSON.stringify({ url, request: JSON.stringify(request) })}`
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    const raw = (await response.json()) as RawQuoteResponse;
    if (this.config.isDebug()) {
      this.display.log(`[DEBUG] Quote response: ${JSON.stringify(raw)}`);
    }
    if (!response.ok) throw new Error(JSON.stringify(raw));

    if (!raw.contracts?.sourcePortal || !raw.contracts.prover) {
      throw new Error('Quote response missing required contract addresses');
    }

    const q = raw.quoteResponses?.[0];
    if (!q) {
      throw new Error('Invalid solver-v2 response: no quotes returned');
    }
    return {
      encodedRoute: q.encodedRoute,
      sourcePortal: raw.contracts.sourcePortal,
      prover: raw.contracts.prover,
      deadline: q.deadline,
      destinationAmount: q.destinationAmount,
      estimatedFulfillTimeSec: q.estimatedFulfillTimeSec,
      intentExecutionType: q.intentExecutionType,
      destinationPortalAddress: raw.contracts.destinationPortal,
      destinationChainId: q.destinationChainID,
    };
  }
}
