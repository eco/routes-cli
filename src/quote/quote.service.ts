import { Injectable } from '@nestjs/common';

import { Address } from 'viem';

import { DisplayService } from '@/cli/services/display.service';
import { ConfigService } from '@/config/config.service';

import {
  assertEe528Provenance,
  assertEe528Route,
  Ee528Case,
  ee528Case,
  Ee528Testing,
} from './ee528-testing';

export interface QuoteRequest {
  source: bigint;
  destination: bigint;
  amount: bigint;
  funder: string;
  recipient: string;
  routeToken: string;
  rewardToken: string;
}

export interface QuoteResult {
  testing?: Ee528Testing;
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
  finalDestinationChainID?: number;
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
  quoteExpiry?: number;
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
  testing?: unknown;
  quoteResponse?: QuoteServiceV3Data;
  quoteResponses?: SolverV2QuoteData[];
  contracts: {
    sourcePortal: Address;
    prover: Address;
    destinationPortal: Address;
  };
}

interface QuoteRequestPayload {
  planner?: 'pe';
  case?: Ee528Case;
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
    private readonly display: DisplayService
  ) {}

  async getQuote(params: QuoteRequest): Promise<QuoteResult> {
    const testCase = this.config.getEe528TestCase();
    const { url, type } = this.config.getQuoteEndpoint();
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
        recipient: params.recipient,
      },
    };

    if (isSolverV2) {
      request.quoteID = crypto.randomUUID();
      request.intentExecutionTypes = ['SELF_PUBLISH'];
    }

    if (testCase) {
      assertEe528Route(testCase, params);
      request.planner = 'pe';
      request.case = ee528Case(testCase);
    }

    if (this.config.isDebug()) {
      this.display.log(
        `[DEBUG] Quote request: ${JSON.stringify({ url, request: JSON.stringify(request) })}`
      );
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      ...(testCase ? { redirect: 'error' as const } : {}),
    });

    const raw = (await response.json()) as RawQuoteResponse;
    if (this.config.isDebug()) {
      this.display.log(`[DEBUG] Quote response: ${JSON.stringify(raw)}`);
    }
    if (!response.ok) throw new Error(JSON.stringify(raw));

    // Solver-v2 returns the object directly; quote-service-v3 wraps in `data`
    const data: RawQuoteResponse = isSolverV2
      ? raw
      : ((raw as unknown as { data?: RawQuoteResponse }).data ?? raw);

    if (testCase) assertEe528Provenance(data.testing, testCase);

    if (!data.contracts?.sourcePortal || !data.contracts?.prover) {
      throw new Error('Quote response missing required contract addresses');
    }

    if (isSolverV2) {
      if (!data.quoteResponses || data.quoteResponses.length === 0) {
        throw new Error('Invalid solver-v2 response: no quotes returned');
      }
      const q = data.quoteResponses[0];
      if (testCase) {
        if (
          data.quoteResponses.length !== 1 ||
          !q ||
          typeof q.encodedRoute !== 'string' ||
          !/^0x(?:[a-fA-F0-9]{2})+$/.test(q.encodedRoute) ||
          typeof q.destinationAmount !== 'string' ||
          !/^[1-9][0-9]*$/.test(q.destinationAmount) ||
          !Number.isSafeInteger(q.deadline) ||
          q.deadline <= Math.floor(Date.now() / 1000) ||
          !Number.isSafeInteger(q.quoteExpiry) ||
          q.quoteExpiry! <= Math.floor(Date.now() / 1000) ||
          q.sourceChainID !== Number(params.source) ||
          q.destinationChainID !== Number(params.source) ||
          q.finalDestinationChainID !== Number(params.destination) ||
          q.intentExecutionType !== 'SELF_PUBLISH' ||
          ![
            data.contracts.sourcePortal,
            data.contracts.prover,
            data.contracts.destinationPortal,
          ].every(address => typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address))
        ) {
          throw new Error(
            'EE528 forced quote is empty, expired, malformed, or mismatches the route'
          );
        }
      }
      return {
        ...(testCase ? { testing: data.testing as Ee528Testing } : {}),
        encodedRoute: q.encodedRoute,
        sourcePortal: data.contracts.sourcePortal,
        prover: data.contracts.prover,
        deadline: q.deadline,
        destinationAmount: q.destinationAmount,
        estimatedFulfillTimeSec: q.estimatedFulfillTimeSec,
        intentExecutionType: q.intentExecutionType,
        destinationPortalAddress: data.contracts.destinationPortal,
        destinationChainId: q.destinationChainID,
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
    };
  }
}
