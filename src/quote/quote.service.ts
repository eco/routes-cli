import { Injectable } from '@nestjs/common';

import { Address } from 'viem';

import { DisplayService } from '@/cli/services/display.service';
import { ConfigService } from '@/config/config.service';

export interface QuoteRequest {
  source: bigint;
  destination: bigint;
  amount: bigint;
  funder: string;
  recipient: string;
  routeToken: string;
  rewardToken: string;
  /**
   * Slippage tolerance in basis points (1-10000) for destination swaps.
   * Honored by the solver only for non-stable (DEX) swaps; ignored for
   * stable/no-swap quotes. Omitted => solver provider default.
   */
  slippageBps?: number;
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
  receivedAt: number; // Unix ms — when the CLI received the quote response
  quoteId?: string; // Present for gateway (server) and solver-v2 (client-generated) shapes
  solverId?: string; // Present when the gateway identifies the responding solver
  elapsedMs: number;
}

export class QuoteHttpError extends Error {
  override readonly name = 'QuoteHttpError';

  constructor(
    public readonly status: number,
    public readonly body: unknown,
    public readonly elapsedMs: number
  ) {
    super(`quote HTTP ${status}`);
  }
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

interface QuoteServiceV3Data {
  encodedRoute: string;
  deadline: number;
  destinationAmount: string;
  estimatedFulfillTimeSec?: number;
  intentExecutionType?: 'SELF_PUBLISH' | 'GASLESS';
}

interface RawQuoteResponse {
  quoteResponse?: QuoteServiceV3Data;
  quoteResponses?: SolverV2QuoteData[];
  contracts: {
    sourcePortal: Address;
    prover: Address;
    destinationPortal: Address;
  };
}

interface GatewayQuoteEntry {
  quoteID?: string;
  solverID?: string;
  receiveSignedIntentUrl?: string;
  quoteData: {
    contracts: {
      sourcePortal: Address;
      prover: Address;
      destinationPortal: Address;
    };
    quoteResponse: SolverV2QuoteData;
  };
}

interface GatewayResponse {
  data?: GatewayQuoteEntry[];
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
    refundRecipient: string;
    recipient: string;
    // solver-v2 reads slippage from inside quoteRequest (QuoteRequestInnerSchema).
    slippageBps?: number;
  };
  quoteID?: string;
  intentExecutionTypes?: string[];
  // The eco-quotes swap endpoint (/exactIn/swap, SwapRequestV3DTO) reads slippage
  // at the top level, then copies it into quoteRequest before calling the solver.
  // Both schemas strip unknown keys, so sending it in both places is safe and
  // makes slippage work regardless of which endpoint the CLI is pointed at.
  slippageBps?: number;
}

@Injectable()
export class QuoteService {
  constructor(
    private readonly config: ConfigService,
    private readonly display: DisplayService
  ) {}

