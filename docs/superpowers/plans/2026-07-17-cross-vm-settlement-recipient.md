# Cross-VM Settlement Recipient Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make funded matrix quote requests derive their recipient from the destination VM's configured private key instead of reusing the source funder address.

**Architecture:** Keep `MatrixService.submitPair()` responsible for resolving the two configured chains. Derive the funder from the source chain type and the recipient independently from the destination chain type, while continuing to sign and publish only with the source key. Exercise the behavior at the service boundary by inspecting real `pairToQuoteRequest()` inputs and stopping each test route at the mocked quote call.

**Tech Stack:** TypeScript, NestJS, Jest, viem, `@solana/web3.js`, pnpm.

## Global Constraints

- Do not introduce new configuration fields.
- Keep quote-only actor selection unchanged.
- Keep the source private key as the only publishing/signing key.
- Preserve the existing TVM-to-EVM private-key fallback in `resolveKey()`.
- Fail before quote or publish when the destination VM key is missing.
- Do not modify status polling, proof detection, or withdrawal verification.
- Preserve all pre-existing uncommitted changes in the worktree.

---

### Task 1: Regression coverage for destination-derived recipients

**Files:**
- Create: `tests/fixtures/matrix-a2a-settlement-recipients.json`
- Modify: `tests/matrix/matrix.service.test.ts`

**Interfaces:**
- Consumes: `MatrixService.run(options: MatrixRunOptions): Promise<MatrixReport>` and `ConfigService.getKeyForChainType(chainType: ChainType): string | undefined`.
- Produces: Regression assertions over the `QuoteService.getQuote()` request fields `funder`, `refundRecipient`, and `recipient`.

- [ ] **Step 1: Add a three-route settlement fixture**

Create a fixture containing EVM-to-SVM, SVM-to-EVM, and EVM-to-EVM pairs:

```json
{
  "pairs": [
    {
      "id": "EVM-SVM",
      "label": "ETH Base -> USDC Solana",
      "sourceChainId": 8453,
      "destinationChainId": 1399811149,
      "inputToken": "0x0000000000000000000000000000000000000000",
      "outputToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "amount": "0.0003",
      "inputDecimals": 18
    },
    {
      "id": "SVM-EVM",
      "label": "SOL Solana -> USDC Base",
      "sourceChainId": 1399811149,
      "destinationChainId": 8453,
      "inputToken": "11111111111111111111111111111111",
      "outputToken": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "amount": "0.012",
      "inputDecimals": 9
    },
    {
      "id": "EVM-EVM",
      "label": "ETH Base -> USDC Arbitrum",
      "sourceChainId": 8453,
      "destinationChainId": 42161,
      "inputToken": "0x0000000000000000000000000000000000000000",
      "outputToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      "amount": "0.0003",
      "inputDecimals": 18
    }
  ]
}
```

- [ ] **Step 2: Extend the service test harness with deterministic keys**

Use a deterministic EVM key and an SVM keypair derived from a fixed seed. Extend `makeService()` so its config mock returns keys by `ChainType`, and add Arbitrum to `chainsById`:

```ts
import { Keypair } from '@solana/web3.js';
import { privateKeyToAccount } from 'viem/accounts';

const EVM_KEY = `0x${'11'.repeat(32)}`;
const EVM_ADDRESS = privateKeyToAccount(EVM_KEY).address;
const SVM_KEYPAIR = Keypair.fromSeed(new Uint8Array(32).fill(7));
const SVM_KEY = JSON.stringify(Array.from(SVM_KEYPAIR.secretKey));
const SVM_ADDRESS = SVM_KEYPAIR.publicKey.toBase58();

function makeService(
  getQuote: jest.Mock,
  keys: Partial<Record<ChainType, string>> = {}
) {
  // Add chain 42161 as ChainType.EVM to chainsById.
  const config = {
    getKeyForChainType: jest.fn((type: ChainType) => keys[type]),
  };
  // Pass `config as never` to MatrixService.
}
```

- [ ] **Step 3: Add cross-VM and same-VM settlement tests**

Make the quote mock reject with `stop after quote` so the test observes address selection without publishing:

