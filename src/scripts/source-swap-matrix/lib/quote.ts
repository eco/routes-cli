export class QuoteShapeError extends Error {
  constructor(
    message: string,
    public readonly body: unknown
  ) {
    super(message);
    this.name = 'QuoteShapeError';
  }
}

export interface RequestQuoteInput {
  solverUrl: string;
  scenarioId: string;
  sourceChain: number;
  destChain: number;
  sourceToken: string;
  destinationToken: string;
  sourceAmount: bigint;
  funder: string;
  recipient: string;
}

export interface QuoteResponseShape {
  encodedRoute: string;
  deadline: string | number;
  destinationAmount?: string;
  funder?: string;
  /**
   * The chain id magenta says the intent should be published *to*. For
   * any-to-any LOCAL-parent quotes this equals the source chain (LOCAL
   * intent runs on source); for direct cross-chain quotes this is the
   * actual destination. Must be used as the `destination` arg to
   * Portal.publishAndFund — using sourceChain blindly fails validation
   * for direct quotes (e.g. SS-3 USDC→ETH cross-chain returns
   * destinationChainID=42161, not 8453).
   */
  destinationChainID?: number | string;
  sourceChainID?: number | string;
}

export interface QuoteContracts {
  sourcePortal: string;
  prover: string;
  [key: string]: unknown;
}

export interface QuoteEnvelope {
  quoteResponses: QuoteResponseShape[];
  contracts: QuoteContracts;
  sourceSwap?: unknown;
  anyToAny?: unknown;
}

export async function requestQuote(input: RequestQuoteInput): Promise<QuoteEnvelope> {
  const url = `${input.solverUrl}/api/v2/quote/reverse`;
  const body = {
    dAppID: 'source-swap-execute-matrix',
    quoteID: `${input.scenarioId}-${Date.now()}`,
    intentExecutionTypes: ['SELF_PUBLISH'],
    quoteRequest: {
      sourceChainID: input.sourceChain.toString(),
      destinationChainID: input.destChain.toString(),
      sourceToken: input.sourceToken,
      destinationToken: input.destinationToken,
      sourceAmount: input.sourceAmount.toString(),
      funder: input.funder,
      recipient: input.recipient,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }

  if (!response.ok) {
    const message =
      (parsed as { message?: string; error?: string } | null)?.message ??
      (parsed as { error?: string } | null)?.error ??
      response.statusText;
    throw new Error(`quote ${response.status}: ${message}`);
  }

  const envelope = parsed as QuoteEnvelope;
  const route = envelope?.quoteResponses?.[0]?.encodedRoute;
  const portal = envelope?.contracts?.sourcePortal;
  if (!route) {
    throw new QuoteShapeError('quote missing quoteResponses[0].encodedRoute', envelope);
  }
  if (!portal) {
    throw new QuoteShapeError('quote missing contracts.sourcePortal', envelope);
  }
  return envelope;
}