  async getQuote(params: QuoteRequest): Promise<QuoteResult> {
    const { url, type, apiKey } = this.config.getQuoteEndpoint();
    const dAppID = this.config.getDappId();
    const isSolverV2 = type === 'solver-v2';

    const request: QuoteRequestPayload = {
      dAppID,
      quoteRequest: {
        sourceChainID: isSolverV2 ? params.source.toString() : Number(params.source),
        sourceToken: params.rewardToken,
        destinationChainID: isSolverV2 ? params.destination.toString() : Number(params.destination),
        destinationToken: params.routeToken,
        sourceAmount: params.amount.toString(),
        funder: params.funder,
        refundRecipient: params.funder,
        recipient: params.recipient,
        ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps }),
      },
      // Top-level copy for the eco-quotes swap endpoint (see QuoteRequestPayload).
      ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps }),
    };

    if (isSolverV2) {
      request.quoteID = crypto.randomUUID();
      request.intentExecutionTypes = ['SELF_PUBLISH'];
    }

    if (this.config.isDebug()) {
      this.display.log(
        `[DEBUG] Quote request: ${JSON.stringify({ url, request: JSON.stringify(request) })}`
      );
    }

    const startTime = performance.now();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['x-api-key'] = apiKey;

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    const elapsedMs = Number((performance.now() - startTime).toFixed(2));

    const receivedAt = Date.now();
    const raw = (await response.json()) as RawQuoteResponse;
    if (this.config.isDebug()) {
      this.display.log(`[DEBUG] Quote response time: ${elapsedMs}ms`);
      this.display.log(`[DEBUG] Quote response: ${JSON.stringify(raw)}`);
    }
    if (!response.ok) throw new QuoteHttpError(response.status, raw, elapsedMs);

    // The Eco swap service (…/exactIn/swap) returns the gateway array shape
    // (`data: [{ quoteData }]`) whether it's reached via API_GATEWAY_URL or via
    // QUOTES_ENDPOINT_URL (e.g. pointing the custom endpoint at production swap
    // while the gateway stays on pre-production). Detect it by shape so either
    // env var works. The v3 single endpoint wraps an object in `data`, so an
    // array specifically indicates the gateway/swap shape.
    const gw = raw as unknown as GatewayResponse;
    if (type === 'gateway' || Array.isArray(gw.data)) {
      if (!gw.data || gw.data.length === 0) {
        throw new Error('Invalid gateway response: no quotes returned');
      }
      const entry = gw.data[0];
      const contracts = entry.quoteData?.contracts;
      if (!contracts?.sourcePortal || !contracts?.prover) {
        throw new Error('Quote response missing required contract addresses');
      }
      const q = entry.quoteData.quoteResponse;
      return {
        encodedRoute: q.encodedRoute,
        sourcePortal: contracts.sourcePortal,
        prover: contracts.prover,
        deadline: q.deadline,
        destinationAmount: q.destinationAmount,
        estimatedFulfillTimeSec: q.estimatedFulfillTimeSec,
        intentExecutionType: q.intentExecutionType,
        destinationPortalAddress: contracts.destinationPortal,
        destinationChainId: q.destinationChainID,
        receivedAt,
        quoteId: entry.quoteID,
        solverId: entry.solverID,
        elapsedMs,
      };
    }

    // Solver-v2 returns the object directly; quote-service-v3 wraps in `data`
    const data: RawQuoteResponse = isSolverV2
      ? raw
      : ((raw as unknown as { data?: RawQuoteResponse }).data ?? raw);

    if (!data.contracts?.sourcePortal || !data.contracts?.prover) {
      throw new Error('Quote response missing required contract addresses');
    }

    if (isSolverV2) {
      if (!data.quoteResponses || data.quoteResponses.length === 0) {
        throw new Error('Invalid solver-v2 response: no quotes returned');
      }
      const q = data.quoteResponses[0];
      return {
        encodedRoute: q.encodedRoute,
        sourcePortal: data.contracts.sourcePortal,
        prover: data.contracts.prover,
        deadline: q.deadline,
        destinationAmount: q.destinationAmount,
        estimatedFulfillTimeSec: q.estimatedFulfillTimeSec,
        intentExecutionType: q.intentExecutionType,
        destinationPortalAddress: data.contracts.destinationPortal,
        destinationChainId: q.destinationChainID,
        receivedAt,
        quoteId: request.quoteID,
        elapsedMs,
      };
    }

    if (!data.quoteResponse) {
      throw new Error('Quote response missing quote data');
    }

    return {
      encodedRoute: data.quoteResponse.encodedRoute,
      sourcePortal: data.contracts.sourcePortal,
      prover: data.contracts.prover,
      deadline: data.quoteResponse.deadline,
      destinationAmount: data.quoteResponse.destinationAmount,
      estimatedFulfillTimeSec: data.quoteResponse.estimatedFulfillTimeSec,
      intentExecutionType: data.quoteResponse.intentExecutionType,
      destinationPortalAddress: data.contracts.destinationPortal,
      receivedAt,
      elapsedMs,
    };
  }
}
