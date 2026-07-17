# Native Withdrawal Verification Design

## Goal

Make settlement-matrix withdrawal verification support native EVM and SVM rewards while preserving the existing ERC-20 and SPL-token checks. A matrix row succeeds only when on-chain evidence shows that the exact reward amount reached the withdrawal claimant.

## Scope

This change is limited to `WithdrawalVerifierService` and focused test helpers. It does not change intent publication, quote construction, fulfillment, proof, withdrawal execution, or matrix lifecycle polling.

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
5. Fetch the claimant's native balance at the settlement block and the preceding block.
6. Return the positive balance delta as the withdrawn amount.

The existing matrix assertion then requires the delta to equal the exact reward amount, rejects a claimant equal to the funder, and checks an optional configured expected claimant.

Balance deltas are intentionally portable across standard JSON-RPC providers. A different transaction involving the claimant in the same block could affect the delta; matching the Portal event constrains the evidence to a real withdrawal, but the amount check may conservatively fail in that rare case.

## SVM Native Verification

For a native SVM reward, the verifier will:

1. Fetch the settlement transaction and metadata from the configured RPC.
2. Decode the Portal `IntentWithdrawn` event from transaction logs.
3. Require the event's intent hash to equal the matrix row's intent hash.
4. Read the claimant public key from the event.
5. Resolve the claimant in the transaction's complete account-key list, including loaded addresses.
6. Compute `postBalances[index] - preBalances[index]` as the withdrawn lamport amount.
7. Continue requiring the intent's claimed-marker PDA to exist.

The same exact-amount and claimant assertions used by token rewards remain in force.

## Existing Token Verification

- ERC-20 rewards remain verified from decoded reward-token `Transfer` logs.
- SPL-token rewards remain verified from raw pre/post token balances, excluding the intent vault PDA.
- No token verification semantics change in this work.

## Failure Behavior

The verifier continues to return structured `{ error }` results rather than throwing into the matrix runner. Native verification fails when any required evidence is missing or inconsistent, including:

- no matching `IntentWithdrawn` event;
- malformed claimant data;
- claimant absent from SVM transaction account keys;
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
- Native EVM and SVM rewards are verified using Portal withdrawal evidence plus native balance deltas.
- ERC-20 and SPL-token behavior is unchanged.
- Exact reward amount and claimant safety checks remain mandatory.
