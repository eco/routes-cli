import { Address } from 'viem';

import { logger } from '@/utils/logger';

interface QuoteRequest {
  source: bigint;
  destination: bigint;
  amount: bigint;
  funder: string;
  recipient: string;
  routeToken: string;
  rewardToken: string;
}

// Solver-v2 response format
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
    token: {
      address: Address;
      decimals: number;
      symbol: string;
    };
    amount: string;
  }>;
  deadline: number;
  estimatedFulfillTimeSec?: number;
}

// Updated QuoteResponse to handle both formats
export interface QuoteResponse {
  // Quote service v3 format (wrapped in 'data')
  quoteResponse?: {
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
    fees: [
      {
        name: string;
        description: string;
        token: {
          address: Address;
          decimals: 18;
          symbol: string;
        };
        amount: string;
      },
    ];
    deadline: number;
    estimatedFulfillTimeSec?: number;
    intentExecutionType?: 'SELF_PUBLISH' | 'GASLESS';
  };
  // Solver-v2 format (array response)
  quoteResponses?: SolverV2QuoteData[];
  // Common to both
  contracts: {
    sourcePortal: Address;
    prover: Address;
    destinationPortal: Address;
  };
}

function getQuoteUrl(): string {
  // Priority 1: Use solver-v2 if SOLVER_URL is set
  if (process.env.SOLVER_URL) {
    const baseUrl = process.env.SOLVER_URL.replace(/\/$/, ''); // Remove trailing slash
    return `${baseUrl}/api/v1/quotes`;
  }

  // Priority 2: Use preprod quote service if flags are set
  if (process.env.QUOTES_API_URL || process.env.QUOTES_PREPROD) {
    return 'https://quotes-preprod.eco.com/api/v3/quotes/single';
  }

  // Priority 3: Default to production quote service
  return 'https://quotes.eco.com/api/v3/quotes/single';
}

// Determine if we're using solver-v2 API
function isSolverV2(): boolean {
  return !!process.env.SOLVER_URL;
}

export async function getQuote(requestOpts: QuoteRequest) {
  const quoteUrl = getQuoteUrl();
  const usingSolverV2 = isSolverV2();

  const request = {
    dAppID: 'eco-routes-cli',
    quoteRequest: {
      // For solver-v2, keep as string; for quote service, convert to number
      sourceChainID: usingSolverV2 ? requestOpts.source.toString() : Number(requestOpts.source),
      sourceToken: requestOpts.rewardToken,
      destinationChainID: usingSolverV2
        ? requestOpts.destination.toString()
        : Number(requestOpts.destination),
      destinationToken: requestOpts.routeToken,
      sourceAmount: requestOpts.amount.toString(),
      funder: requestOpts.funder,
      recipient: requestOpts.recipient,
    },
  };

  if (process.env.DEBUG) {
    logger.log(`Calling quoting service: ${quoteUrl}`);
    logger.log(`Quote request: ${JSON.stringify(request)}`);
  }

  const response = await fetch(quoteUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const result = await response.json();

  if (process.env.DEBUG) {
    logger.log(`Quote: ${JSON.stringify(result, null, 2)}`);
  }

  if (!response.ok) throw new Error(JSON.stringify(result));

  // Handle different response formats
  if (usingSolverV2) {
    // Solver-v2 returns direct response with quoteResponses array
    if (!result.quoteResponses || result.quoteResponses.length === 0) {
      throw new Error('Invalid solver-v2 response: no quotes returned');
    }

    // Convert array format to single quoteResponse format for compatibility
    return {
      quoteResponse: result.quoteResponses[0],
      contracts: result.contracts,
    } as QuoteResponse;
  } else {
    // Quote service v3 returns wrapped response
    return result.data ?? result;
  }
}
