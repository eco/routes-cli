/**
 * Maps between routes-cli's QuoteRequest/QuoteResult and the public Eco API /v1/quotes contract
 * (`@eco-foundation/api-schemas` 0.9.0 wire). Pure functions — no I/O — so the mapping is
 * unit-testable without the client.
 *
 * 0.9.0 no longer returns `encodedRoute`; the router instead returns the exact
 * `Portal.publishAndFund` calldata it built for the caller. The CLI signs and sends its own
 * transaction (approve + publishAndFund via EvmPublisher), so it takes the route bytes out of that
 * calldata rather than re-encoding `execution.intent.route` — the bytes the router hashed and
 * signed are the ones that get published.
 */
import type { V1QuoteRequest, V1QuoteResponse } from '@eco-foundation/api-schemas/v1/types';
import { type Address, decodeFunctionData, type Hex } from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';
import { ErrorCode, RoutesCliError } from '@/shared/errors';

import type { QuoteRequest, QuoteResult } from './quote.service';

export function toV1QuoteRequest(req: QuoteRequest, dappId: string): V1QuoteRequest {
  return {
    type: 'exact-in',
    source: {
      chainId: Number(req.source),
      token: req.rewardToken,
      amount: req.amount.toString(),
      funder: req.funder,
    },
    destination: {
      chainId: Number(req.destination),
      token: req.routeToken,
      recipient: req.recipient,
    },
    refundRecipient: req.funder,
    dappId,
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

  const tx = execution.transaction;
  if (tx.type !== 'evm') {
    throw new RoutesCliError(
      ErrorCode.QUOTE_SERVICE_ERROR,
      `Gateway quote ${res.id} funds via a ${tx.type} transaction; routes-cli only self-publishes EVM-sourced ` +
        `gateway quotes today. For a ${req.source} source, quote a solver directly with SOLVER_URL.`,
      true
    );
  }

  return {
    encodedRoute: routeBytesFromPublishAndFund(res.id, tx.data as Hex),
    sourcePortal: tx.to as Address,
    prover: execution.intent.reward.prover as Address,
    deadline: execution.intent.reward.deadline,
    destinationAmount: res.destination.amountOut,
    estimatedFulfillTimeSec: res.steps.reduce((sum, s) => sum + (s.estimatedDurationSec ?? 0), 0),
    intentExecutionType: 'SELF_PUBLISH',
    destinationPortalAddress: execution.intent.route.portal as Address,
    destinationChainId: res.destination.chainId,
  };
}

/** The `route` argument of the router-built `Portal.publishAndFund(...)` / `publishAndFundFor(...)`. */
function routeBytesFromPublishAndFund(quoteId: string, data: Hex): Hex {
  let decoded: { functionName: string; args?: readonly unknown[] };
  try {
    decoded = decodeFunctionData({ abi: portalAbi, data });
  } catch {
    throw new RoutesCliError(
      ErrorCode.QUOTE_SERVICE_ERROR,
      `Gateway quote ${quoteId}: the funding transaction is not a recognised Portal call; expected publishAndFund.`,
      false
    );
  }
  if (decoded.functionName !== 'publishAndFund' && decoded.functionName !== 'publishAndFundFor') {
    throw new RoutesCliError(
      ErrorCode.QUOTE_SERVICE_ERROR,
      `Gateway quote ${quoteId}: the funding transaction calls Portal.${decoded.functionName}; expected publishAndFund.`,
      false
    );
  }
  // publishAndFund(uint64 destination, bytes route, Reward reward, bool allowPartial)
  return decoded.args?.[1] as Hex;
}
