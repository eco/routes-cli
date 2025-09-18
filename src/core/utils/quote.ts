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

const quoteUrl = process.env.QUOTES_API_URL ?? 'https://quotes-preprod.eco.com';

export async function getQuote(requestOpts: QuoteRequest) {
  const url = new URL('/api/v3/quotes/getQuote', quoteUrl);

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
    logger.log(`Calling quoting service: ${url.toString()}`);
  }

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const result = (await response.json()) as { data: QuoteResponse };

  if (!response.ok) throw new Error(JSON.stringify(result));

  return result.data;
}
