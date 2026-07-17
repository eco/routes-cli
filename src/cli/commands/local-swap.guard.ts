/**
 * Reject a no-op local swap: a same-chain intent whose reward and route tokens
 * are the same token (e.g. USDC -> USDC on Base). Cross-chain transfers of the
 * same token (a bridge) are allowed because the chains differ.
 */
export function assertLocalSwapTokensDiffer(params: {
  sourceChainId: bigint;
  destChainId: bigint;
  chainName: string;
  rewardToken: { symbol?: string; address: string };
  routeToken: { symbol?: string; address: string };
}): void {
  const sameChain = params.sourceChainId === params.destChainId;
  const sameToken =
    params.rewardToken.address.toLowerCase() === params.routeToken.address.toLowerCase();
  if (sameChain && sameToken) {
    const symbol = params.rewardToken.symbol ?? params.rewardToken.address;
    throw new Error(
      `Local swap requires two different tokens on ${params.chainName} (got ${symbol} → ${symbol}).`
    );
  }
}
