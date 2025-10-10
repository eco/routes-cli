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

export interface QuoteResponse {
  quoteResponse: {
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
  };
  contracts: {
    sourcePortal: Address;
    prover: Address;
    destinationPortal: Address;
  };
}

const quoteUrl = process.env.QUOTES_API_URL ?? 'https://quotes.eco.com/api/v3/quotes/single';

export async function getQuote(requestOpts: QuoteRequest) {
  const request = {
    dAppID: 'eco-routes-cli',
    quoteRequest: {
      sourceChainID: Number(requestOpts.source),
      sourceToken: requestOpts.rewardToken,
      destinationChainID: Number(requestOpts.destination),
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

  const result = (await response.json()) as { data: QuoteResponse };

  if (process.env.DEBUG) {
    logger.log(`Quote: ${JSON.stringify(result, null, 2)}`);
  }

  if (!response.ok) throw new Error(JSON.stringify(result));

  return result.data ?? result;
}
