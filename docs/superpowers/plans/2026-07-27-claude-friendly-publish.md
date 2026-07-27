# Claude-Friendly `publish` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `routes publish` fully usable without a TTY (complete flag surface, `--yes`, `--json`, fail-fast prompt errors) and ship a SKILL.md that teaches Claude how to drive it.

**Architecture:** Wire new CLI flags through the existing `PublishFlowOverrides` prompt-skipping seam in `IntentPublishFlow`. A single non-TTY guard in `PromptService` turns every would-be prompt into an error naming the missing flag. `DisplayService` gains a JSON mode that routes human output to stderr so stdout carries exactly one JSON object.

**Tech Stack:** TypeScript, NestJS + nest-commander, viem, inquirer, jest. Spec: `docs/superpowers/specs/2026-07-27-claude-friendly-publish-design.md`. Ticket: PAR-407.

## Global Constraints

- Node >= 18; package manager is **pnpm**.
- Run unit tests with `npx jest <path>` (main jest config ignores `tests/e2e/`); full unit suite: `pnpm test:unit`.
- Immutability: construct new objects (spread), never mutate params.
- Never print or log private key VALUES; never give a default value for a private key. The literal `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80` is the well-known public anvil dev key already committed in this repo's tests — it is the only key allowed in tests.
- Commit only files you changed in the task; conventional commit messages (`feat:`, `test:`, `docs:`); NO Co-Authored-By lines.
- Universal Addresses everywhere internally; denormalize only in publishers, user display, and external API calls (quote requests use chain-native — note `TokenSelection.address` is **chain-native**, matching `PromptService.selectToken` which denormalizes before returning).
- Branch: `cfebres/par-407-claude-friendly-publish` (already created and checked out).
- A pre-commit hook runs `tsc --noEmit`; if a commit fails, fix types before retrying.

---

### Task 1: NonInteractiveError + PromptService non-TTY guard

**Files:**
- Modify: `src/shared/errors/routes-cli-error.ts` (add enum member)
- Create: `src/shared/errors/non-interactive-error.ts`
- Modify: `src/shared/errors/index.ts`
- Modify: `src/cli/services/prompt.service.ts`
- Test: `tests/cli/prompt.service.test.ts` (new)

**Interfaces:**
- Consumes: `RoutesCliError`, `ErrorCode` from `src/shared/errors/routes-cli-error.ts`.
- Produces: `NonInteractiveError` class `new NonInteractiveError(what: string, flagHint: string)` exported from `@/shared/errors`; message format exactly `` `${what} not specified. Pass ${flagHint} when running non-interactively.` ``. `PromptService.selectChain` gains 3rd param `flagHint?: string` (default `'--source <chain> or --destination <chain>'`); `PromptService.inputAmount` gains 4th param `flagHint?: string` (default `'--amount <value>'`). All other prompt methods keep their signatures but throw `NonInteractiveError` when `!process.stdin.isTTY || !process.stdout.isTTY`.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/prompt.service.test.ts`:

```typescript
import { PromptService } from '@/cli/services/prompt.service';
import { NonInteractiveError } from '@/shared/errors';
import { ChainConfig, ChainType } from '@/shared/types';

