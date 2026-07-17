# Cross-VM settlement recipient design

Date: 2026-07-17

## Problem

Quote-only matrix runs select the funder from the source VM and the recipient
from the destination VM. Settlement mode instead uses the source funder for
both fields. This produces an invalid recipient representation for cross-VM
routes: an EVM address for EVM-to-SVM and a Solana address for SVM-to-EVM.

## Design

Settlement mode will resolve the source and destination chains independently.
It will derive the funder from the configured source-chain private key and the
recipient from the configured destination-chain private key. The quote request
will use the source address for `funder` and `refundRecipient`, and the
destination address for `recipient`.

The existing source key remains the only key used to sign and publish the
source-chain intent. The destination key is used only to derive a controlled
recipient address.

If either required key is unavailable, the route will fail before requesting a
quote or publishing. The error will identify whether the missing key belongs to
the source funder or destination recipient VM.

No new configuration is introduced. Existing `EVM_PRIVATE_KEY`,
`SVM_PRIVATE_KEY`, and `TVM_PRIVATE_KEY` values remain the source of controlled
addresses. The existing TVM fallback to the EVM key remains unchanged.

## Scope

This change fixes recipient selection in the funded matrix path only. It does
not change quote-only actors, publishing, status polling, proof detection, or
withdrawal verification.

## Tests

Service tests will demonstrate that:

1. EVM-to-SVM settlement quotes with the EVM-derived funder and SVM-derived
   recipient.
2. SVM-to-EVM settlement quotes with the SVM-derived funder and EVM-derived
   recipient.
3. A missing destination key fails before quote or publish.
4. Existing same-VM behavior continues to derive a valid controlled recipient.

The regression tests must fail against the current `funder, funder` behavior
before the implementation is changed.

## Safety

The fix prevents a funded cross-VM route from embedding an address encoded for
the wrong virtual machine. A production matrix run remains subject to balance,
quote-expiry, and explicit route/amount preflight checks.