```ts
describe('MatrixService settlement recipients', () => {
  beforeEach(() => jest.clearAllMocks());

  it('derives each recipient from the destination VM key', async () => {
    const getQuote = jest.fn().mockRejectedValue(new Error('stop after quote'));
    const { service } = makeService(getQuote, {
      [ChainType.EVM]: EVM_KEY,
      [ChainType.SVM]: SVM_KEY,
    });

    await service.run({
      configPath: 'tests/fixtures/matrix-a2a-settlement-recipients.json',
    });

    expect(getQuote).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        funder: EVM_ADDRESS,
        refundRecipient: EVM_ADDRESS,
        recipient: SVM_ADDRESS,
      })
    );
    expect(getQuote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        funder: SVM_ADDRESS,
        refundRecipient: SVM_ADDRESS,
        recipient: EVM_ADDRESS,
      })
    );
    expect(getQuote).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        funder: EVM_ADDRESS,
        refundRecipient: EVM_ADDRESS,
        recipient: EVM_ADDRESS,
      })
    );
  });

  it('fails before quoting when the destination VM key is missing', async () => {
    const getQuote = jest.fn();
    const { service, publisherFactory } = makeService(getQuote, {
      [ChainType.EVM]: EVM_KEY,
    });

    const report = await service.run({
      configPath: 'tests/fixtures/matrix-a2a-quote.json',
    });

    expect(getQuote).not.toHaveBeenCalled();
    expect(publisherFactory.create).not.toHaveBeenCalled();
    expect(report.rows[0]).toMatchObject({
      phase: 'PUBLISH_FAILED',
      error: `No recipient key configured for ${ChainType.SVM}`,
    });
  });
});
```

- [ ] **Step 4: Run the focused test and verify RED**

Run:

```bash
pnpm test -- --runInBand tests/matrix/matrix.service.test.ts
```

Expected: the destination-recipient assertions fail because current settlement mode passes the source funder as `recipient`; the missing-destination-key assertion also fails because no destination key is currently requested.

---

### Task 2: Derive and validate the settlement recipient

**Files:**
- Modify: `src/matrix/matrix.service.ts:275-300`
- Test: `tests/matrix/matrix.service.test.ts`

**Interfaces:**
- Consumes: `resolvePairRoute()`, `ChainsService.getChainById()`, `MatrixService.resolveKey()`, and `deriveAddress()`.
- Produces: A quote request with a source-derived `funder`/`refundRecipient` and destination-derived `recipient`.

- [ ] **Step 1: Resolve the destination chain and key**

Immediately after resolving the source chain, resolve the configured destination chain. Derive each address independently:

```ts
const sourceChain = this.chains.getChainById(BigInt(sourceChainId));
const destinationChain = this.chains.getChainById(BigInt(configuredDestinationChainId));

const funderKey = this.resolveKey(sourceChain.type);
if (!funderKey) throw new Error(`No funder key configured for ${sourceChain.type}`);
const funder = deriveAddress(funderKey, sourceChain.type);

const recipientKey = this.resolveKey(destinationChain.type);
if (!recipientKey) {
  throw new Error(`No recipient key configured for ${destinationChain.type}`);
}
const recipient = deriveAddress(recipientKey, destinationChain.type);
```

Keep the existing local variable name `chain` only if all later source-chain operations remain unambiguous; otherwise rename it to `sourceChain` throughout `submitPair()`.

- [ ] **Step 2: Pass the destination-derived recipient to the quote**

Replace the source/source request with:

```ts
quote = await this.quoteService.getQuote(pairToQuoteRequest(pair, funder, recipient));
```

Update the nearby comment to state that the funder is source-controlled and the recipient is destination-controlled.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
pnpm test -- --runInBand tests/matrix/matrix.service.test.ts
```

Expected: all quote-only and settlement-recipient tests pass.

- [ ] **Step 4: Review the focused diff**

Run:

```bash
git diff --check
git diff -- src/matrix/matrix.service.ts tests/matrix/matrix.service.test.ts tests/fixtures/matrix-a2a-settlement-recipients.json
```

Expected: no whitespace errors; the source change is limited to destination-chain recipient derivation and the test change is limited to regression coverage. Do not commit the overlapping dirty implementation files unless the user separately requests it.

---

### Task 3: Verification

**Files:**
- Verify: `src/matrix/matrix.service.ts`
- Verify: `tests/matrix/matrix.service.test.ts`
- Verify: `tests/fixtures/matrix-a2a-settlement-recipients.json`

**Interfaces:**
- Consumes: the completed Tasks 1-2.
- Produces: fresh test, typecheck, formatting, and lint evidence.

- [ ] **Step 1: Run matrix and quote regression tests**

```bash
pnpm test -- --runInBand tests/matrix tests/quote
```

Expected: all selected suites pass with zero failed tests.

- [ ] **Step 2: Run TypeScript typechecking**

```bash
pnpm typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Run formatting and focused lint checks**

```bash
pnpm exec prettier --check src/matrix/matrix.service.ts tests/matrix/matrix.service.test.ts tests/fixtures/matrix-a2a-settlement-recipients.json
pnpm exec eslint src/matrix/matrix.service.ts tests/matrix/matrix.service.test.ts --ext .ts
```

Expected: both commands exit 0.

- [ ] **Step 4: Recheck repository state**

```bash
git status --short
git diff --check
```

Expected: no whitespace errors; existing unrelated worktree changes remain preserved.
