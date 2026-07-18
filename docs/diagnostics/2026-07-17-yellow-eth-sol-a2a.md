# Yellow ETH/SOL Any-to-Any Production Diagnosis

Date: 2026-07-17

## Success definition

A non-inventory-to-non-inventory route is successful only when both conditions hold:

1. The promoted bucket child delivers the requested destination token to the configured recipient.
2. After the child proof lands, the child reward is withdrawn to the configured source-chain
   kernel claimant.

The local source-swap parent's withdrawal is intermediate. It must not be reported as terminal
route success.

## ETH on Base to native SOL on Solana

Request:

- Source: `0.0006 ETH` on Base
- Destination: native SOL on Solana
- Recipient: `3vvcFp6rUuTrrYK7SSqQKeYYiwvZXWmMnmgLfXDKgAu6`
- Quote ID: `e70e6d60-78fa-40bf-a34a-e81b9cd6f177`
- Quoted destination: `0.009385403 SOL`
- Quoted minimum: `0.009265207 SOL`

Execution evidence:

- Parent intent: `0x0e02553e9916e1d74f4ab8c554661c88cb2bb886b4332c83e7267623501c163f`
- Parent funding transaction: `0x36a8a175bf49e26ff0a0bf419b73ac3294ad30e6c9ad725a4de369d2ba7ab673`
- Yellow source execution transaction: `0xc8b3ff563ee33720ddc88e31ff5ee8ca9b3243e15fdc421099dff265227579ed`
- Yellow terminal state: `FAILED`
- Yellow error: `EVM_REVERT_EMPTY`

An Alchemy `debug_traceTransaction` call narrows the generic error to an out-of-gas failure in
Base USDC's `transferFrom`, reached through the Portal/source-swap call tree. The transaction gas
limit was `779605`; the failed receipt used `752623`. The token delegate call reports `out of gas`
and its wrapper returns `0x1425ea42` (safe-transfer failure).

All eight bucket children stayed `CANDIDATE`; none was promoted. Therefore there was no destination
SOL delivery, proof, or child reward withdrawal. This is a source-executor gas estimation/buffer
failure, not a Solana destination-swap failure.

## Native SOL on Solana to ETH on Base

Request:

- Source: `0.015 SOL` on Solana (`0.01 SOL` was below Yellow's protocol-fee floor)
- Destination: native ETH on Base
- Recipient: `0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1`
- Quote ID: `2c15549d-1277-4fdf-bf17-47a267a83c28`
- Quoted destination: `0.000174638005247589 ETH`
- Quoted minimum: `0.000170723277338716 ETH`

Execution evidence:

- Parent intent: `0xca86540d27b18d806ebd7bf159eb0d7bb5610ba7b8a6d814298fba3092aa6815`
- Parent funding signature:
  `2mpp5KcUppFbrX8HzvAey4rcWyRWAMQ21GqB1nuXfp3DYoZB6RWxQbxa7xCQBusemHjfkBGKt6oKjNUJxNkX8BJo`
- Yellow state during the full 600-second run: `EXECUTING`
- Four bucket children remained `CANDIDATE`
- No `fulfilledEvent`, `selectedEvent`, or `lastError` was recorded

The matrix timed out after 600 seconds. A later direct Yellow reconciliation found that the parent
was refunded at `2026-07-17T23:30:06Z` in transaction
`25hDH1BZ73qrCKx2BeQL4yedKnB9L54BpBjwxPih9cScNkq4ugLb2JkCZFvPjhLcLMzhwFbcNT1zpgRPwUB6pZ4s`.
All four bucket children were still `CANDIDATE`, so this was a source-side refund rather than a
completed bucket promotion.

Paid Solana RPC evidence narrows the source failure to the final atomic flash-fulfill transaction:

- Yellow successfully created the missing executor wSOL ATA in
  `4MgZiz8VT4EiWLmrSoM4DVPAxmJRa12aJAYuctSgEXscicW2Nj9dKcy16dcQTVgRV2hkp6izdbGDg457pXh8zAe5`.
- It successfully created the four bucket-vault USDC ATAs in
  `3gVsRLMycjx9uQCwH4u2EnhMGm7Rrsk6TUD5r2HrDANoiWPwBN2FcGYZxht3vUZzPJPNtpn7fCbdfvgm86EJqx4r`.
- It successfully wrote the three-part `FlashFulfillIntent` buffer at PDA
  `8ttb9hTbBqeJgrpZpohbjctaXPJBkceo9XTQKoKbS5Me`.
- Every retry then created and extended a single-use lookup table and immediately deactivated it.
  No transaction invoking the atomic flash-fulfill instruction was broadcast.

Reconstructing the exact atomic message from the stored parent and the two lookup tables rules out
the solver's local structural guards: it references 43 accounts (limit 64) and serializes to 447
bytes (limit 1232). The remaining failure boundary is RPC preflight/program simulation after signing
and before broadcast. The simulation error/logs must be recovered from the Yellow solver logs for
this intent hash; Mongo does not retain `lastError` for the failed attempts.

No destination ETH delivery or child withdrawal occurred.

### Successful rerun after Yellow configuration changes

A fresh run of the same `0.015 SOL -> ETH on Base` leg completed the full two-intent lifecycle:

- Quote ID: `cab6e155-2401-4900-963a-221b90c28470`
- Parent intent: `0x93edc28072fbfdcd7b2f655787403778244b89971366053a3deb5b7b0eeb32ee`
- Funding signature:
  `4uGieW6HsU5Dkm9UDqTFcLJUL6KCcSGQMXnA1FAUGzGwwdFnCcMvqoyPSRyBLj6yriJYFAPE51fEpr6sFEzbXH5k`
- Source swap / parent withdrawal / bucket selection signature:
  `46KoY3RBbZ5iqRs62vA12YQQVLGmksdSRLJBwAnRQsFxYXTX2VSbDNRP3WmHvoPgcwcsjbY9b4M1RkpR8Xs9Ka4h`
- Promoted bucket: index `2`
- Promoted child intent:
  `0x435c9182b8d0b26cab2bbf5ce42ef877da3dc5ec400a0df777fe065438f554e5`
- Destination fulfillment transaction:
  `0x8a757238f23a828b0baae7c1cf00b54b7ebd8cc5c915350df923e153413efb00`
- Verified recipient delivery: `0.000173081723812561 ETH`
- Quote minimum: `0.000170246853059800 ETH`
- Proof signature:
  `SFwn5V9HmXYUNV4k4VJbfm6G49ynGwd3meFRcgG9QZG8y2m2C4bun6AiCMxdda7g3ZynKnqJfziX3Mp7XMQVqiv`
- Child withdrawal signature:
  `4T5sAkGCQm4ekmAtjDQkMg1kum2Nw2K7woUVXiaDKg2CzkRfSENDpEYVNEFMNiUgeAtFZRRrAPb6gn6dHLVedjkp`
- Verified child reward withdrawal: `1.123404 USDC`
- Expected and observed kernel claimant:
  `7HBkzmHz3gYHBV4DJ1GCvCax815zgrntRRwoBJEZi3Fe`

The first matrix pass observed destination delivery while the withdrawal was pending. The later
`--reconcile` pass observed the proof and child withdrawal and moved the row to `SUCCEEDED`. This is
the intended success boundary: the earlier parent withdrawal was not terminal.

## Harness changes resulting from the diagnosis

- Native ETH and SOL withdrawals use matching Portal withdrawal events plus exact intent-vault
  balance debits.
- Destination delivery is verified independently using the recipient's transaction balance delta.
- Bucket promotion and child lifecycle are read directly from Yellow Mongo by quote ID.
- The first pass stops at `DELIVERED_PENDING_WITHDRAWAL`; `SUCCEEDED` is reserved for a later
  reconciliation that verifies child proof and exact kernel withdrawal.
- Yellow parent `FAILED` states surface immediately as `SOURCE_FAILED`, instead of waiting only on
  Portal status until timeout.
- Withdrawal verification accepts the quote-supplied source Portal. Production chain metadata does
  not currently carry a static Solana Portal address, so requiring only the static value caused a
  false `WITHDRAWAL_MISMATCH` even when the on-chain source withdrawal succeeded.

## Current conclusion

The SOL-to-ETH direction is now confirmed end to end: source swap, bucket selection, destination ETH
delivery, proof, and child reward withdrawal to the Solana kernel all completed and were independently
verified. The earlier SVM preflight/refund was not reproduced after the Yellow configuration change.

ETH-to-SOL remains blocked on the previously identified EVM executor gas limit until the gas-buffer
fix is merged and deployed to Yellow. That failure occurs before bucket promotion and is independent
of the now-verified Solana destination delivery and withdrawal path.
