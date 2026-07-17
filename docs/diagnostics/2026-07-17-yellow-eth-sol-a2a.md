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

The matrix timed out after 600 seconds. This is a stuck Solana source-execution/bucket-selection
path. No destination ETH delivery or child withdrawal occurred.

## Harness changes resulting from the diagnosis

- Native ETH and SOL withdrawals use matching Portal withdrawal events plus exact intent-vault
  balance debits.
- Destination delivery is verified independently using the recipient's transaction balance delta.
- Bucket promotion and child lifecycle are read directly from Yellow Mongo by quote ID.
- The first pass stops at `DELIVERED_PENDING_WITHDRAWAL`; `SUCCEEDED` is reserved for a later
  reconciliation that verifies child proof and exact kernel withdrawal.
- Yellow parent `FAILED` states surface immediately as `SOURCE_FAILED`, instead of waiting only on
  Portal status until timeout.

## Current conclusion

Neither direction completed in this run. Yellow can quote both directions, but the source leg fails
before bucket promotion: EVM-to-SVM reverts from insufficient execution gas, while SVM-to-EVM stays
stuck in `EXECUTING`. A withdrawal reconciliation should be rerun only if the reverse parent later
progresses and a bucket child is promoted.