const CHAIN: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: any = {
  get: () => ({ validateAddress: () => true, getAddressFormat: () => 'hex' }),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizer: any = { normalize: (a: string) => a, denormalize: (a: string) => a };

describe('PromptService non-TTY guard', () => {
  const service = new PromptService(registry, normalizer);
  const originalStdin = process.stdin.isTTY;
  const originalStdout = process.stdout.isTTY;

  const setTTY = (value: boolean): void => {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  };

  beforeEach(() => setTTY(false));
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdout, configurable: true });
  });

  it('confirmPublish names --yes', async () => {
    await expect(service.confirmPublish()).rejects.toThrow(NonInteractiveError);
    await expect(service.confirmPublish()).rejects.toThrow(
      'Confirmation not specified. Pass --yes when running non-interactively.'
    );
  });

  it('confirm names --yes', async () => {
    await expect(service.confirm('proceed?')).rejects.toThrow('--yes');
  });

  it('selectToken names --<label>-token', async () => {
    await expect(service.selectToken(CHAIN, [], 'route')).rejects.toThrow(
      'Route token not specified. Pass --route-token <symbol|address> when running non-interactively.'
    );
    await expect(service.selectToken(CHAIN, [], 'reward')).rejects.toThrow('--reward-token');
  });

  it('inputAmount defaults to --amount and honors a custom hint', async () => {
    await expect(service.inputAmount('USDC', 6)).rejects.toThrow('--amount <value>');
    await expect(service.inputAmount('USDC', 6, '0.1', '--route-amount <value>')).rejects.toThrow(
      '--route-amount <value>'
    );
  });

  it('inputAddress names --<label>', async () => {
    await expect(service.inputAddress(CHAIN, 'recipient')).rejects.toThrow(
      'Recipient address not specified. Pass --recipient <address> when running non-interactively.'
    );
  });

  it('selectChain defaults to source/destination hint and honors a custom hint', async () => {
    await expect(service.selectChain([CHAIN], 'pick')).rejects.toThrow(
      '--source <chain> or --destination <chain>'
    );
    await expect(service.selectChain([CHAIN], 'pick', '--source <chain>')).rejects.toThrow(
      '--source <chain>'
    );
  });

  it('portal and prover prompts name their flags', async () => {
    await expect(service.inputManualPortal(CHAIN)).rejects.toThrow('--portal-address <address>');
    await expect(service.inputManualProver(CHAIN)).rejects.toThrow('--prover-address <address>');
    await expect(service.selectProver(CHAIN, CHAIN)).rejects.toThrow(
      '--prover-type <name> or --prover-address <address>'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cli/prompt.service.test.ts`
Expected: FAIL — `NonInteractiveError` is not exported / prompts don't throw.

- [ ] **Step 3: Implement**

In `src/shared/errors/routes-cli-error.ts`, add to the `ErrorCode` enum (after `QUOTE_SERVICE_ERROR`):

```typescript
  NON_INTERACTIVE = 'NON_INTERACTIVE',
```

Create `src/shared/errors/non-interactive-error.ts`:

```typescript
import { ErrorCode, RoutesCliError } from './routes-cli-error';

/**
 * Thrown when an interactive prompt would fire but the session has no TTY
 * (e.g. driven by an agent or CI). The message names the exact CLI flag
 * that supplies the missing value.
 */
export class NonInteractiveError extends RoutesCliError {
  constructor(what: string, flagHint: string) {
    super(
      ErrorCode.NON_INTERACTIVE,
      `${what} not specified. Pass ${flagHint} when running non-interactively.`,
      true
    );
    this.name = 'NonInteractiveError';
    Object.setPrototypeOf(this, NonInteractiveError.prototype);
  }
}
```

In `src/shared/errors/index.ts` add:

```typescript
export * from './non-interactive-error';
```

In `src/cli/services/prompt.service.ts`:

Add the import:

```typescript
import { NonInteractiveError } from '@/shared/errors';
```

Add a private helper and a capitalizer at the top of the class:

```typescript
  private assertInteractive(what: string, flagHint: string): void {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      throw new NonInteractiveError(what, flagHint);
    }
  }

  private static capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
```

Then add as the FIRST line of each method body:

| Method | New signature (if changed) | First line |
|---|---|---|
| `selectChain` | `selectChain(chains, message, flagHint = '--source <chain> or --destination <chain>')` | `this.assertInteractive('Chain', flagHint);` |
| `selectToken` | unchanged | `this.assertInteractive(\`${PromptService.capitalize(label)} token\`, \`--${label}-token <symbol\|address>\`);` |
| `inputAmount` | `inputAmount(label, decimals, defaultValue = '0.1', flagHint = '--amount <value>')` | `this.assertInteractive('Amount', flagHint);` |
| `inputAddress` | unchanged | `this.assertInteractive(\`${PromptService.capitalize(label)} address\`, \`--${label} <address>\`);` |
| `confirmPublish` | unchanged | `this.assertInteractive('Confirmation', '--yes');` |
| `confirm` | unchanged | `this.assertInteractive('Confirmation', '--yes');` |
| `inputManualPortal` | unchanged | `this.assertInteractive('Portal address', '--portal-address <address>');` |
| `inputManualProver` | unchanged | `this.assertInteractive('Prover address', '--prover-address <address>');` |
| `selectProver` | unchanged | `this.assertInteractive('Prover', '--prover-type <name> or --prover-address <address>');` |

Note: `\|` in the `selectToken` row is markdown table escaping — the actual hint string is `` `--${label}-token <symbol|address>` `` with a plain pipe, matching the Task 1 test expectations.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/cli/prompt.service.test.ts` — Expected: PASS.
Run: `pnpm test:unit` — Expected: PASS (jest runs with no TTY, so any existing test that unknowingly reached a prompt would already have hung; none should break, but if one throws `NonInteractiveError` now, that test was silently depending on a prompt — mock the prompt method instead).

- [ ] **Step 5: Commit**

```bash
git add src/shared/errors/ src/cli/services/prompt.service.ts tests/cli/prompt.service.test.ts
git commit -m "feat: fail fast with flag hints when prompts fire without a TTY"
```

---

### Task 2: TokenResolverService (symbol/address → TokenSelection)

**Files:**
- Create: `src/cli/services/token-resolver.service.ts`
- Modify: `src/cli/cli.module.ts` (register provider)
- Test: `tests/cli/token-resolver.service.test.ts` (new)

**Interfaces:**
- Consumes: `TOKEN_CONFIGS` from `@/config/tokens.config`; `ChainRegistryService` (`get(chainType).validateAddress(addr)`); `AddressNormalizerService.denormalize(universal, chainType)`; `TokenSelection` from `@/cli/services/intent-publish-flow.service` (`{ address: string; decimals: number; symbol?: string }` — `address` is chain-native); `RoutesCliError.configurationError`.
- Produces: `TokenResolverService.resolve(input: string, chain: ChainConfig, opts: { decimals?: number; decimalsFlag: string }): TokenSelection` — Task 5 calls this.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/token-resolver.service.test.ts`:

```typescript
import { TokenResolverService } from '@/cli/services/token-resolver.service';
import { ChainConfig, ChainType } from '@/shared/types';

const BASE: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

const NATIVE_USDC_ON_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: any = {
  get: () => ({
    validateAddress: (a: string) => /^0x[0-9a-fA-F]{40}$/.test(a),
    getAddressFormat: () => 'hex',
  }),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizer: any = { denormalize: () => NATIVE_USDC_ON_BASE };

describe('TokenResolverService.resolve', () => {
  const resolver = new TokenResolverService(registry, normalizer);
  const opts = { decimalsFlag: '--reward-token-decimals' };

  it('resolves a known symbol (case-insensitive) to chain-native address + decimals', () => {
    const sel = resolver.resolve('usdc', BASE, opts);
    expect(sel).toEqual({ address: NATIVE_USDC_ON_BASE, decimals: 6, symbol: 'USDC' });
  });

  it('rejects a known symbol not configured on the chain, listing configured chains', () => {
    const SONIC = { ...BASE, id: 999999n, name: 'Nowhere' };
    expect(() => resolver.resolve('USDC', SONIC, opts)).toThrow(/not configured on Nowhere/);
  });

  it('accepts a raw address when decimals are provided', () => {
    const sel = resolver.resolve(NATIVE_USDC_ON_BASE, BASE, { decimals: 6, ...opts });
    expect(sel).toEqual({ address: NATIVE_USDC_ON_BASE, decimals: 6 });
  });

  it('rejects a raw address without decimals, naming the decimals flag', () => {
    expect(() => resolver.resolve(NATIVE_USDC_ON_BASE, BASE, opts)).toThrow(
      /--reward-token-decimals/
    );
  });

  it('rejects garbage input, listing known symbols', () => {
    expect(() => resolver.resolve('NOPE', BASE, opts)).toThrow(/USDC/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cli/token-resolver.service.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/cli/services/token-resolver.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainRegistryService } from '@/blockchain/chain-registry.service';
import { TOKEN_CONFIGS } from '@/config/tokens.config';
import { RoutesCliError } from '@/shared/errors';
import { ChainConfig } from '@/shared/types';

import { TokenSelection } from './intent-publish-flow.service';

/**
 * Resolves a --route-token/--reward-token CLI value (symbol or raw address)
 * into the TokenSelection shape the publish flow consumes.
 * Returned addresses are chain-native (same contract as selectToken's prompt).
 */
@Injectable()
export class TokenResolverService {
  constructor(
    private readonly registry: ChainRegistryService,
    private readonly normalizer: AddressNormalizerService
  ) {}

  resolve(
    input: string,
    chain: ChainConfig,
    opts: { decimals?: number; decimalsFlag: string }
  ): TokenSelection {
    const symbol = input.toUpperCase();
    const token = TOKEN_CONFIGS[symbol];
    if (token) {
      const universal = token.addresses[chain.id.toString()];
      if (!universal) {
        throw RoutesCliError.configurationError(
          `Token ${symbol} is not configured on ${chain.name} (chain ${chain.id}). ` +
            `Configured chain IDs: ${Object.keys(token.addresses).join(', ')}.`
        );
      }
      return {
        address: this.normalizer.denormalize(universal, chain.type) as string,
        decimals: token.decimals,
        symbol: token.symbol,
      };
    }

    const handler = this.registry.get(chain.type);
    if (handler.validateAddress(input)) {
      if (opts.decimals === undefined) {
        throw RoutesCliError.configurationError(
          `Raw token address given but decimals are unknown. ` +
            `Pass ${opts.decimalsFlag} <n> alongside the address.`
        );
      }
      return { address: input, decimals: opts.decimals };
    }

    throw RoutesCliError.configurationError(
      `Token "${input}" is neither a known symbol ` +
        `(${Object.keys(TOKEN_CONFIGS).join(', ')}) nor a valid ${chain.type} address.`
    );
  }
}
```

In `src/cli/cli.module.ts`: import `TokenResolverService` from `'./services/token-resolver.service'` and add it to the `providers` array.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/cli/token-resolver.service.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/services/token-resolver.service.ts src/cli/cli.module.ts tests/cli/token-resolver.service.test.ts
git commit -m "feat: resolve --route-token/--reward-token symbols and raw addresses"
```

---

### Task 3: DisplayService JSON mode (human output → stderr)

**Files:**
- Modify: `src/cli/services/display.service.ts`
- Test: `tests/cli/display.service.test.ts` (new)

**Interfaces:**
- Produces: `DisplayService.setJsonMode(enabled: boolean): void`. When enabled, every human-output method writes to stderr; stdout is left untouched for the caller's JSON. Task 5 calls `setJsonMode(true)` when `--json` is passed.

- [ ] **Step 1: Write the failing test**

Create `tests/cli/display.service.test.ts`:

```typescript
import { DisplayService } from '@/cli/services/display.service';

describe('DisplayService JSON mode', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('routes log/title/section/success/displayTable to stderr when enabled', () => {
    const display = new DisplayService();
    display.setJsonMode(true);
    display.log('a');
    display.title('b');
    display.section('c');
    display.success('d');
    display.displayTable(['h'], [['v']]);
    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).toHaveBeenCalled();
  });

  it('keeps stdout for human output when disabled', () => {
    const display = new DisplayService();
    display.log('a');
    expect(stdoutSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/cli/display.service.test.ts`
Expected: FAIL — `setJsonMode` does not exist.

- [ ] **Step 3: Implement**

In `src/cli/services/display.service.ts`:

Add to the class:

```typescript
  private jsonMode = false;

  /** In JSON mode all human output goes to stderr so stdout carries only JSON. */
  setJsonMode(enabled: boolean): void {
    this.jsonMode = enabled;
  }

  private writeLine(msg: string): void {
    const stream = this.jsonMode ? process.stderr : process.stdout;
    stream.write(`${msg}\n`);
  }
```

Then replace **every** `console.log(...)` call in the file with `this.writeLine(...)` (there are occurrences in `succeed`, `log`, `success`, `title`, `section`, `displayTable`, and the display helpers below line 80 — sweep the whole file with `rg -n "console.log" src/cli/services/display.service.ts` and convert all of them). Leave `console.warn`/`console.error` untouched (already stderr). Leave ora untouched (its default stream is already stderr).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/cli/display.service.test.ts` — Expected: PASS.
Run: `rg -n "console.log" src/cli/services/display.service.ts` — Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/cli/services/display.service.ts tests/cli/display.service.test.ts
git commit -m "feat: add DisplayService JSON mode routing human output to stderr"
```

---

### Task 4: Flow changes — --yes gating, dry-run ordering, routeAmount override, structured result

**Files:**
- Modify: `src/cli/services/intent-publish-flow.service.ts`
- Test: `tests/cli/intent-publish-flow.test.ts` (extend; some existing assertions change)

**Interfaces:**
- Consumes: `NonInteractiveError`-throwing prompts from Task 1 (passes `'--route-amount <value>'` as `inputAmount`'s 4th arg in the fallback).
- Produces (Task 5 relies on these exact shapes):

```typescript
export interface PublishFlowOptions {
  privateKey?: string;
  privateKeyTvm?: string;
  privateKeySvm?: string;
  recipient?: string;
  portalAddress?: string;
  proverAddress?: string;
  proverType?: string;
  dryRun?: boolean;
  watch?: boolean;
  yes?: boolean; // NEW
}

export interface PublishFlowOverrides {
  rewardToken?: TokenSelection;
  routeToken?: TokenSelection;
  rewardAmount?: bigint;
  routeAmount?: bigint; // NEW — used only by the quote-failure manual fallback
  recipientRaw?: string;
  quoteDestinationChainIdOverride?: bigint;
}

export interface PublishFlowResult {
  dryRun: boolean;
  result: PublishResult | null; // null on dry-run
  intent: Intent | null; // null on dry-run
  sourceChainId: bigint;
  destinationChainId: bigint;
  recipient: string; // chain-native recipient on the destination chain
}
```

`publish()` now returns `Promise<PublishFlowResult>` (never null).

- [ ] **Step 1: Write the failing tests**

Add to `tests/cli/intent-publish-flow.test.ts` (reuse the existing `buildFlow()` factory, `SOURCE_CHAIN`, `DEST_CHAIN`, `TOKEN_USDC` fixtures):

```typescript
describe('non-interactive publishing', () => {
  const FULL_OVERRIDES = {
    rewardToken: TOKEN_USDC,
    routeToken: TOKEN_USDC,
    rewardAmount: 1_000_000n,
  };
  const RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  it('publishes without any prompt when all values are provided and yes=true', async () => {
    const m = buildFlow();
    const outcome = await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { yes: true, recipient: RECIPIENT },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.selectToken).not.toHaveBeenCalled();
    expect(m.prompt.inputAmount).not.toHaveBeenCalled();
    expect(m.prompt.inputAddress).not.toHaveBeenCalled();
    expect(m.prompt.confirmPublish).not.toHaveBeenCalled();
    expect(outcome.dryRun).toBe(false);
    expect(outcome.result?.success).toBe(true);
    expect(outcome.recipient).toBe(RECIPIENT);
    expect(outcome.sourceChainId).toBe(SOURCE_CHAIN.id);
  });

  it('still asks for confirmation without yes', async () => {
    const m = buildFlow();
    await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { recipient: RECIPIENT },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.confirmPublish).toHaveBeenCalled();
  });

  it('dry-run returns before confirmation and before publishing', async () => {
    const m = buildFlow();
    const outcome = await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { dryRun: true, recipient: RECIPIENT },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.confirmPublish).not.toHaveBeenCalled();
    expect(m.publisher.publish).not.toHaveBeenCalled();
    expect(outcome.dryRun).toBe(true);
    expect(outcome.result).toBeNull();
    expect(outcome.intent).toBeNull();
  });

  it('uses overrides.routeAmount in the quote-failure fallback without prompting', async () => {
    const m = buildFlow();
    m.quoteService.getQuote.mockRejectedValue(new Error('quote service down'));
    await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: {
        yes: true,
        recipient: RECIPIENT,
        portalAddress: RECIPIENT,
        proverAddress: RECIPIENT,
      },
      overrides: { ...FULL_OVERRIDES, routeAmount: 2_000_000n },
    });
    expect(m.prompt.inputAmount).not.toHaveBeenCalled();
    expect(m.intentBuilder.buildManualRoute).toHaveBeenCalledWith(
      expect.objectContaining({ routeAmount: 2_000_000n })
    );
  });

  it('uses the derived sender address as recipient with yes=true and no --recipient', async () => {
    const m = buildFlow();
    const outcome = await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { yes: true },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.inputAddress).not.toHaveBeenCalled();
    // TEST_PRIVATE_KEY's derived EVM address (anvil dev account 0)
    expect(outcome.recipient).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx jest tests/cli/intent-publish-flow.test.ts`
Expected: new tests FAIL (no `yes` handling, `publish` returns old shape); note which pre-existing tests fail too — they assert the old return shape and get updated in Step 3.

- [ ] **Step 3: Implement in `src/cli/services/intent-publish-flow.service.ts`**

3a. Update the exported interfaces exactly as in this task's Interfaces block (`yes` on options, `routeAmount` on overrides, new `PublishFlowResult`), and change `publish`'s return type to `Promise<PublishFlowResult>`.

3b. In `resolveRecipientRaw`, return the derived default without prompting when `--yes` is set — replace the final `return this.prompt.inputAddress(...)` with:

```typescript
    if (recipientDefault && options.yes) return recipientDefault;
    return this.prompt.inputAddress(destChain, 'recipient', recipientDefault);
```

3c. In `fetchQuoteOrManualRoute`, thread overrides through: add `overrides: PublishFlowOverrides` to its args object (update the caller), and replace the fallback's amount prompt

```typescript
      const { parsed: routeAmount } = await this.prompt.inputAmount(
        routeToken.symbol ?? 'tokens',
        routeToken.decimals
      );
```

with:

```typescript
      const routeAmount =
        overrides.routeAmount ??
        (
          await this.prompt.inputAmount(
            routeToken.symbol ?? 'tokens',
            routeToken.decimals,
            '0.1',
            '--route-amount <value>'
          )
        ).parsed;
```

3d. In `publish()`, restructure the tail (everything from the current `const confirmed = ...` line down to the current `return { result, intent };`) into this order — compute destination first, dry-run exit second, confirm third:

```typescript
    // When the caller overrode the quote's destination, ignore any echo-back
    // from the quote response — the on-chain intent should always target the
    // operational destChain.
    const destinationChainId =
      overrides.quoteDestinationChainIdOverride !== undefined
        ? destChain.id
        : quote?.destinationChainId
          ? BigInt(quote.destinationChainId)
          : destChain.id;

    if (options.dryRun) {
      this.display.warning('Dry run — not publishing');
      return {
        dryRun: true,
        result: null,
        intent: null,
        sourceChainId: sourceChain.id,
        destinationChainId,
        recipient: recipientRaw,
      };
    }

    if (options.yes !== true) {
      const confirmed = await this.prompt.confirmPublish();
      if (!confirmed) throw new Error('Publication cancelled by user');
    }

    const publisher = this.publisherFactory.create(sourceChain);
    const result = await publisher.publish(
      sourceChain.id,
      destinationChainId,
      reward,
      encodedRoute,
      publishKeyHandle,
      sourcePortal
    );

    if (!result.success) {
      this.display.fail('Publishing failed');
      throw new Error(result.error);
    }

    const intent: Intent = {
      destination: destinationChainId,
      sourceChainId: sourceChain.id,
      route: {} as Intent['route'],
      reward,
    };
    await this.intentStorage.save(intent, result);
    this.display.succeed('Intent published!');
    this.display.displayTransactionResult(result);

    if (options.watch === true && result.intentHash) {
      await this.runWatchFlow(result.intentHash, destChain, quote);
    }

    return {
      dryRun: false,
      result,
      intent,
      sourceChainId: sourceChain.id,
      destinationChainId,
      recipient: recipientRaw,
    };
```

(The old `confirmed`/dry-run block and the old duplicate `destinationChainId` computation are deleted; nothing else in the method changes.)

3e. Update pre-existing tests in `tests/cli/intent-publish-flow.test.ts` that assert the old shape: any `expect(outcome).toBeNull()` for dry-run becomes `expect(outcome.dryRun).toBe(true)`; destructuring of `{ result, intent }` still works for successful publishes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/cli/intent-publish-flow.test.ts` — Expected: PASS (all, including pre-existing).
Run: `pnpm test:unit` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/services/intent-publish-flow.service.ts tests/cli/intent-publish-flow.test.ts
git commit -m "feat: gate confirmation on --yes, exit dry-run before confirm, add routeAmount override"
```

---

### Task 5: PublishCommand — new flags, remove --rpc, JSON emission

**Files:**
- Create: `src/cli/utils/parse-amount.ts`
- Modify: `src/cli/commands/publish.command.ts`
- Test: `tests/cli/publish.command.test.ts` (new), `tests/cli/parse-amount.test.ts` (new)

**Interfaces:**
- Consumes: `TokenResolverService.resolve(input, chain, { decimals?, decimalsFlag })` (Task 2), `DisplayService.setJsonMode` (Task 3), `PublishFlowResult`/`PublishFlowOverrides`/`PublishFlowOptions.yes` (Task 4), `serialize` from `@/commons/utils/serialize`, `getErrorMessage` from `@/commons/utils/error-handler`.
- Produces: the final CLI surface. nest-commander camelCases flags: `--route-token`→`routeToken`, `--reward-token`→`rewardToken`, `--route-token-decimals`→`routeTokenDecimals`, `--reward-token-decimals`→`rewardTokenDecimals`, `--amount`→`amount`, `--route-amount`→`routeAmount`, `-y/--yes`→`yes`, `--json`→`json`. Also `parseAmount(raw: string, decimals: number, flag: string): bigint`.

- [ ] **Step 1: Write the failing tests**

Create `tests/cli/parse-amount.test.ts`:

```typescript
import { parseAmount } from '@/cli/utils/parse-amount';

describe('parseAmount', () => {
  it('converts human units using token decimals', () => {
    expect(parseAmount('10.5', 6, '--amount')).toBe(10_500_000n);
    expect(parseAmount('1', 18, '--amount')).toBe(1_000_000_000_000_000_000n);
  });

  it('rejects zero, negatives, and non-numbers, naming the flag', () => {
    expect(() => parseAmount('0', 6, '--amount')).toThrow(/--amount.*positive/);
    expect(() => parseAmount('-1', 6, '--amount')).toThrow(/--amount/);
    expect(() => parseAmount('abc', 6, '--route-amount')).toThrow(/--route-amount/);
  });

  it('rejects more decimal places than the token supports', () => {
    expect(() => parseAmount('0.0000001', 6, '--amount')).toThrow(/decimal places/);
  });
});
```

Create `tests/cli/publish.command.test.ts`:

```typescript
import { PublishCommand } from '@/cli/commands/publish.command';
import { ChainConfig, ChainType } from '@/shared/types';

const SOURCE: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};
const DEST: ChainConfig = { ...SOURCE, id: 10n, name: 'Optimism' };
const USDC = { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' };

interface CommandMocks {
  command: PublishCommand;
  flow: { publish: jest.Mock };
  tokenResolver: { resolve: jest.Mock };
  display: { setJsonMode: jest.Mock; title: jest.Mock };
}

function buildCommand(): CommandMocks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chains: any = {
    listChains: () => [SOURCE, DEST],
    resolveChain: (nameOrId: string) => (nameOrId === 'base' ? SOURCE : DEST),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt: any = { selectChain: jest.fn() };
  const display = { setJsonMode: jest.fn(), title: jest.fn() };
  const flow = {
    publish: jest.fn().mockResolvedValue({
      dryRun: false,
      result: { success: true, intentHash: '0xhash', transactionHash: '0xtx' },
      intent: {},
      sourceChainId: 8453n,
      destinationChainId: 10n,
      recipient: '0xrecipient',
    }),
  };
  const tokenResolver = { resolve: jest.fn().mockReturnValue(USDC) };
  const command = new PublishCommand(
    chains,
    prompt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    display as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flow as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenResolver as any
  );
  return { command, flow, tokenResolver, display };
}

describe('PublishCommand flag wiring', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds overrides from token/amount flags and passes yes through', async () => {
    const m = buildCommand();
    await m.command.run([], {
      source: 'base',
      destination: 'optimism',
      routeToken: 'USDC',
      rewardToken: 'USDC',
      amount: '5',
      yes: true,
    });
    expect(m.tokenResolver.resolve).toHaveBeenCalledWith('USDC', DEST, {
      decimals: undefined,
      decimalsFlag: '--route-token-decimals',
    });
    expect(m.tokenResolver.resolve).toHaveBeenCalledWith('USDC', SOURCE, {
      decimals: undefined,
      decimalsFlag: '--reward-token-decimals',
    });
    const call = m.flow.publish.mock.calls[0][0];
    expect(call.overrides.rewardAmount).toBe(5_000_000n);
    expect(call.overrides.routeToken).toEqual(USDC);
    expect(call.options.yes).toBe(true);
  });

  it('rejects --amount without --reward-token', async () => {
    const m = buildCommand();
    await expect(
      m.command.run([], { source: 'base', destination: 'optimism', amount: '5' })
    ).rejects.toThrow(/--amount requires --reward-token/);
  });

  it('emits one JSON object on stdout with --json', async () => {
    const m = buildCommand();
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await m.command.run([], { source: 'base', destination: 'optimism', yes: true, json: true });
    expect(m.display.setJsonMode).toHaveBeenCalledWith(true);
    const payload = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(payload).toEqual({
      success: true,
      intentHash: '0xhash',
      transactionHash: '0xtx',
      sourceChainId: '8453',
      destinationChainId: '10',
      recipient: '0xrecipient',
    });
  });

  it('emits a JSON error and sets exitCode without throwing when --json fails', async () => {
    const m = buildCommand();
    m.flow.publish.mockRejectedValue(new Error('boom'));
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await m.command.run([], { source: 'base', destination: 'optimism', json: true });
    const payload = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(payload).toEqual({ success: false, error: 'boom' });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // reset for the test runner
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/cli/parse-amount.test.ts tests/cli/publish.command.test.ts`
Expected: FAIL — `parse-amount` module missing; PublishCommand constructor has no tokenResolver param.

- [ ] **Step 3: Implement**

Create `src/cli/utils/parse-amount.ts`:

```typescript
import { parseUnits } from 'viem';

import { RoutesCliError } from '@/shared/errors';

/** Converts a human-units CLI amount ("10.5") to base units using token decimals. */
export function parseAmount(raw: string, decimals: number, flag: string): bigint {
  const num = Number(raw);
  if (!Number.isFinite(num) || num <= 0) {
    throw RoutesCliError.configurationError(
      `Invalid ${flag} value "${raw}": must be a positive number.`
    );
  }
  try {
    return parseUnits(raw, decimals);
  } catch {
    throw RoutesCliError.configurationError(
      `Invalid ${flag} value "${raw}": more decimal places than the token supports (${decimals}).`
    );
  }
}
```

Rewrite `src/cli/commands/publish.command.ts`:

```typescript
import { Injectable } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';

import { ChainsService } from '@/blockchain/chains.service';
import { getErrorMessage } from '@/commons/utils/error-handler';
import { serialize } from '@/commons/utils/serialize';
import { RoutesCliError } from '@/shared/errors';
import { ChainConfig } from '@/shared/types';

import { DisplayService } from '../services/display.service';
import {
  IntentPublishFlow,
  PublishFlowOptions,
  PublishFlowOverrides,
  PublishFlowResult,
} from '../services/intent-publish-flow.service';
import { PromptService } from '../services/prompt.service';
import { TokenResolverService } from '../services/token-resolver.service';
import { parseAmount } from '../utils/parse-amount';

interface PublishOptions extends PublishFlowOptions {
  source?: string;
  destination?: string;
  routeToken?: string;
  rewardToken?: string;
  routeTokenDecimals?: number;
  rewardTokenDecimals?: number;
  amount?: string;
  routeAmount?: string;
  json?: boolean;
}

@Injectable()
@Command({ name: 'publish', description: 'Publish an intent to the blockchain' })
export class PublishCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly prompt: PromptService,
    private readonly display: DisplayService,
    private readonly flow: IntentPublishFlow,
    private readonly tokenResolver: TokenResolverService
  ) {
    super();
  }

  async run(_params: string[], options: PublishOptions): Promise<void> {
    const jsonMode = options.json === true;
    if (jsonMode) this.display.setJsonMode(true);

    try {
      this.display.title('🎨 Interactive Intent Publishing');

      const allChains = this.chains.listChains();
      const sourceChain = options.source
        ? this.chains.resolveChain(options.source)
        : await this.prompt.selectChain(allChains, 'Select source chain:', '--source <chain>');

      const destChain = options.destination
        ? this.chains.resolveChain(options.destination)
        : await this.prompt.selectChain(
            allChains.filter(c => c.id !== sourceChain.id),
            'Select destination chain:',
            '--destination <chain>'
          );

      const overrides = this.buildOverrides(options, sourceChain, destChain);
      const outcome = await this.flow.publish({ sourceChain, destChain, options, overrides });

      if (jsonMode) this.emitJson(outcome);
    } catch (error) {
      if (jsonMode) {
        process.stdout.write(`${serialize({ success: false, error: getErrorMessage(error) })}\n`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  }

  private buildOverrides(
    options: PublishOptions,
    sourceChain: ChainConfig,
    destChain: ChainConfig
  ): PublishFlowOverrides {
    const routeToken = options.routeToken
      ? this.tokenResolver.resolve(options.routeToken, destChain, {
          decimals: options.routeTokenDecimals,
          decimalsFlag: '--route-token-decimals',
        })
      : undefined;

    const rewardToken = options.rewardToken
      ? this.tokenResolver.resolve(options.rewardToken, sourceChain, {
          decimals: options.rewardTokenDecimals,
          decimalsFlag: '--reward-token-decimals',
        })
      : undefined;

    if (options.amount !== undefined && !rewardToken) {
      throw RoutesCliError.configurationError(
        '--amount requires --reward-token (its decimals convert the value to base units).'
      );
    }
    if (options.routeAmount !== undefined && !routeToken) {
      throw RoutesCliError.configurationError(
        '--route-amount requires --route-token (its decimals convert the value to base units).'
      );
    }

    return {
      ...(routeToken && { routeToken }),
      ...(rewardToken && { rewardToken }),
      ...(options.amount !== undefined &&
        rewardToken && { rewardAmount: parseAmount(options.amount, rewardToken.decimals, '--amount') }),
      ...(options.routeAmount !== undefined &&
        routeToken && {
          routeAmount: parseAmount(options.routeAmount, routeToken.decimals, '--route-amount'),
        }),
    };
  }

  private emitJson(outcome: PublishFlowResult): void {
    process.stdout.write(
      `${serialize({
        success: true,
        ...(outcome.dryRun && { dryRun: true }),
        ...(outcome.result?.intentHash && { intentHash: outcome.result.intentHash }),
        ...(outcome.result?.transactionHash && { transactionHash: outcome.result.transactionHash }),
        ...(outcome.result?.vaultAddress && { vaultAddress: outcome.result.vaultAddress }),
        sourceChainId: outcome.sourceChainId,
        destinationChainId: outcome.destinationChainId,
        recipient: outcome.recipient,
      })}\n`
    );
  }

  @Option({ flags: '-s, --source <chain>', description: 'Source chain name or ID' })
  parseSource(val: string): string {
    return val;
  }

  @Option({ flags: '-d, --destination <chain>', description: 'Destination chain name or ID' })
  parseDestination(val: string): string {
    return val;
  }

  @Option({
    flags: '--route-token <symbolOrAddress>',
    description: 'Token delivered on the destination chain (symbol from `tokens`, or raw address)',
  })
  parseRouteToken(val: string): string {
    return val;
  }

  @Option({
    flags: '--reward-token <symbolOrAddress>',
    description: 'Token paid on the source chain (symbol from `tokens`, or raw address)',
  })
  parseRewardToken(val: string): string {
    return val;
  }

  @Option({
    flags: '--route-token-decimals <n>',
    description: 'Token decimals; required when --route-token is a raw address',
  })
  parseRouteTokenDecimals(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--reward-token-decimals <n>',
    description: 'Token decimals; required when --reward-token is a raw address',
  })
  parseRewardTokenDecimals(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--amount <value>',
    description: 'Reward amount in human units, e.g. "5" (requires --reward-token)',
  })
  parseAmountFlag(val: string): string {
    return val;
  }

  @Option({
    flags: '--route-amount <value>',
    description: 'Route amount in human units for the quote-failure fallback (requires --route-token)',
  })
  parseRouteAmount(val: string): string {
    return val;
  }

  @Option({ flags: '-k, --private-key <key>', description: 'EVM private key (overrides env)' })
  parsePrivateKey(val: string): string {
    return val;
  }

  @Option({ flags: '--private-key-tvm <key>', description: 'TVM private key (overrides env)' })
  parsePrivateKeyTvm(val: string): string {
    return val;
  }

  @Option({ flags: '--private-key-svm <key>', description: 'SVM private key (overrides env)' })
  parsePrivateKeySvm(val: string): string {
    return val;
  }

  @Option({ flags: '--recipient <address>', description: 'Recipient address on destination chain' })
  parseRecipient(val: string): string {
    return val;
  }

  @Option({
    flags: '--portal-address <address>',
    description: 'Portal contract address on the source chain',
  })
  parsePortalAddress(val: string): string {
    return val;
  }

  @Option({
    flags: '--prover-address <address>',
    description: 'Prover contract address on the source chain',
  })
  parseProverAddress(val: string): string {
    return val;
  }

  @Option({
    flags: '--prover-type <name>',
    description: "Prover type to use (e.g. 'LayerZero', 'Hyperlane')",
  })
  parseProverType(val: string): string {
    return val;
  }

  @Option({ flags: '--dry-run', description: 'Validate and build everything without broadcasting' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-y, --yes', description: 'Skip the confirmation prompt' })
  parseYes(): boolean {
    return true;
  }

  @Option({
    flags: '--json',
    description: 'Machine-readable output: one JSON object on stdout, human logs on stderr',
  })
  parseJson(): boolean {
    return true;
  }

  @Option({ flags: '-w, --watch', description: 'Watch for fulfillment after publishing' })
  parseWatch(): boolean {
    return true;
  }
}
```

(Note: `--rpc` and its `parseRpc` method are gone; the `rpc` field is removed from `PublishOptions`.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/cli/parse-amount.test.ts tests/cli/publish.command.test.ts` — Expected: PASS.
Run: `pnpm test:unit && pnpm lint` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/cli/commands/publish.command.ts src/cli/utils/parse-amount.ts tests/cli/publish.command.test.ts tests/cli/parse-amount.test.ts
git commit -m "feat: complete non-interactive publish flag surface with --json output, drop dead --rpc"
```

---

### Task 6: Integration tests — spawned CLI, no TTY

**Files:**
- Test: `tests/integration/publish-non-interactive.test.ts` (new)

**Interfaces:**
- Consumes: the full CLI via `ts-node` (same invocation as the `dev` script). Runs under the main jest config (`tests/integration` is included; only `tests/e2e/` is ignored). Offline by design: `SOLVER_URL=http://127.0.0.1:9` makes the quote fail fast, exercising the manual fallback; `--dry-run` exits before any signing/broadcast, so no RPC is touched.

- [ ] **Step 1: Write the failing test**

Create `tests/integration/publish-non-interactive.test.ts`:

```typescript
import { spawnSync, SpawnSyncReturns } from 'child_process';
import * as path from 'path';

const REPO_ROOT = path.resolve(__dirname, '../..');
// Well-known public anvil dev key (account 0) — already used across this repo's tests.
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const PORTAL = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97';

const FULL_FLAGS = [
  '--source',
  'base',
  '--destination',
  'optimism',
  '--reward-token',
  'USDC',
  '--route-token',
  'USDC',
  '--amount',
  '1',
  '--route-amount',
  '1',
  '--recipient',
  RECIPIENT,
  '--portal-address',
  PORTAL,
  '--dry-run',
];

function runCli(args: string[]): SpawnSyncReturns<string> {
  return spawnSync(
    'npx',
    ['ts-node', '--transpile-only', '-r', 'tsconfig-paths/register', 'src/main.ts', 'publish', ...args],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      input: '', // piped stdin → not a TTY
      timeout: 120_000,
      env: {
        ...process.env,
        SOLVER_URL: 'http://127.0.0.1:9', // unroutable → quote fails fast → manual fallback
        EVM_PRIVATE_KEY: TEST_PRIVATE_KEY,
      },
    }
  );
}

describe('publish non-interactive (spawned CLI, no TTY)', () => {
  jest.setTimeout(180_000);

  it('fully-specified --dry-run --json exits 0 with parseable JSON on stdout', () => {
    const res = runCli([...FULL_FLAGS, '--json']);
    expect(res.status).toBe(0);
    const payload = JSON.parse(res.stdout.trim()) as Record<string, unknown>;
    expect(payload.success).toBe(true);
    expect(payload.dryRun).toBe(true);
    expect(payload.transactionHash).toBeUndefined();
    expect(payload.sourceChainId).toBe('8453');
    expect(payload.destinationChainId).toBe('10');
  });

  it('missing --reward-token exits non-zero and names the flag', () => {
    const args = FULL_FLAGS.filter(
      (a, i) => !(a === '--reward-token' || FULL_FLAGS[i - 1] === '--reward-token')
    ).filter((a, i, arr) => !(a === '--amount' || arr[i - 1] === '--amount'));
    const res = runCli(args);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('--reward-token');
  });

  it('rejects the removed --rpc flag', () => {
    const res = runCli([...FULL_FLAGS, '--rpc', 'http://localhost:8545']);
    expect(res.status).not.toBe(0);
    expect(`${res.stderr}${res.stdout}`).toContain('rpc');
  });
});
```

- [ ] **Step 2: Run test to verify current behavior fails it**

Run: `npx jest tests/integration/publish-non-interactive.test.ts`
Expected with Tasks 1–5 done: PASS. If run before them: FAIL/hang — which is the bug this whole plan fixes. (This task lands after 1–5; the test is still written first within the task and run to see it green — its "red" was the pre-plan behavior.)

- [ ] **Step 3: Debug any failures**

Common issues: the quote-failure fallback prompting despite flags (check `--route-amount`/`--portal-address` wiring), stdout polluted by a stray `console.log` in JSON mode (re-sweep `src/cli` with `rg -n "console.log" src/cli/`), or ts-node startup exceeding the timeout (raise `timeout` to 180_000).

- [ ] **Step 4: Run the full suites**

Run: `pnpm test:unit && npx jest tests/integration/` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/publish-non-interactive.test.ts
git commit -m "test: spawned-CLI integration coverage for non-interactive publish"
```

---

### Task 7: Repo skill — `.claude/skills/routes-cli/SKILL.md`

**Files:**
- Create: `.claude/skills/routes-cli/SKILL.md`

**Interfaces:**
- Consumes: the exact flag surface shipped in Task 5 and error messages from Task 1. The recipe in the skill is the same command Task 6's first test runs (minus `--dry-run`), keeping docs and verification aligned.

- [ ] **Step 1: Create `.claude/skills/routes-cli/SKILL.md` with exactly this content**

```markdown
---
name: routes-cli
description: Use when publishing cross-chain intents, checking intent status, or exploring supported chains/tokens with the Eco routes CLI. Covers fully non-interactive publishing (flags, --yes, --json), discovery commands, and error recovery. Triggers: publish intent, cross-chain intent, routes CLI, intent status.
---

# routes-cli — Publishing Cross-Chain Intents

CLI for publishing cross-chain intents on EVM, TVM (Tron), and SVM (Solana) chains.

## Setup

```bash
pnpm install
pnpm dev <command>     # ts-node, no build needed
```

Required env (`.env`): `EVM_PRIVATE_KEY`, `TVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY` — only for
the chain types you touch. NEVER print these values or echo them into logs or commands.

Optional env: `SOLVER_URL` (quote endpoint override), `QUOTES_PREPROD=1` (preprod quotes),
`NODE_CHAINS_ENV=development` (testnet chains), `DEBUG=1` (stack traces).

## Discover valid values first

```bash
pnpm dev chains     # chain names and IDs
pnpm dev tokens     # token symbols per chain
```

## Publish non-interactively (the recipe)

```bash
pnpm dev publish -s base -d optimism \
  --reward-token USDC --route-token USDC --amount 5 \
  --recipient 0xYourRecipient -y --json
```

Validate safely first by adding `--dry-run` (builds everything, signs and broadcasts nothing).

| Flag | Meaning |
|---|---|
| `-s, --source` / `-d, --destination <chain>` | chain name or ID (see `chains`) |
| `--reward-token <symbol\|address>` | token you pay with on the source chain |
| `--route-token <symbol\|address>` | token delivered on the destination chain |
| `--amount <value>` | reward amount in human units (`5` = 5 USDC); requires `--reward-token` |
| `--recipient <address>` | destination-chain recipient; with `-y` defaults to your derived address |
| `-y, --yes` | skip confirmation (required for a non-interactive publish) |
| `--json` | one JSON object on stdout; human logs on stderr |
| `--dry-run` | validate without broadcasting (exits before confirmation) |
| `--route-amount <value>` | only needed when the quote service is down (manual fallback); requires `--route-token` |
| `--reward-token-decimals` / `--route-token-decimals <n>` | required when the token flag is a raw address |
| `--portal-address` / `--prover-address` / `--prover-type <v>` | manual overrides; normally supplied by the quote |
| `-k, --private-key <key>` (`--private-key-tvm`, `--private-key-svm`) | override env keys — prefer env vars |
| `-w, --watch` | wait for fulfillment after publishing (EVM destinations only) |

## Parse the output

stdout with `--json` is exactly one JSON object (BigInts as strings):

```json
{"success": true, "intentHash": "0x…", "transactionHash": "0x…",
 "sourceChainId": "8453", "destinationChainId": "10", "recipient": "0x…"}
```

Failure: `{"success": false, "error": "…"}` with a non-zero exit code.
Dry run: `"dryRun": true` and no hashes.

## After publishing

```bash
pnpm dev status <intentHash> --chain optimism
```

## Errors → fixes

Any `X not specified. Pass --flag when running non-interactively.` → add that exact flag.

| Symptom | Fix |
|---|---|
| `Reward token not specified` | add `--reward-token USDC` (and `--amount`) |
| `Confirmation not specified. Pass --yes` | add `-y` |
| `Quote failed … falling back` then an amount error | add `--route-amount <value>` (and `--portal-address` if prompted for a portal) |
| `Token "X" is neither a known symbol…` | run `pnpm dev tokens`, or pass a raw address plus the matching `-decimals` flag |
| `--amount requires --reward-token` | pass both flags together |
| `No private key configured for EVM` | set `EVM_PRIVATE_KEY` in `.env` — never paste keys into the command line |
```

- [ ] **Step 2: Verify the recipe against reality**

Run the skill's dry-run variant end-to-end (offline):

```bash
SOLVER_URL=http://127.0.0.1:9 EVM_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
pnpm dev publish -s base -d optimism --reward-token USDC --route-token USDC \
  --amount 1 --route-amount 1 --recipient 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 \
  --portal-address 0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97 --dry-run --json < /dev/null
```

Expected: exit 0, one parseable JSON line on stdout with `"dryRun":true`.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/routes-cli/SKILL.md
git commit -m "docs: add routes-cli skill for non-interactive agent usage"
```

---

### Task 8: Global pointer skill (user-local, NOT committed)

**Files:**
- Create: `~/.claude/skills/routes-cli/SKILL.md` (outside the repo — never `git add` this)

- [ ] **Step 1: Create `~/.claude/skills/routes-cli/SKILL.md` with exactly this content**

```markdown
---
name: routes-cli
description: Use when publishing cross-chain intents, checking intent status, or working with the Eco routes CLI from any directory. Triggers: publish intent, cross-chain intent, routes CLI, intent status.
---

# routes-cli (pointer)

The CLI lives at `~/dev/eco/routes-cli`. The authoritative usage guide is that repo's
`.claude/skills/routes-cli/SKILL.md` — read it before running commands:

```bash
cat ~/dev/eco/routes-cli/.claude/skills/routes-cli/SKILL.md
```

Run commands from that directory with `pnpm dev <command>` (ts-node — no build needed).
If dependencies are missing, run `pnpm install` there first.
```

- [ ] **Step 2: Verify**

Run: `cat ~/.claude/skills/routes-cli/SKILL.md` — content matches. Confirm `git status` in the repo shows no new files from this task.

---

## Final verification (after all tasks)

- [ ] `pnpm test:unit && npx jest tests/integration/ && pnpm lint && pnpm build` all pass.
- [ ] Re-run the Task 7 Step 2 offline dry-run command — exit 0, valid JSON.
- [ ] `rg -n "rpc" src/cli/commands/publish.command.ts` → no `--rpc` option remains.
- [ ] Spec cross-check: every section of `docs/superpowers/specs/2026-07-27-claude-friendly-publish-design.md` maps to a shipped task.
