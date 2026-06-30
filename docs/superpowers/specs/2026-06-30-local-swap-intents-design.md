# Local (same-chain) swap intents — design

**Date:** 2026-06-30
**Branch:** `feat/local-swaps`
**Status:** Approved, pending implementation

## Goal

Let the `publish` command create an intent whose source and destination are the
**same** chain — e.g. swap USDC → USDT on Base — using the existing publishing
flow rather than a separate command.

## Background

Today the CLI assumes every intent is cross-chain. The only place this is
enforced is the interactive destination picker in
`src/cli/commands/publish.command.ts:104-111`, which filters out the source
chain:

```ts
await this.prompt.selectChain(
  allChains.filter(c => c.id !== sourceChain.id),
  'Select destination chain:'
);
```

Everything downstream already treats source and destination as independent
values:

- The quote request (`publish.command.ts:162-171`) sends `source` and
  `destination` as separate fields — for a local swap they are simply equal.
- Portal, prover, recipient, reward construction, `--watch`, and intent storage
  all operate on the two chains independently and need no change.
- The manual-route fallback (`publish.command.ts:198-205`) builds the route from
  the destination portal + route token on the one chain — already valid for a
  local swap.

The quote backend (Eco quote service) already supports same-chain quotes
(confirmed by the user), so no backend or quote-service-client work is required.

## Design

Three parts. The change is intentionally surgical.

### 1. Allow the same chain at destination selection

In `publish.command.ts`, remove the `.filter(c => c.id !== sourceChain.id)` from
the interactive destination prompt so the source chain is selectable as the
destination.

The flag path (`--source base --destination base`) and the config-default path
already resolve the destination without filtering, so they inherit the relaxed
behavior automatically. No flag changes needed.

### 2. Reject a no-op local swap

After both `routeToken` (destination) and `rewardToken` (source) are resolved,
add one guard:

- **Condition:** `sourceChain.id === destChain.id` **AND** the reward-token
  address equals the route-token address (case-insensitive comparison on the
  resolved token address).
- **Action:** throw with a clear message, e.g.
  `Local swap requires two different tokens on <chain> (got USDC → USDC).`

Cross-chain same-symbol transfers (USDC → USDC across two chains) remain allowed,
because the chains differ so the guard does not fire.

Place the guard after token resolution (after `publish.command.ts:121`) and
before the quote request, so it fails fast without a network call.

### 3. No other changes

Quote request, portal/prover resolution, reward building, `--watch`, dry-run, and
storage are unchanged.

## Components touched

| File | Change |
|------|--------|
| `src/cli/commands/publish.command.ts` | Remove destination filter; add no-op guard after token resolution. |
| tests (new) | Cover the guard logic. |

## Error handling

- No-op local swap → thrown `Error` with an actionable message naming the chain
  and the duplicated token symbol.
- Existing quote-failure fallback to manual route is unaffected and still applies
  to local swaps.

## Testing

**Unit (the smallest test that catches the bug):**
- same-chain + identical token address → throws the no-op error.
- same-chain + different tokens → passes the guard.
- different chains + identical token symbol/address → passes the guard
  (cross-chain bridge still allowed).

**Manual verification:**
- `publish --source base --destination base --dry-run` with USDC reward + USDT
  route → a quote is returned and the intent builds (no broadcast).
- Interactive: select Base as both source and destination, confirm Base now
  appears in the destination list.

## Success criteria

- A user can publish an intent with source == destination through `publish`
  (interactive, flags, or config defaults).
- USDC → USDC on the same chain is rejected client-side with a clear message.
- Cross-chain behavior is unchanged.
- New unit tests pass; lint/typecheck/build pass.

## Out of scope

- Dedicated `swap` subcommand.
- Any backend / quote-service changes.
- Non-EVM-specific local-swap handling beyond what the existing flow already does.
