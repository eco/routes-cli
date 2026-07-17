# Native Withdrawal Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify complete two-leg Any-to-Any settlement: destination delivery by the promoted child followed by exact child-reward withdrawal to the kernel claimant.

**Architecture:** Resolve the parent and promoted child directly from Yellow Mongo by `quoteID`. The first pass verifies the child's destination fulfillment transaction and exact recipient balance delta, then records `DELIVERED_PENDING_WITHDRAWAL`; a resumable reconciliation pass verifies child proof and exact source-vault withdrawal to the configured kernel claimant before recording `SUCCEEDED`. Native/token evidence remains VM-specific.

**Tech Stack:** TypeScript, Jest/ts-jest, viem, `@solana/web3.js`, NestJS, MongoDB.

## Global Constraints

- EVM native sentinel is `0x0000000000000000000000000000000000000000`.
- SVM native sentinel is `11111111111111111111111111111111`.
- A native result requires a matching Portal `IntentWithdrawn` event and an exact intent-vault balance debit.
- SVM withdrawal verification continues to require the claimed-marker PDA.
- ERC-20 and SPL-token withdrawals must be tied to the matching child withdrawal event and claimant.
- Verifier failures return `{ error: string }`; they do not throw into the matrix runner.
- Implementation is test-first: every production behavior is preceded by a failing test.
- Parent source-swap withdrawal never contributes to terminal success for a cross-chain row.
- Yellow Mongo credentials come only from `YELLOW_MONGODB_URI` and are never persisted.

---

### Task 1: Native Reward and Balance Helpers

**Files:**
- Modify: `src/matrix/matrix.util.ts`
- Test: `tests/matrix/withdrawal.test.ts`

**Interfaces:**
- Produces: `isNativeReward(chainType: string, rewardToken: string): boolean`
- Produces: `positiveBalanceDebit(before: bigint, after: bigint): bigint | null`
- Consumed by: `WithdrawalVerifierService` in Task 2.

- [ ] **Step 1: Write failing helper tests**

Add tests that require EVM zero-address and SVM System Program sentinels to be native, wrapped-token/mint addresses to be non-native, and balance debits to return a value only when the vault balance decreases.

```typescript
expect(isNativeReward('EVM', '0x0000000000000000000000000000000000000000')).toBe(true);
expect(isNativeReward('SVM', '11111111111111111111111111111111')).toBe(true);
expect(isNativeReward('EVM', '0x4200000000000000000000000000000000000006')).toBe(false);
expect(positiveBalanceDebit(25n, 10n)).toBe(15n);
expect(positiveBalanceDebit(10n, 25n)).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm exec jest tests/matrix/withdrawal.test.ts --runInBand`

Expected: FAIL because `isNativeReward` and `positiveBalanceDebit` are not exported.

- [ ] **Step 3: Implement the minimal pure helpers**

