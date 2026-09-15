/**
 * Maps between routes-cli's QuoteRequest/QuoteResult and the public Eco API /v1/quotes contract.
 * Pure functions — no I/O — so the mapping is unit-testable without the client.
 */
import type { V1QuoteRequest, V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';
import type { Address } from 'viem';

import { ErrorCode, RoutesCliError } from '@/shared/errors';

import type { QuoteRequest, QuoteResult } from './quote.service';

export function toV1QuoteRequest(req: QuoteRequest, dappId: string): V1QuoteRequest {
  return {
    swapType: 'exact-in',
    source: { chainId: Number(req.source), token: req.rewardToken, amount: req.amount.toString() },
    destination: {
      chainId: Number(req.destination),
      token: req.routeToken,
      recipient: req.recipient,
    },
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
