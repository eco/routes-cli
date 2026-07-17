# Native Withdrawal Verification Design

## Goal

Make settlement-matrix withdrawal verification support native EVM and SVM rewards while preserving the existing ERC-20 and SPL-token checks. A matrix row succeeds only when on-chain evidence shows that the exact reward amount reached the withdrawal claimant.

For cross-chain router paths, the row additionally succeeds only after the promoted child intent
delivers the requested destination token to the configured recipient. A withdrawal of the local
source-swap parent is an intermediate step and is never terminal route success.

## Scope

This change is limited to matrix reporting and verification. It does not change intent publication,
quote construction, fulfillment, proof, or withdrawal execution. It extends matrix lifecycle
polling and adds a resumable reconciliation mode.

The matrix reads Yellow's Mongo lifecycle records by `quoteID` to resolve bucket candidates and the
promoted child. The Mongo URI is supplied through `YELLOW_MONGODB_URI` and is never written to the
report. This direct lookup follows the production-diagnostics requirement and avoids treating the
parent's local Portal state as the whole order.

## Cross-Chain Lifecycle

For a bucketed non-inventory-to-non-inventory route the matrix records two intent identities:

1. `parentIntentHash`: the local source-swap intent funded by the user.
2. `childIntentHash`: the bucket candidate promoted by `fundedEvent` or `selectedEvent`.

The first execution pass waits for the promoted child and its destination `fulfilledEvent`, then
verifies the exact destination-token balance increase in that fulfillment transaction. If proof or
withdrawal has not landed yet, the terminal phase for that pass is
`DELIVERED_PENDING_WITHDRAWAL`, with `success=false`.

A reconciliation pass reloads the existing report, resolves the same child by `quoteID`, and
requires:

- `provenEvent` on the child;
- `withdrawnEvent` on the child;
- a raw on-chain `IntentWithdrawn` event for that child;
- the withdrawal claimant to equal the configured source-chain kernel claimant; and
- the exact child reward amount to leave its source-chain vault.

Only then does the row become `SUCCEEDED` and contribute to `successRate`.

For native SOL delivery, the destination verifier uses the recipient account's exact
`postBalances - preBalances` delta from the child fulfillment transaction. SPL and EVM destination
tokens retain their family-specific token-transfer/balance evidence.

## Native Reward Detection

- EVM native rewards use the zero-address sentinel: `0x0000000000000000000000000000000000000000`.
- SVM native rewards use the System Program ID sentinel: `11111111111111111111111111111111`.
- All other EVM and SVM reward addresses continue through the existing token-transfer verification paths.

## EVM Native Verification

For a native EVM reward, the verifier will:

1. Fetch the settlement transaction receipt from the chain's configured RPC.
2. Find the Portal `IntentWithdrawn` event emitted by the configured Portal address.
3. Require the event's intent hash to equal the matrix row's intent hash.
4. Read the claimant from the indexed event field.
5. Decode the original publish transaction already stored in the matrix row and resolve the
   deterministic intent vault through the Portal's `intentVaultAddress` view.
6. Fetch the vault's native balance at the settlement block and the preceding block.
7. Return the positive vault debit as the withdrawn amount.

The existing matrix assertion then requires the delta to equal the exact reward amount, rejects a claimant equal to the funder, and checks an optional configured expected claimant.

The vault debit is used instead of the claimant's end-of-block credit because router/prover
contracts may receive and spend the reward atomically. This was observed in the production Base
source-swap: the claimant stayed at zero while the intent vault moved from exactly
`600000000000000` wei to zero. Vault balances and the Portal view use standard JSON-RPC and do not
require provider-specific transaction tracing.

## SVM Native Verification

For a native SVM reward, the verifier will:

1. Fetch the settlement transaction and metadata from the configured RPC.
2. Decode the Portal `IntentWithdrawn` event from transaction logs.
3. Require the event's intent hash to equal the matrix row's intent hash.
4. Read the claimant public key from the event.
5. Resolve the derived intent vault PDA in the transaction's complete account-key list, including
   loaded addresses.
6. Compute `preBalances[index] - postBalances[index]` as the withdrawn lamport amount.
7. Continue requiring the intent's claimed-marker PDA to exist.

The same exact-amount and claimant assertions used by token rewards remain in force.

## Existing Token Verification

- ERC-20 rewards require a matching Portal `IntentWithdrawn` event and a decoded reward-token
  `Transfer` to that event's claimant.
- SPL-token rewards require a matching Portal withdrawal event and a positive raw pre/post token
  balance delta for that event's claimant.

## Failure Behavior

The verifier continues to return structured `{ error }` results rather than throwing into the matrix runner. Native verification fails when any required evidence is missing or inconsistent, including:

- no matching `IntentWithdrawn` event;
- malformed claimant data;
- vault absent from SVM transaction account keys;
- missing balance snapshots;
- a non-positive balance delta;
- missing SVM claimed-marker PDA; or
- an amount or claimant mismatch in the existing final assertion.

## Testing

Implementation follows red-green-refactor:

1. Add unit coverage for native sentinel detection and native balance-delta helpers.
2. Add service-level regression tests for successful EVM and SVM native verification.
3. Add failures for a mismatched intent event and an incorrect native delta.
4. Confirm existing ERC-20, SPL-token, claimant, and amount tests remain green.
5. Run the matrix-focused suite, typecheck, formatting, and lint.

## Acceptance Criteria

- The Base native-ETH matrix route no longer reports a missing ERC-20 transfer.
- Native EVM and SVM rewards are verified using Portal withdrawal evidence plus exact intent-vault
  balance debits.
- ERC-20 and SPL-token behavior is unchanged.
- Exact reward amount and claimant safety checks remain mandatory.