```typescript
const EVM_NATIVE_SENTINEL = '0x0000000000000000000000000000000000000000';
const SVM_NATIVE_SENTINEL = '11111111111111111111111111111111';

export function isNativeReward(chainType: string, rewardToken: string): boolean {
  if (chainType === 'EVM') return rewardToken.toLowerCase() === EVM_NATIVE_SENTINEL;
  if (chainType === 'SVM') return rewardToken === SVM_NATIVE_SENTINEL;
  return false;
}

export function positiveBalanceDebit(before: bigint, after: bigint): bigint | null {
  return before > after ? before - after : null;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `pnpm exec jest tests/matrix/withdrawal.test.ts --runInBand`

Expected: PASS.

- [ ] **Step 5: Commit the helper cycle**

```bash
git add src/matrix/matrix.util.ts tests/matrix/withdrawal.test.ts
git commit -m "test(matrix): define native withdrawal balance semantics"
```

### Task 2: EVM Native Withdrawal Verification

**Files:**
- Modify: `src/matrix/withdrawal-verifier.service.ts`
- Modify: `src/matrix/matrix.service.ts`
- Modify: `tests/matrix/matrix.service.test.ts`
- Create: `tests/matrix/withdrawal-verifier.service.test.ts`

**Interfaces:**
- Consumes: `isNativeReward()` and `positiveBalanceDebit()` from Task 1.
- Produces: EVM native results through `verify(chain, intentHash, settlementTxHash, rewardToken, publishTxHash?)`.

- [ ] **Step 1: Write failing EVM native service tests**

Mock viem's public client and construct an `IntentWithdrawn` log with `encodeEventTopics`/`encodeAbiParameters`. Mock the publish transaction, Portal vault lookup, and block-to-block vault balances. Require a matching intent to return the event claimant and exact vault debit. Add failures for a different intent hash and a non-positive vault debit. Keep an ERC-20 test proving the existing `Transfer` path remains selected for non-native tokens.

```typescript
const facts = await service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, EVM_ZERO);
expect(facts).toEqual({ withdrawnAmount: 600000000000000n, claimant: CLAIMANT });
expect(getBalance).toHaveBeenNthCalledWith(1, {
  address: VAULT,
  blockNumber: 99n,
});
expect(getBalance).toHaveBeenNthCalledWith(2, {
  address: VAULT,
  blockNumber: 100n,
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `pnpm exec jest tests/matrix/withdrawal-verifier.service.test.ts --runInBand`

Expected: FAIL with the current `no reward-token (...) Transfer` error.

- [ ] **Step 3: Implement the EVM native branch**

Pass `intentHash` and `publishTxHash` into `verifyEvm`. For native rewards, filter receipt logs by the configured Portal address, decode `IntentWithdrawn` from `portalAbi`, require `args.intentHash` to match, and normalize `args.claimant`. Fetch and decode the original `publishAndFund` transaction, resolve its vault with the Portal `intentVaultAddress` view, read vault balances at `receipt.blockNumber - 1n` and `receipt.blockNumber`, and return the positive debit. Return explicit errors for a missing publish hash, missing Portal configuration, malformed publish transaction, missing matching event, genesis-block receipts, or non-positive debits.

Pass `row.publishTxHash` as the optional fifth argument from `MatrixService.verifyWithdrawal`, and add a matrix-service assertion proving the recorded publish hash reaches the verifier.

```typescript
if (isNativeReward(chain.type, rewardToken)) {
  return this.verifyEvmNative(client, chain, receipt, intentHash, publishTxHash);
}
```

- [ ] **Step 4: Run EVM service tests and verify GREEN**

Run: `pnpm exec jest tests/matrix/withdrawal-verifier.service.test.ts --runInBand`

Expected: PASS for native success/failures and the ERC-20 regression.

- [ ] **Step 5: Commit the EVM cycle**

```bash
git add src/matrix/withdrawal-verifier.service.ts src/matrix/matrix.service.ts tests/matrix/withdrawal-verifier.service.test.ts tests/matrix/matrix.service.test.ts
git commit -m "feat(matrix): verify native EVM withdrawals by balance"
```

### Task 3: SVM Native Withdrawal Verification

**Files:**
- Modify: `src/matrix/withdrawal-verifier.service.ts`
- Modify: `tests/matrix/withdrawal-verifier.service.test.ts`

**Interfaces:**
- Consumes: `isNativeReward()` and `positiveBalanceDebit()` from Task 1.
- Produces: SVM native results through the existing `verify(...)` interface with `claimedMarkerPresent` retained.

- [ ] **Step 1: Write failing SVM native service tests**

Mock a Solana transaction with `IntentWithdrawn` log messages, complete account keys, aligned `preBalances`/`postBalances`, and an existing claimed-marker account. Require the native sentinel to return the decoded claimant and exact vault lamport debit. Add failures for a missing matching event and a vault absent from the account keys.

```typescript
const facts = await service.verify(solanaChain, INTENT_HASH, SIGNATURE, SVM_SYSTEM_PROGRAM);
expect(facts).toEqual({
  withdrawnAmount: 8_000_000n,
  claimant: SVM_CLAIMANT,
  claimedMarkerPresent: true,
});
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `pnpm exec jest tests/matrix/withdrawal-verifier.service.test.ts --runInBand`

Expected: FAIL because the current SVM code searches SPL token balances for the System Program ID.

- [ ] **Step 3: Implement the SVM native branch**

Decode Anchor events from `meta.logMessages` using `EventParser` plus the mainnet Portal Borsh coder, match `IntentWithdrawn.intentHash`, and normalize its claimant public key. Resolve the existing derived vault PDA from `message.getAccountKeys({ accountKeysFromLookups: meta.loadedAddresses })`, and calculate its indexed lamport debit. Reuse the existing claimed-marker lookup and return explicit errors for missing logs, event, vault account key, balance entry, or positive debit.

```typescript
if (isNativeReward(chain.type, rewardToken)) {
  return this.verifySvmNative(tx, portalProgramId, vaultOwner, intentHash, markerInfo !== null);
}
```

- [ ] **Step 4: Run SVM service tests and verify GREEN**

Run: `pnpm exec jest tests/matrix/withdrawal-verifier.service.test.ts --runInBand`

Expected: PASS for native SVM success/failures and existing SPL behavior.

- [ ] **Step 5: Commit the SVM cycle**

```bash
git add src/matrix/withdrawal-verifier.service.ts tests/matrix/withdrawal-verifier.service.test.ts
git commit -m "feat(matrix): verify native SVM withdrawals by balance"
```

### Task 4: Full Verification and Production Reconciliation

**Files:**
- Modify only if verification exposes a defect: files already listed above.
- Inspect: `results/matrix-2026-07-17T22-08-52-416Z/summary.json`

**Interfaces:**
- Consumes: completed verifier behavior from Tasks 1-3.
- Produces: verified build/test state and direct production evidence for the Base native route.

- [ ] **Step 1: Run matrix-focused tests**

Run:

```bash
pnpm exec jest tests/matrix tests/quote/quote.service.test.ts tests/shared/security/derive-address.test.ts --runInBand
```

Expected: all tests pass.

- [ ] **Step 2: Run static verification**

Run:

```bash
pnpm typecheck
pnpm format:check
pnpm lint
```

Expected: all commands exit zero.

- [ ] **Step 3: Reconcile the production native route through paid Alchemy RPC**

Load the existing Alchemy key without printing it, export `EVM_RPC_URL_8453`, and invoke the implemented verifier against:

- intent: `0x71f234cc3f7536c8f4ab796b5785171bfcc2a650e4b6a7f6d9347a313c642fdb`
- settlement transaction: `0xb905e90868caa421b6e3b27e15045b7dfcf47c8b41b542b16f7e32246485c050`
- reward: `0.0006 ETH`

Expected: matching withdrawal claimant and an exact `600000000000000` wei vault debit.

- [ ] **Step 4: Check repository state and final diff**

Run:

```bash
git status --short
git diff --check HEAD~3..HEAD
git log --oneline -6
```

Expected: only intended commits and ignored matrix artifacts.
