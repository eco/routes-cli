# Yellow Any-to-Any quote diagnosis (2026-07-17)

## Outcome

Yellow is accepting and dispatching the requests. The five failures are not missing
solver route registrations: they are HTTP 500 responses from the pricing layer with
`PriceUnavailableError`.

The immediate external failure is CoinGecko Pro HTTP 429, error code `10006`: the
configured account has exhausted its monthly credits and overage is disabled.

There is also a configuration/code mismatch that increases the blast radius:
`fulfillment.router.feePolicy.excludeProverFeeFromRouterQuotes: true` is not part of
`RouterSchema`, is stripped during Zod parsing, and is not read by the quote code.
The source-swap builders therefore calculate a dynamic prover fee on unflagged
reference child intents and require a destination-stable price during quoting.

## Reproduction

Endpoint hit directly:

```text
POST https://solver-yellow.eco.com/api/v2/quote/reverse
```

Command:

```bash
SOLVER_URL=https://solver-yellow.eco.com \
  pnpm dev matrix --quote-only \
  --config config/matrix-pairs-a2a-production.json \
  --timeout 30
```

Two consecutive runs produced the same 4/9 result:

| Case | Route | Result | Second-run latency | Error |
|---|---|---:|---:|---|
| SS-1 | ETH Base -> USDC Arbitrum | failed | 1139 ms | `PriceUnavailableError` |
| SS-2 | ETH Base -> USDC Solana | quoted | 400 ms | - |
| SS-3 | USDC Base -> ETH Arbitrum | quoted | 852 ms | - |
| SS-4 | USDC Base -> SOL Solana | quoted | 386 ms | - |
| SS-5 | ETH Base -> ARB Arbitrum | failed | 471 ms | `PriceUnavailableError` |
| SS-6 | ETH Base -> SOL Solana | quoted | 643 ms | - |
| SS-7 | SOL Solana -> USDC Base | failed | 346 ms | `PriceUnavailableError` |
| SS-8 | SOL Solana -> ETH Base | failed | 304 ms | `PriceUnavailableError` |
| SS-10 | ETH Arbitrum -> USDC Base control | failed | 269 ms | `PriceUnavailableError` |

## Failure path

1. `RouterQuoteService` dispatches the request to the templated or bucketed
   source-swap builder. This confirms the route is registered.
2. The builder obtains the source DEX quote before fee projection.
3. The builder creates a stable-to-stable reference child intent without the
   `ANY_TO_ANY` flag.
4. `ProtocolFeeService.calculateProtocolFee()` therefore includes the prover fee.
5. The dynamic prover fee is converted into the destination stable through
   `PriceService.convertToToken()`.
6. A missing/unusable cache entry triggers CoinGecko. CoinGecko returns HTTP 429,
   and `PriceService` surfaces `PriceUnavailableError` as the quote's HTTP 500.

The working destination-swap cases set `ANY_TO_ANY` before protocol fee calculation,
so `ProtocolFeeService` skips the prover-price conversion. The Solana-destination
source-swap cases can continue while a usable cached Solana stable rate exists; the
external provider itself currently rejects new calls for every tested platform.

## Remediation

1. Restore CoinGecko capacity: enable overage, add credits, or rotate to an account
   with available credits. Restart/reload Yellow if the secret is not hot-reloaded.
2. Decide the router fee policy explicitly. If prover fees are meant to be excluded
   from Any-to-Any quotes, add the field to `RouterSchema` and honor it in both source
   builders (or flag the reference child intents consistently before fee calculation).
3. Add a metric/alert for CoinGecko 429 responses and cache-miss-driven
   `PriceUnavailableError` so quota exhaustion is visible before quote availability
   becomes cache-dependent.
4. Re-run this quote-only matrix after remediation; no wallet funding is required.
