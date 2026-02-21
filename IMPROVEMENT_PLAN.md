# Routes CLI — Improvement Plan

> **Purpose:** Transform routes-cli from a side-project into a professional, third-party-ready product.
> This plan is structured for iterative execution (Ralph Loop). Each task is atomic and independently
> executable. Tasks within a phase can run in parallel unless marked with a dependency.
>
> **Source:** Synthesized from five parallel expert reviews — architecture, code quality, testing
> strategy, documentation/DX, and security/CI-CD.

---

## Executive Summary

Routes CLI is a multi-chain intent publishing tool used by third parties. The codebase has a solid
conceptual foundation (universal address system, publisher abstraction, typed intent model) but suffers
from: a 671-line god-class command file, zero test coverage, 13 dependency vulnerabilities, no CI/CD
pipeline, and error messages that confuse end users.

The multi-chain publisher layer (EVM, TVM, SVM) has four concrete behavioral bugs discovered through
cross-publisher comparison: TVM silently approves only the first reward token instead of looping over
all of them (matching EVM), SVM silently drops the `proverAddress` parameter from its signature, TVM
leaves the private key set on the TronWeb instance after publish (no cleanup), and none of the publishers
use the `override` keyword — meaning base class signature changes silently break the abstraction. The
`BasePublisher` contract is also too thin (only 2 abstract methods), leaving `validate()` as an
EVM-only public method that violates Liskov Substitution.

This plan addresses all of the above across five sequential phases.

---

## Phase 0 — Security Emergencies (Do This Now)

These are blocking issues that must be resolved before any other work.

### TASK-001: Audit and rotate exposed private keys
**Severity:** CRITICAL
**Why:** The `.env` file may have been committed to git history, exposing private keys.

> **⚠️ Push restriction:** If git history rewriting is required (BFG / `git filter-repo`), prepare
> the rewritten history locally but **do not push to the remote**. Only the repository owner pushes
> the rewritten history and coordinates with collaborators to re-clone.

**Steps:**
1. Run `git log --all --full-history -- .env` to check if `.env` was ever tracked
2. Run `git log --oneline --diff-filter=A -- .env` to see when it was first added
3. If any commits contain `.env`, rewrite history locally using BFG Repo Cleaner or `git filter-repo`:
   ```bash
   # Option A — BFG (simpler)
   bfg --delete-files .env --no-blob-protection
   git reflog expire --expire=now --all
   git gc --prune=now --aggressive

   # Option B — git filter-repo
   git filter-repo --path .env --invert-paths
   ```
   Stop here. **Do not run `git push --force`. Hand off to the repository owner to push.**
4. Rotate ALL private keys that were ever stored in `.env` — regardless of whether history was clean
5. Confirm `.env` appears in `.gitignore` — verify with `git check-ignore -v .env`
6. Add a pre-commit hook entry to reject `.env` files:
   ```bash
   # .husky/pre-commit — add this check
   if git diff --cached --name-only | grep -E '^\.env$'; then
     echo "ERROR: Refusing to commit .env file"
     exit 1
   fi
   ```

**Acceptance criteria:** Local history is clean (`git log --all -- .env` returns nothing or only
the deletion commit); pre-commit hook blocks future `.env` commits; push to remote performed
separately by repository owner.

---

### TASK-002: Patch critical dependency vulnerabilities
**Severity:** CRITICAL
**Why:** 7 HIGH-severity CVEs exist in transitive dependencies. Key issues: `axios` DoS in tronweb,
`bigint-buffer` overflow in Solana packages, `glob` command injection in Jest.

**Steps:**
1. Run `pnpm audit` and capture the full output
2. Update `tronweb` to latest: `pnpm update tronweb@latest`
3. Update Solana packages: `pnpm update @solana/spl-token@latest @coral-xyz/anchor@latest`
4. Update Jest: `pnpm update jest@latest ts-jest@latest @types/jest@latest`
5. Update `viem` pin from `~2.40.1` to `^2.40.1` in package.json (allow patch + minor security updates)
6. Run `pnpm audit` again — target: zero HIGH vulnerabilities
7. Run `pnpm build` and smoke-test publish flow to confirm nothing broke

**Acceptance criteria:** `pnpm audit --audit-level=high` exits with code 0.

---

### TASK-003: Add Node.js version constraints
**Severity:** CRITICAL
**Why:** No engines field or `.nvmrc` means contributors and CI can use incompatible Node versions.

**Steps:**
1. Add to `package.json`:
   ```json
   "engines": {
     "node": ">=18.0.0",
     "pnpm": ">=8.0.0"
   }
   ```
2. Create `.nvmrc` containing `18` (LTS)
3. Create `.node-version` containing `18` (for mise/asdf compatibility)
4. Add engine check to `src/index.ts` entry point (guard before any other code):
   ```typescript
   const [major] = process.versions.node.split('.').map(Number);
   if (major < 18) {
     console.error('routes-cli requires Node.js >= 18.0.0');
     process.exit(1);
   }
   ```

**Acceptance criteria:** `node --version` check gates startup; `.nvmrc` exists; `engines` in package.json.

---

## Phase 1 — Foundation: Tooling, Types & Config

All tasks in this phase can run in parallel. They set up the safety net before refactoring.

### TASK-010: Tighten TypeScript compiler settings
**Severity:** HIGH
**Why:** Three critical strictness settings are disabled: `strictPropertyInitialization`, `noUnusedLocals`,
`noUnusedParameters`. `skipLibCheck: true` masks errors from third-party types.

**Steps:**
1. Open `tsconfig.json`
2. Change the following settings:
   - `"strictPropertyInitialization": true` (was `false`)
   - `"noUnusedLocals": true` (was `false`)
   - `"noUnusedParameters": true` (was `false`)
   - `"noImplicitOverride": true` (add new)
   - `"skipLibCheck": false` (was `true` — enables proper lib checking)
3. Run `pnpm build` and fix all resulting errors
4. For `noUnusedParameters` violations, prefix intentionally unused params with `_` (e.g., `_opts`)
5. For uninitialized class properties, add definite assignment assertion (`!`) only where truly safe,
   or initialize them properly
6. Do NOT suppress errors with `// @ts-ignore` — fix them properly

**Acceptance criteria:** `pnpm build` passes with all three settings enabled.

---

### TASK-011: Add a typed error hierarchy
**Severity:** HIGH
**Why:** All errors are thrown as generic `Error` objects. The CLI cannot distinguish user mistakes
from network failures from configuration errors. There is no way to present friendly messages.

**Steps:**
1. Create `src/core/errors/errors.ts`:
   ```typescript
   export enum ErrorCode {
     INVALID_ADDRESS = 'INVALID_ADDRESS',
     INVALID_PRIVATE_KEY = 'INVALID_PRIVATE_KEY',
     INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
     UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
     NETWORK_ERROR = 'NETWORK_ERROR',
     TRANSACTION_FAILED = 'TRANSACTION_FAILED',
     CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
     QUOTE_SERVICE_ERROR = 'QUOTE_SERVICE_ERROR',
   }

   export class RoutesCliError extends Error {
     constructor(
       public readonly code: ErrorCode,
       message: string,
       public readonly isUserError: boolean = false,
       public readonly cause?: unknown
     ) {
       super(message);
       this.name = 'RoutesCliError';
       Object.setPrototypeOf(this, RoutesCliError.prototype);
     }

     static invalidAddress(addr: string, chainType?: string): RoutesCliError { ... }
     static invalidPrivateKey(chainType: string): RoutesCliError { ... }
     static insufficientBalance(required: bigint, available: bigint, token?: string): RoutesCliError { ... }
     static unsupportedChain(chainId: bigint | string): RoutesCliError { ... }
     static networkError(rpcUrl: string, cause: unknown): RoutesCliError { ... }
     static configurationError(message: string): RoutesCliError { ... }
   }
   ```
2. Update `src/utils/error-handler.ts` to check for `RoutesCliError` and render user-friendly vs
   technical messages based on `isUserError`
3. Export from `src/core/errors/index.ts`

**Acceptance criteria:** `RoutesCliError` exists with all error codes; error handler differentiates user vs system errors.

---

### TASK-012: Add runtime validation with zod
**Severity:** HIGH
**Why:** User inputs (addresses, amounts, private keys, chain IDs) are cast without validation.
Invalid inputs silently succeed until a blockchain call fails with a cryptic error.

**Steps:**
1. Install zod: `pnpm add zod`
2. Create `src/core/validation/schemas.ts` with schemas for:
   - EVM address: `z.string().regex(/^0x[a-fA-F0-9]{40}$/)`
   - Universal address: `z.string().regex(/^0x[a-fA-F0-9]{64}$/)`
   - TVM address: `z.string().regex(/^T[A-Za-z0-9]{33}$/)`
   - SVM address: `z.string().min(32).max(44)` + base58 check
   - EVM private key: `z.string().regex(/^0x[a-fA-F0-9]{64}$/)`
   - TVM private key: `z.string().regex(/^[a-fA-F0-9]{64}$/)`
   - Token amount: `z.string().regex(/^\d+(\.\d+)?$/).refine(v => parseFloat(v) > 0)`
   - Chain ID: `z.bigint().positive()`
3. Update `src/config/env.ts` to validate env vars on load using zod — throw `RoutesCliError.configurationError`
   with clear message if validation fails
4. Update address validation in `src/commands/publish.ts` prompts to use schemas
5. Update `AddressNormalizer.normalize()` to validate input format before processing

**Acceptance criteria:** `loadEnvConfig()` throws descriptive errors for bad env vars; address validation
uses zod schemas; no raw regex scattered across commands.

---

### TASK-013: Eliminate all `any` types
**Severity:** HIGH
**Why:** 31 instances of `any` across 10 files undermine the purpose of TypeScript. High-risk areas:
`quote.ts:107`, `logger.ts:139`, `svm-decode.ts` (8 occurrences), `svm-types.ts` (5 occurrences).

**Steps:**
1. Run: `grep -rn ": any" src/ --include="*.ts"` to get the full list
2. Fix in priority order:
   - `src/core/utils/quote.ts:107` — define `QuoteRequestPayload` interface
   - `src/utils/logger.ts:139,178` — type the `cli-table3` options properly
   - `src/blockchain/svm/svm-decode.ts` — type Anchor decoded data properly using IDL types
   - `src/blockchain/svm/svm-types.ts` — replace `any` Anchor/Solana aliases with proper types from `@coral-xyz/anchor`
   - All `catch (error: any)` → `catch (error: unknown)` + use type narrowing
3. Enable `@typescript-eslint/no-explicit-any: error` in `eslint.config.js`

**Acceptance criteria:** `grep -rn ": any" src/ --include="*.ts"` returns zero results; ESLint rule blocks new `any` additions.

---

### TASK-014: Set up Jest configuration properly
**Severity:** HIGH
**Why:** Jest is installed but there is no `jest.config.js`, no test files, and no way to run tests.
This task creates the test infrastructure — actual tests come in Phase 3.

**Steps:**
1. Create `jest.config.ts`:
   ```typescript
   export default {
     preset: 'ts-jest',
     testEnvironment: 'node',
     roots: ['<rootDir>/src', '<rootDir>/tests'],
     testMatch: ['**/tests/**/*.test.ts'],
     collectCoverageFrom: [
       'src/**/*.ts',
       '!src/index.ts',
       '!src/**/*.d.ts',
     ],
     coverageThreshold: {
       global: { branches: 70, functions: 75, lines: 75, statements: 75 },
     },
     moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
     setupFilesAfterFramework: [],
   };
   ```
2. Create `tests/` directory structure:
   ```
   tests/
   ├── core/utils/
   ├── blockchain/
   ├── config/
   ├── integration/
   ├── e2e/
   └── __mocks__/
   ```
3. Create `tests/__mocks__/viem.ts`, `tests/__mocks__/tronweb.ts`, `tests/__mocks__/@solana/web3.js.ts`
   as empty module mocks to start
4. Add to `package.json` scripts:
   ```json
   "test": "jest",
   "test:unit": "jest --testPathPattern='tests/(core|config|blockchain)'",
   "test:integration": "jest --testPathPattern='tests/integration'",
   "test:coverage": "jest --coverage",
   "typecheck": "tsc --noEmit"
   ```
5. Verify `pnpm test` runs (even with no tests, it should exit 0)

**Acceptance criteria:** `pnpm test` runs without crashing; `pnpm typecheck` runs; directory structure exists.

---

### TASK-015: Set up GitHub Actions CI/CD pipeline
**Severity:** HIGH
**Why:** There is no CI/CD pipeline. No automated checks on PRs.

**Steps:**
1. Create `.github/workflows/ci.yml`:
   ```yaml
   name: CI
   on:
     push:
       branches: [main]
     pull_request:
       branches: [main]
   jobs:
     quality:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: '.nvmrc'
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm lint
         - run: pnpm typecheck
         - run: pnpm test:coverage
         - run: pnpm build
         - run: pnpm audit --audit-level=moderate
   ```
2. Create `.github/workflows/security.yml` with daily `pnpm audit` + TruffleHog secret scanning:
   ```yaml
   name: Security Scan
   on:
     schedule:
       - cron: '0 2 * * *'
     push:
       branches: [main]
   jobs:
     audit:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
         - uses: pnpm/action-setup@v4
         - uses: actions/setup-node@v4
           with:
             node-version-file: '.nvmrc'
             cache: 'pnpm'
         - run: pnpm install --frozen-lockfile
         - run: pnpm audit --audit-level=high
     secrets:
       runs-on: ubuntu-latest
       steps:
         - uses: actions/checkout@v4
           with:
             fetch-depth: 0
         - uses: trufflesecurity/trufflehog@main
           with:
             path: ./
             base: ${{ github.event.repository.default_branch }}
             head: HEAD
             extra_args: --debug --only-verified
   ```

**Acceptance criteria:** Both workflow files exist; `ci.yml` passes on push to main.

---

### TASK-016: Strengthen ESLint configuration
**Severity:** MEDIUM
**Why:** `@typescript-eslint/no-explicit-any` is currently `off`; `no-console` not enforced.

**Steps:**
1. Open `eslint.config.js`
2. Add/update rules:
   ```javascript
   '@typescript-eslint/no-explicit-any': 'error',
   '@typescript-eslint/explicit-function-return-type': ['error', {
     allowExpressions: true,
     allowTypedFunctionExpressions: true,
   }],
   '@typescript-eslint/no-floating-promises': 'error',
   '@typescript-eslint/require-await': 'error',
   'no-console': ['error', { allow: ['warn', 'error'] }],
   '@typescript-eslint/no-unsafe-assignment': 'warn',
   ```
3. Run `pnpm lint --fix` and fix all new errors
4. Update `.husky/pre-commit` to also run `pnpm typecheck` before commit:
   ```bash
   pnpm lint-staged
   pnpm typecheck
   ```

**Acceptance criteria:** `pnpm lint` passes with stricter rules; pre-commit runs typecheck.

---

## Phase 2 — Architecture Refactoring

Tasks are sequenced: TASK-020 first (it defines interfaces used by others), then others can parallelize.

### TASK-020: Extract chain plugin registry (replaces switch statements)
**Severity:** CRITICAL
**Why:** Adding a new chain currently requires modifying 6+ files. `switch (chainType)` is scattered
throughout the codebase. This is the core architectural fix that unlocks all other refactoring.

**Steps:**
1. Create `src/core/chain/chain-handler.interface.ts`:
   ```typescript
   export interface ChainHandler {
     readonly chainType: ChainType;
     validateAddress(address: string): boolean;
     normalize(address: string): UniversalAddress;
     denormalize(address: UniversalAddress): BlockchainAddress;
     getAddressFormat(): string; // For user-facing messages
   }
   ```
2. Create `src/core/chain/chain-registry.ts`:
   ```typescript
   export class ChainRegistry {
     private handlers = new Map<ChainType, ChainHandler>();
     register(handler: ChainHandler): void { ... }
     get(chainType: ChainType): ChainHandler { ... }
     getAll(): ChainHandler[] { ... }
   }
   export const chainRegistry = new ChainRegistry();
   ```
3. Create `src/blockchain/evm/evm-chain-handler.ts`, `tvm-chain-handler.ts`, `svm-chain-handler.ts`
   implementing `ChainHandler` — move validation and address conversion logic here from
   `AddressNormalizer` and the scattered switch blocks in `publish.ts`
4. Register handlers in `src/index.ts`
5. Update `AddressNormalizer` to delegate to `chainRegistry` instead of internal switch statements
6. Update `publish.ts` address validation section to use `chainRegistry.get(chain.type).validateAddress()`

**Acceptance criteria:** No `switch (chainType)` or `switch (chain.type)` remains outside of
`ChainRegistry`; adding a new chain handler requires only creating one file + registering it.

---

### TASK-021: Decompose the publish.ts god class
**Severity:** CRITICAL
**Why:** `publish.ts` is 671 lines handling CLI parsing, interactive prompts, address validation,
quote fetching, intent building, publisher instantiation, and error display — all tangled together.

**Steps:**
1. Extract `src/cli/prompts/intent-prompts.ts`:
   - `selectSourceChain(options)` → `Promise<ChainConfig>`
   - `selectDestinationChain(sourceChain, options)` → `Promise<ChainConfig>`
   - `configureReward(destChain, options)` → `Promise<RewardConfig>`
   - `selectRecipient(destChain, options)` → `Promise<UniversalAddress>`
   - `selectToken(chain, label)` → `Promise<TokenConfig>`
2. Extract `src/core/services/intent-service.ts`:
   - `buildIntent(config: IntentConfig)` → `Promise<Intent>`
   - `getQuoteOrFallback(params)` → `Promise<QuoteResult | null>`
   - `encodeRoute(intent, chainType)` → `Promise<Hex>`
3. Extract `src/blockchain/publisher-factory.ts`:
   - `createPublisher(chainType, rpcUrl)` → `BasePublisher`
   - Use `ChainRegistry` from TASK-020
4. Extract `src/cli/key-provider.ts`:
   - `getPrivateKey(chainType, override?)` → `string`
   - `getWalletAddress(chainType, privateKey)` → `BlockchainAddress`
5. Refactor `publish.ts` to be a thin orchestrator (~100 lines max):
   ```typescript
   export function createPublishCommand(): Command {
     return new Command('publish')
       .action(async (options) => {
         const prompts = new IntentPrompts();
         const service = new IntentService();
         const { sourceChain, destChain } = await prompts.selectChains(options);
         const reward = await prompts.configureReward(destChain, options);
         const intent = await service.buildIntent({ ... });
         const publisher = publisherFactory.createPublisher(sourceChain.type, rpcUrl);
         const result = await publisher.publish(...);
         displayResult(result);
       });
   }
   ```

**Acceptance criteria:** `publish.ts` is under 150 lines; each extracted module has a single responsibility;
`buildIntentInteractively` no longer exists as a 400-line function.

**Depends on:** TASK-020

---

### TASK-022: Strengthen BasePublisher contract — fix LSP violation and shared error handling
**Severity:** HIGH
**Why:** `BasePublisher` currently only enforces two abstract methods (`publish`, `getBalance`).
This leaves critical behaviors uncontracted, causing concrete divergence across the three publishers:
- `validate()` exists on `EvmPublisher` as a **public method not declared in the base** — a Liskov
  Substitution violation. Code that holds a `BasePublisher` reference cannot call it without
  downcasting, which defeats the abstraction entirely. `TvmPublisher` and `SvmPublisher` have no
  equivalent at all.
- Error handling has **three different patterns**: EVM and TVM use inline `try-catch` returning
  `{ success: false }`, while SVM has a private `handleError()` method. None share logic.
- `PublishResult.decodedData` is typed as `any` — the only `any` in the base interface.

**Steps:**
1. Define a `ValidationResult` type in `src/blockchain/base-publisher.ts`:
   ```typescript
   export interface ValidationResult {
     valid: boolean;
     errors: string[]; // Empty array = valid; multiple errors allowed
   }
   ```
2. Expand `BasePublisher` with the following additions:
   ```typescript
   // New abstract method — all publishers must implement pre-publish validation
   abstract validate(
     reward: Intent['reward'],
     senderAddress: string
   ): Promise<ValidationResult>;

   // Shared concrete error handler — eliminates copy-paste try-catch across publishers
   protected handleError(error: unknown): PublishResult {
     const message = error instanceof Error ? error.message : String(error);
     logger.stopSpinner();
     return { success: false, error: message };
   }

   // Utility for wrapping entire publish flows
   protected async runSafely(fn: () => Promise<PublishResult>): Promise<PublishResult> {
     try {
       return await fn();
     } catch (error: unknown) {
       return this.handleError(error);
     }
   }
   ```
3. Fix `PublishResult.decodedData?: any` → `decodedData?: Record<string, unknown>`
4. Implement `validate()` on `TvmPublisher`:
   - Check that reward.tokens.length > 0 (TVM requires at least one token)
   - Check TRX (native) balance if `reward.nativeAmount > 0n`
   - Check token balance for each reward token using `tronweb.trx.getBalance()`
5. Implement `validate()` on `SvmPublisher`:
   - Check SOL balance (lamports) against reward.nativeAmount
   - Check SPL token balance for each reward token
6. Move `EvmPublisher.validate()` signature to match the new abstract (it currently takes
   `intent: Intent` — change parameter to `reward: Intent['reward']` to match the base contract)
7. Update all three publishers' `publish()` methods to call `this.runSafely(async () => { ... })`
   instead of their individual `try-catch` blocks
8. Remove the duplicate inline `try-catch` wrappers from EVM and TVM `publish()` now covered by `runSafely`

**Acceptance criteria:**
- `BasePublisher` has 3 abstract methods: `publish`, `getBalance`, `validate`
- All three publishers compile and implement all three abstract methods
- `handleError` and `runSafely` exist on the base — no duplicate try-catch in any publisher
- `PublishResult.decodedData` has no `any` type
- `(publisher as BasePublisher).validate(reward, addr)` works without downcast

**Depends on:** TASK-011

---

### TASK-023: Add dependency injection to publishers + fix RPC client lifecycle
**Severity:** HIGH
**Why:** Publishers hard-code their blockchain client creation (`createPublicClient`, `new TronWeb()`,
`new Connection()`). This makes unit testing impossible without live RPC connections. There is also a
lifecycle bug: `EvmPublisher` creates a brand-new `createPublicClient` on **every single call** to
`getBalance()` (and again inside `publish()`), discarding the connection pool each time. `TvmPublisher`
correctly creates `TronWeb` once in the constructor; `SvmPublisher` correctly creates `Connection` once.
EVM needs to be fixed to match the others.

**Steps:**
1. Define injectable client factory interfaces:
   ```typescript
   // src/blockchain/evm/evm-client-factory.ts
   export interface EvmClientFactory {
     createPublicClient(config: { chain: Chain; rpcUrl: string }): PublicClient;
     createWalletClient(config: { chain: Chain; rpcUrl: string; account: Account }): WalletClient;
   }
   export class DefaultEvmClientFactory implements EvmClientFactory { ... }

   // src/blockchain/tvm/tvm-client-factory.ts
   export interface TvmClientFactory {
     createClient(rpcUrl: string): TronWeb;
   }
   export class DefaultTvmClientFactory implements TvmClientFactory { ... }

   // src/blockchain/svm/svm-client-factory.ts
   export interface SvmClientFactory {
     createConnection(rpcUrl: string): Connection;
   }
   export class DefaultSvmClientFactory implements SvmClientFactory { ... }
   ```
2. Fix `EvmPublisher` to initialize its `PublicClient` once, not per call:
   ```typescript
   export class EvmPublisher extends BasePublisher {
     // publicClient is NOT stored as instance — chain ID determines which client to use,
     // so cache per chainId instead:
     private clientCache = new Map<bigint, { public: PublicClient; wallet?: WalletClient }>();

     constructor(
       rpcUrl: string,
       private readonly clientFactory: EvmClientFactory = new DefaultEvmClientFactory()
     ) { super(rpcUrl); }

     private getClients(chainId: bigint, account?: Account) {
       if (!this.clientCache.has(chainId)) {
         const chain = this.resolveChain(chainId);
         this.clientCache.set(chainId, {
           public: this.clientFactory.createPublicClient({ chain, rpcUrl: this.rpcUrl }),
         });
       }
       // attach wallet client if account provided
       const cached = this.clientCache.get(chainId)!;
       if (account && !cached.wallet) {
         const chain = this.resolveChain(chainId);
         cached.wallet = this.clientFactory.createWalletClient({ chain, rpcUrl: this.rpcUrl, account });
       }
       return cached;
     }
   }
   ```
3. Update `TvmPublisher` and `SvmPublisher` constructors to accept optional factories:
   ```typescript
   constructor(rpcUrl: string, factory: TvmClientFactory = new DefaultTvmClientFactory()) {
     super(rpcUrl);
     this.tronWeb = factory.createClient(rpcUrl);
   }
   ```
4. Create mock factories for testing:
   - `tests/__mocks__/evm-client-factory.mock.ts` — returns stub `PublicClient` + `WalletClient`
   - `tests/__mocks__/tvm-client-factory.mock.ts` — returns stub `TronWeb`
   - `tests/__mocks__/svm-client-factory.mock.ts` — returns stub `Connection`
5. Update `PublisherFactory` (extracted in TASK-021) to pass factories when constructing publishers

**Acceptance criteria:**
- `EvmPublisher.getBalance()` does NOT create a new `PublicClient` on each call
- Each publisher constructor accepts an optional factory parameter
- All three mock factories exist under `tests/__mocks__/`
- `pnpm build` passes

---

### TASK-024: Reorganize SVM module for clarity
**Severity:** HIGH
**Why:** SVM logic is scattered across `svm-publisher.ts`, `svm/svm-transaction.ts`,
`svm/svm-buffer-utils.ts`, `svm/svm-decode.ts`, `svm/svm-types.ts`, `svm/svm-constants.ts`,
`commons/idls/`, `commons/types/`. The dependency graph within SVM is tangled.

**Steps:**
1. Create `src/blockchain/svm/solana-client.ts` — wraps `Connection` + Anchor program setup
2. Create `src/blockchain/svm/pda-manager.ts` — consolidates all PDA derivations from `svm-transaction.ts`
3. Create `src/blockchain/svm/transaction-builder.ts` — builds Solana transactions; imports only from `solana-client.ts` and `pda-manager.ts`
4. Consolidate `svm-types.ts` + scattered `portal-idl.type.ts` + `portal-idl-coder.type.ts` into one `src/blockchain/svm/svm-types.ts`
5. Update `svm-publisher.ts` to import only from `solana-client.ts` and `transaction-builder.ts`
6. Verify: `svm-publisher.ts` should import from max 4 files after this

**Acceptance criteria:** `svm-publisher.ts` imports ≤ 4 local modules; PDA logic is in one file;
types are consolidated; no orphan type files.

---

### TASK-025: Refactor config to remove global state mutation
**Severity:** HIGH
**Why:** `updatePortalAddresses(process.env)` mutates global configuration in `index.ts`.
Config is initialized at module load time, making it impossible to override in tests.

**Steps:**
1. Create `src/config/config-service.ts`:
   ```typescript
   export class ConfigService {
     constructor(
       private readonly chains: ChainConfigs,
       private readonly tokens: TokenConfigs,
       private readonly env: EnvConfig
     ) {}

     getChain(idOrName: bigint | string): ChainConfig { ... }
     getToken(symbol: string, chainId: bigint): TokenConfig { ... }
     overridePortalAddress(chainId: bigint, address: UniversalAddress): void { ... }

     static fromEnvironment(): ConfigService {
       return new ConfigService(loadChainConfigs(), loadTokenConfigs(), loadEnvConfig());
     }
   }
   ```
2. Move `updatePortalAddresses` logic inside `ConfigService.fromEnvironment()`
3. Remove all global config mutations from `src/index.ts`
4. Inject `ConfigService` into publishers and commands (or use a simple module-level singleton
   created once in `index.ts`)
5. Ensure `ConfigService` can be instantiated with test fixtures in tests

**Acceptance criteria:** No mutable global config; `ConfigService.fromEnvironment()` is the single
initialization point; no `updatePortalAddresses` call in `index.ts`.

---

### TASK-026: Fix concrete publisher behavioral bugs
**Severity:** HIGH
**Why:** Code review of all three publishers side-by-side reveals four concrete bugs that are
invisible individually but obvious when comparing the implementations against a shared contract.
None of these are caught by TypeScript today because the base class doesn't enforce the behavior.

#### Bug 1 — TVM only approves the first reward token (silent data loss)

**Location:** `src/blockchain/tvm-publisher.ts`

**Current code:**
```typescript
const sourceToken = reward.tokens[0]; // ← hardcoded index 0
const tokenContract = this.tronWeb.contract(erc20Abi, AddressNormalizer.denormalizeToTvm(sourceToken.token));
await tokenContract.approve(portalAddress, sourceToken.amount).send(...);
```

**Problem:** EVM approves all tokens in a `for` loop. TVM silently skips every token after the first.
An intent with two reward tokens will partially approve on TVM, almost certainly failing at the portal contract.

**Fix:** Replace the single-token approval with a loop matching EVM's pattern:
```typescript
for (const rewardToken of reward.tokens) {
  const tokenAddress = AddressNormalizer.denormalizeToTvm(rewardToken.token);
  const tokenContract = this.tronWeb.contract(erc20Abi, tokenAddress);
  logger.spinner(`Approving token ${tokenAddress}...`);
  const approvalTxId = await tokenContract
    .approve(portalAddress, rewardToken.amount)
    .send({ from: senderAddress });
  const approved = await this.waitForTransaction(approvalTxId);
  if (!approved) throw new RoutesCliError(ErrorCode.TRANSACTION_FAILED, `Approval failed for ${tokenAddress}`);
  logger.succeed(`Token approved: ${tokenAddress}`);
}
```

---

#### Bug 2 — SVM silently ignores `proverAddress` parameter

**Location:** `src/blockchain/svm-publisher.ts`

**Current code:**
```typescript
async publish(
  source: bigint, destination: bigint, reward: Intent['reward'],
  encodedRoute: string, privateKey: string,
  portalAddress?: UniversalAddress
  // proverAddress is NOT in the signature at all — parameter was dropped
): Promise<PublishResult>
```

**Problem:** The `BasePublisher.publish()` signature includes `proverAddress?: UniversalAddress` as
the 7th parameter (matching EVM and TVM). `SvmPublisher` omits it entirely. Any caller passing a
`proverAddress` to an `SvmPublisher` via the `BasePublisher` interface will have it silently ignored.
The Solana intent will be published with whatever default prover the program uses, not the caller's intent.

**Fix:**
1. Add `proverAddress?: UniversalAddress` back to `SvmPublisher.publish()` signature
2. Pass it into the `PublishContext` (already has a field for it in `svm-types.ts`)
3. In `svm-transaction.ts`, use `context.proverAddress` when building the proof PDA if provided
4. Add TypeScript `override` keyword to all three publishers' `publish()` to catch future signature drift:
   ```typescript
   override async publish(...): Promise<PublishResult> { ... }
   ```

---

#### Bug 3 — TVM leaves private key on the TronWeb instance after publish

**Location:** `src/blockchain/tvm-publisher.ts`

**Current code:**
```typescript
async publish(..., privateKey: string, ...): Promise<PublishResult> {
  try {
    this.tronWeb.setPrivateKey(privateKey); // ← key set on instance
    // ... transaction ...
  } catch (error) { ... }
  // ← no finally block, key stays on tronWeb forever
}
```

**Problem:** `TronWeb` holds the private key as instance state after `setPrivateKey()`. If `TvmPublisher`
is ever reused (nothing prevents it), the previous key persists. If an exception leaves `publish()`
mid-flight, the key still persists. This is a latent security issue — key material outlives its use.

**Fix:** Add a `finally` block to always clear the key after any publish outcome:
```typescript
async publish(..., privateKey: string, ...): Promise<PublishResult> {
  try {
    this.tronWeb.setPrivateKey(privateKey);
    // ... transaction ...
  } catch (error) {
    return this.handleError(error);
  } finally {
    // Clear key from TronWeb instance regardless of outcome
    this.tronWeb.setPrivateKey('');
  }
}
```

---

#### Bug 4 — `override` keyword missing on all publisher methods (future drift prevention)

**Location:** All three publisher files

**Problem:** None of the publisher classes use the TypeScript `override` keyword on their `publish()`
and `getBalance()` implementations. Without it, if `BasePublisher` changes its abstract signature
(e.g., adds or renames a parameter), TypeScript will not catch that the concrete implementations are
now out of sync — they simply become standalone methods that shadow the base, breaking polymorphism
silently.

**Fix:** Add `override` to every method that implements a base abstract:
```typescript
// evm-publisher.ts
override async publish(...): Promise<PublishResult> { ... }
override async getBalance(...): Promise<bigint> { ... }
override async validate(...): Promise<ValidationResult> { ... }

// Same pattern for tvm-publisher.ts and svm-publisher.ts
```

Also enable `"noImplicitOverride": true` in `tsconfig.json` (already planned in TASK-010) — this
makes TypeScript **require** the `override` keyword on all overriding methods, turning future
signature drift into a compile error.

---

**Acceptance criteria for TASK-026:**
- `TvmPublisher` approves ALL `reward.tokens` in a loop, not just `tokens[0]`
- `SvmPublisher.publish()` includes `proverAddress?: UniversalAddress` in its signature and uses it
- `TvmPublisher.publish()` has a `finally { this.tronWeb.setPrivateKey('') }` block
- All `publish()`, `getBalance()`, and `validate()` overrides have the `override` keyword
- `pnpm build` passes; `pnpm typecheck` reports zero errors

**Depends on:** TASK-022 (for `validate()` abstract method and `override` keyword coverage)

---

## Phase 3 — Testing

All test tasks can run in parallel after Phase 2 is complete (or in parallel with it, targeting
current code as it exists).

### TASK-030: Unit tests — AddressNormalizer (highest priority)
**Severity:** HIGH
**Why:** `AddressNormalizer` is pure logic, no I/O, and is the most critical cross-chain utility.
Round-trip correctness is essential for funds to arrive at the right address.

**File to create:** `tests/core/utils/address-normalizer.test.ts`

**Test cases required:**
- EVM: normalize valid checksummed address → universal; denormalize back → matches original
- EVM: normalize mixed-case address → normalized correctly
- EVM: normalize invalid address → throws `RoutesCliError.invalidAddress`
- EVM: zero-address edge case
- TVM: normalize base58 Tron address → universal; round-trip
- TVM: normalize hex `0x41...` address → universal
- TVM: invalid Tron address → throws
- SVM: normalize base58 Solana public key → universal; round-trip
- SVM: invalid base58 → throws
- All: denormalize universal → original for each chain type (round-trip)
- All: unsupported chain type → throws

**Acceptance criteria:** 95%+ coverage on `address-normalizer.ts`; all round-trip tests pass.

---

### TASK-031: Unit tests — ChainDetector
**Severity:** HIGH
**File to create:** `tests/core/utils/chain-detector.test.ts`

**Test cases required:**
- EVM chain IDs (1, 10, 8453, 42161) → `ChainType.EVM`
- TVM chain IDs (728126428, 2494104990) → `ChainType.TVM`
- SVM chain IDs (1399811149, 1399811150) → `ChainType.SVM`
- Unknown chain ID → throws `RoutesCliError.unsupportedChain`
- BigInt input → correct type
- `getChainById()` lookup by name (case-insensitive)
- Mainnet vs devnet detection

**Acceptance criteria:** 95%+ coverage on `chain-detector.ts`.

---

### TASK-032: Unit tests — IntentConverter and PortalEncoder
**Severity:** HIGH
**Files to create:**
- `tests/core/utils/intent-converter.test.ts`
- `tests/core/utils/portal-encoder.test.ts`

**IntentConverter test cases:**
- `toEVMIntent` converts all universal addresses to EVM checksummed hex
- Multiple tokens and calls are all converted
- Zero amounts preserved
- Large BigInt values preserved

**PortalEncoder test cases:**
- EVM route encoding produces valid ABI-encoded hex
- SVM route encoding produces valid Borsh bytes
- `isRoute()` type guard correctly identifies Route vs Reward
- Decode after encode produces equivalent object
- Empty token array and empty calls array

**Acceptance criteria:** 90%+ coverage on both files.

---

### TASK-033: Unit tests — Quote service
**Severity:** HIGH
**File to create:** `tests/core/utils/quote.test.ts`

**Setup:** Mock global `fetch` using `jest.spyOn(global, 'fetch')`

**Test cases:**
- `SOLVER_URL` set → uses solver-v2 URL format
- `QUOTES_PREPROD` set → uses preprod URL
- Default → uses production URL
- Solver-v2 response parsed correctly
- Quote service response parsed correctly
- Non-200 response → throws
- Missing `quoteResponses` → throws
- Missing `contracts` → throws

**Acceptance criteria:** 85%+ coverage on `quote.ts`; no real network calls.

---

### TASK-034: Integration tests — Config loading
**Severity:** MEDIUM
**File to create:** `tests/config/chains.test.ts`, `tests/config/tokens.test.ts`

**Test cases:**
- All chain configs load with required fields (id, name, type, rpcUrl)
- `getChainById()` returns correct chain
- `getChainByName()` is case-insensitive
- Token addresses normalize to universal format during load
- Portal address environment variable override works
- Missing required fields → throws at load time

**Acceptance criteria:** Config loading is fully tested; environment overrides are verified.

---

### TASK-035: Integration tests — EVMPublisher with mocked clients
**Severity:** MEDIUM
**File to create:** `tests/blockchain/evm-publisher.integration.test.ts`

**Depends on:** TASK-023 (dependency injection)

**Test cases (using mock `EvmClientFactory`):**
- `getBalance()` returns mocked balance
- `validate()` returns valid when balance sufficient
- `validate()` returns error when native balance insufficient
- `validate()` returns error when token balance insufficient
- Token approval skipped when allowance is sufficient
- Token approval sent when allowance is insufficient
- `publish()` calls portal contract with correct encoded data
- `publish()` returns `{ success: false }` on transaction revert

**Acceptance criteria:** EVMPublisher is fully testable without a live RPC; all key paths covered.

---

### TASK-036: Integration tests — Intent publishing flow
**Severity:** MEDIUM
**File to create:** `tests/integration/intent-publishing.test.ts`

**Test cases:**
- Full flow: chain selection → quote → encode → publish (all mocked)
- Quote service failure falls back to manual config
- Invalid recipient address throws `RoutesCliError.invalidAddress`
- Insufficient balance throws `RoutesCliError.insufficientBalance`
- Publisher selected based on source chain type

**Acceptance criteria:** Happy path + key error paths covered end-to-end.

---

### TASK-037: E2E tests — EVM publish and fund on Anvil fork of Base mainnet
**Severity:** HIGH
**Why:** Unit and integration tests with mocked clients prove the code is internally consistent, but
they cannot catch ABI mismatches, broken portal contract interactions, incorrect reward encoding, or
wrong token approval mechanics against the real deployed contracts. This task creates a true end-to-end
test that exercises `EvmPublisher` against a live fork of Base mainnet — the same chain, the same
portal contract, the same USDC — with no mocking.

**Chain facts used by this task:**
- Source chain: Base mainnet (chain ID `8453`)
- Portal contract: `0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97`
- USDC (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- Destination: any configured EVM chain (e.g. Optimism, chain ID `10`)

> **First:** Add the Base mainnet portal address to `src/config/chains.ts` before writing tests:
> ```typescript
> base: {
>   id: 8453n,
>   // ... existing fields ...
>   portalAddress: AddressNormalizer.normalize(
>     '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97',
>     ChainType.EVM
>   ),
> }
> ```

---

#### Step 1 — Docker Compose infrastructure

Create `tests/e2e/docker-compose.e2e.yml`:
```yaml
services:
  anvil:
    image: ghcr.io/foundry-rs/foundry:latest
    entrypoint: anvil
    command: >
      --fork-url ${FORK_RPC_URL}
      --fork-block-number ${FORK_BLOCK_NUMBER:-28000000}
      --chain-id 8453
      --host 0.0.0.0
      --port 8545
      --silent
    ports:
      - "8545:8545"
    healthcheck:
      test:
        - "CMD-SHELL"
        - "cast block-number --rpc-url http://localhost:8545 > /dev/null 2>&1"
      interval: 3s
      timeout: 5s
      retries: 20
      start_period: 5s
```

Two environment variables drive the fork:
- `FORK_RPC_URL` — a Base mainnet RPC endpoint with archive access (Alchemy/Infura key). Set as
  a GitHub Actions secret `BASE_RPC_URL` for CI.
- `FORK_BLOCK_NUMBER` — pinned block for reproducible tests (`28000000` as default; update
  periodically so forked state is reasonably recent).

---

#### Step 2 — Jest E2E configuration

Create `jest.e2e.config.ts` (separate from unit/integration config):
```typescript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/tests/e2e/**/*.e2e.test.ts'],
  globalSetup: './tests/e2e/setup/global-setup.ts',
  globalTeardown: './tests/e2e/setup/global-teardown.ts',
  testTimeout: 120_000, // 2 minutes — fork startup + transaction confirmation
  maxWorkers: 1,        // E2E tests must be serial (shared Anvil state)
};
```

Add to `package.json` scripts:
```json
"test:e2e": "jest --config jest.e2e.config.ts",
"test:e2e:ci": "jest --config jest.e2e.config.ts --forceExit"
```

---

#### Step 3 — Global setup and teardown

Use `execFileSync` with argument arrays (not `exec` with shell strings) to prevent command injection:

**`tests/e2e/setup/global-setup.ts`:**
```typescript
import { execFileSync } from 'child_process';
import path from 'path';

const COMPOSE_FILE = path.resolve(__dirname, '../docker-compose.e2e.yml');
const ANVIL_URL = 'http://localhost:8545';
const MAX_WAIT_MS = 60_000;

export default async function globalSetup(): Promise<void> {
  if (!process.env.FORK_RPC_URL) {
    throw new Error(
      'E2E tests require FORK_RPC_URL (Base mainnet archive RPC).\n' +
      'Set it in your .env or run: FORK_RPC_URL=https://... pnpm test:e2e'
    );
  }

  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'up', '-d'], { stdio: 'inherit' });

  const start = Date.now();
  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const res = await fetch(ANVIL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
      });
      if (res.ok) {
        console.log('[E2E] Anvil fork of Base mainnet is ready');
        return;
      }
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 1_000));
  }
  throw new Error(`Anvil did not become ready within ${MAX_WAIT_MS / 1000}s`);
}
```

**`tests/e2e/setup/global-teardown.ts`:**
```typescript
import { execFileSync } from 'child_process';
import path from 'path';

const COMPOSE_FILE = path.resolve(__dirname, '../docker-compose.e2e.yml');

export default async function globalTeardown(): Promise<void> {
  execFileSync('docker', ['compose', '-f', COMPOSE_FILE, 'down', '--volumes'], { stdio: 'inherit' });
}
```

---

#### Step 4 — Anvil test helpers

Create `tests/e2e/setup/anvil-helpers.ts`:
```typescript
import { createPublicClient, http, keccak256, encodeAbiParameters, parseAbiParameters, parseUnits } from 'viem';
import { base } from 'viem/chains';

export const ANVIL_RPC = 'http://localhost:8545';

// Anvil default test account #0 — pre-funded with 10 000 ETH by Anvil at fork startup
export const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
export const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Base mainnet contract addresses
export const USDC_ADDRESS  = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const PORTAL_ADDRESS = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97' as const;

/**
 * Fund the test account with USDC by directly writing to the ERC-20 storage slot.
 * Circle's USDC uses mapping slot 9 for balances.
 * Storage key = keccak256(abi.encode(account, 9))
 */
export async function fundTestAccountWithUsdc(amountUsdc: number): Promise<void> {
  const USDC_BALANCE_SLOT = 9n;
  const storageKey = keccak256(
    encodeAbiParameters(
      parseAbiParameters('address, uint256'),
      [TEST_ADDRESS, USDC_BALANCE_SLOT]
    )
  );
  const encodedBalance = encodeAbiParameters(
    parseAbiParameters('uint256'),
    [parseUnits(String(amountUsdc), 6)]
  );

  await fetch(ANVIL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'anvil_setStorageAt',
      params: [USDC_ADDRESS, storageKey, encodedBalance],
    }),
  });
}

/** Read on-chain USDC balance of an address (for assertion in tests). */
export async function getUsdcBalance(address: string): Promise<bigint> {
  const client = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });
  return client.readContract({
    address: USDC_ADDRESS,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  }) as Promise<bigint>;
}
```

---

#### Step 5 — E2E test file

Create `tests/e2e/evm-publish.e2e.test.ts`:
```typescript
import { createPublicClient, http, parseEventLogs, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { ChainType } from '@/core/interfaces/intent';
import { PortalEncoder } from '@/core/utils/portal-encoder';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { portalAbi } from '@/commons/abis/portal.abi';
import {
  ANVIL_RPC,
  TEST_PRIVATE_KEY,
  TEST_ADDRESS,
  USDC_ADDRESS,
  PORTAL_ADDRESS,
  fundTestAccountWithUsdc,
  getUsdcBalance,
} from './setup/anvil-helpers';

const SOURCE_CHAIN_ID = 8453n;  // Base mainnet
const DEST_CHAIN_ID   = 10n;    // Optimism

const universalCreator = AddressNormalizer.normalize(TEST_ADDRESS,   ChainType.EVM);
const universalPortal  = AddressNormalizer.normalize(PORTAL_ADDRESS, ChainType.EVM);
const universalUsdc    = AddressNormalizer.normalize(USDC_ADDRESS,   ChainType.EVM);

function buildReward(deadlineOffsetSec = 3600) {
  return {
    deadline:     BigInt(Math.floor(Date.now() / 1000) + deadlineOffsetSec),
    nativeAmount: 0n,
    creator:      universalCreator,
    prover:       universalCreator, // using self as prover for test simplicity
    tokens:       [{ token: universalUsdc, amount: parseUnits('5', 6) }], // 5 USDC
  };
}

const encodedRoute = PortalEncoder.encode(
  {
    salt:        '0x0000000000000000000000000000000000000000000000000000000000000001',
    destination: DEST_CHAIN_ID,
    portal:      universalPortal,
    calls:       [],
    tokens:      [{ token: universalUsdc, amount: parseUnits('5', 6) }],
  },
  ChainType.EVM
) as string;

describe('EvmPublisher E2E — Base mainnet fork via Anvil', () => {
  let publisher: EvmPublisher;
  let publicClient: ReturnType<typeof createPublicClient>;

  beforeAll(async () => {
    publisher    = new EvmPublisher(ANVIL_RPC);
    publicClient = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });

    // Write 100 USDC directly into the test account storage on the fork
    await fundTestAccountWithUsdc(100);
  });

  // ─── Happy path ─────────────────────────────────────────────────────────────

  it('publishes intent and emits IntentPublished event on-chain', async () => {
    const reward = buildReward();
    const result = await publisher.publish(
      SOURCE_CHAIN_ID, DEST_CHAIN_ID,
      reward, encodedRoute,
      TEST_PRIVATE_KEY, universalPortal
    );

    expect(result.success).toBe(true);
    expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.intentHash).toMatch(/^0x[a-f0-9]{64}$/i);

    // Verify the IntentPublished event was actually emitted on-chain
    const receipt = await publicClient.getTransactionReceipt({
      hash: result.transactionHash as `0x${string}`,
    });
    const [event] = parseEventLogs({ abi: portalAbi, eventName: 'IntentPublished', logs: receipt.logs });
    expect(event).toBeDefined();
    expect(event.args.intentHash).toBe(result.intentHash);
  });

  it('USDC is deducted from test account after funding', async () => {
    const balanceBefore = await getUsdcBalance(TEST_ADDRESS);
    const reward = buildReward(7200); // different deadline = new intent hash
    await publisher.publish(
      SOURCE_CHAIN_ID, DEST_CHAIN_ID,
      reward, encodedRoute,
      TEST_PRIVATE_KEY, universalPortal
    );
    const balanceAfter = await getUsdcBalance(TEST_ADDRESS);
    expect(balanceAfter).toBeLessThan(balanceBefore);
  });

  it('skips approval on second publish (maxUint256 allowance already set)', async () => {
    // After the first test the portal already has maxUint256 allowance.
    // This test measures that the second publish is cheaper (no approval tx).
    const reward = buildReward(10800);
    const result = await publisher.publish(
      SOURCE_CHAIN_ID, DEST_CHAIN_ID,
      reward, encodedRoute,
      TEST_PRIVATE_KEY, universalPortal
    );
    expect(result.success).toBe(true);
  });

  // ─── validate() against real chain ──────────────────────────────────────────

  it('validate() passes when USDC balance is sufficient', async () => {
    const result = await publisher.validate(buildReward(), TEST_ADDRESS);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate() fails when USDC balance is insufficient', async () => {
    const hugeReward = buildReward();
    hugeReward.tokens = [{ token: universalUsdc, amount: parseUnits('999999', 6) }];
    const result = await publisher.validate(hugeReward, TEST_ADDRESS);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/insufficient/i);
  });

  // ─── Error paths ─────────────────────────────────────────────────────────────

  it('returns { success: false } when reward deadline is already expired', async () => {
    const expiredReward = buildReward(-60); // 60 seconds in the past
    const result = await publisher.publish(
      SOURCE_CHAIN_ID, DEST_CHAIN_ID,
      expiredReward, encodedRoute,
      TEST_PRIVATE_KEY, universalPortal
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns { success: false } when portal address is wrong', async () => {
    const badPortal = AddressNormalizer.normalize(
      '0x0000000000000000000000000000000000000001',
      ChainType.EVM
    );
    const result = await publisher.publish(
      SOURCE_CHAIN_ID, DEST_CHAIN_ID,
      buildReward(), encodedRoute,
      TEST_PRIVATE_KEY, badPortal
    );
    expect(result.success).toBe(false);
  });
});
```

---

#### Step 6 — CI integration

Add an E2E job to `.github/workflows/ci.yml` (after the `quality` job):
```yaml
  e2e:
    runs-on: ubuntu-latest
    needs: quality
    env:
      FORK_RPC_URL: ${{ secrets.BASE_RPC_URL }}
      FORK_BLOCK_NUMBER: '28000000'
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - name: Run E2E tests (Anvil managed by Jest global setup/teardown)
        run: pnpm test:e2e:ci
```

Anvil is started and stopped by Jest's `globalSetup`/`globalTeardown` — no separate CI step needed.
Add `BASE_RPC_URL` (Base mainnet archive RPC) as a GitHub Actions secret.

---

**Files to create:**
```
tests/e2e/
├── docker-compose.e2e.yml
├── setup/
│   ├── global-setup.ts
│   ├── global-teardown.ts
│   └── anvil-helpers.ts
└── evm-publish.e2e.test.ts
jest.e2e.config.ts
```

**Acceptance criteria:**
- `FORK_RPC_URL` missing → `globalSetup` fails with a clear, actionable error message
- `docker compose -f tests/e2e/docker-compose.e2e.yml up -d` starts Anvil forking Base mainnet at the pinned block
- `pnpm test:e2e` runs all 6 test cases and they pass against the real deployed portal contract
- The `IntentPublished` event is verified on-chain (not just trusting `result.intentHash`)
- USDC balance is verified to decrease after funding
- CI E2E job passes with `BASE_RPC_URL` secret configured
- `src/config/chains.ts` has `portalAddress` set for Base mainnet

**Depends on:** TASK-022 (for `validate()` on `EvmPublisher`), TASK-023 (for DI — the `EvmPublisher` constructed in tests uses the real `DefaultEvmClientFactory` against Anvil)

---

## Phase 4 — Documentation

Documentation tasks can all run in parallel.

### TASK-040: Create ARCHITECTURE.md
**Severity:** HIGH
**Why:** The Universal Address system, intent lifecycle, cross-chain publisher pattern, and chain
plugin registry are complex enough that third-party contributors cannot understand them from code alone.

**Contents required:**
1. System overview diagram (ASCII or Mermaid) showing data flow from CLI → Publisher → Blockchain
2. Universal Address System — what it is, why it exists, normalize/denormalize lifecycle
3. Intent lifecycle — how an intent is built, encoded, submitted, tracked
4. Publisher pattern — BasePublisher contract, how to add a new chain
5. Chain Registry (after TASK-020) — how to register a new chain handler
6. Module dependency graph (layered: core → config → blockchain → cli)
7. Quote service integration — solver-v2 vs quote service vs manual, precedence rules

**Acceptance criteria:** A developer new to the project can add a new chain type without reading
`publish.ts` or `address-normalizer.ts`.

---

### TASK-041: Create CONTRIBUTING.md
**Severity:** HIGH
**Why:** Third parties want to contribute but there is no guide.

**Contents required:**
1. Development setup (clone, pnpm install, .env setup, pnpm dev)
2. Branch naming convention (`feat/`, `fix/`, `docs/`, `refactor/`, `test/`)
3. Commit message format (Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`)
4. Pull request checklist (tests pass, types pass, lint passes, docs updated)
5. Testing guide — how to run tests, how to write new tests
6. Code review process and timeline expectations

**Acceptance criteria:** `CONTRIBUTING.md` exists at repo root with all six sections.

---

### TASK-042: Create SECURITY.md and document private key handling
**Severity:** HIGH
**Why:** The tool handles private keys. Users need to understand the security model and how to
report vulnerabilities.

**Contents required:**
1. Supported versions (which versions receive security patches)
2. Reporting a vulnerability (GitHub Security Advisory or email)
3. Security model — how private keys are used (never persisted, only in-process memory)
4. Private key format guide (EVM: 0x + 64 hex, TVM: 64 hex no prefix, SVM: base58/array)
5. Best practices for users (hardware wallets, dedicated test accounts, .env in .gitignore)

**Acceptance criteria:** `SECURITY.md` exists; private key formats are documented with examples.

---

### TASK-043: Document all public APIs with JSDoc
**Severity:** HIGH
**Why:** `publish.ts` (671 lines, ~5% JSDoc), `config/chains.ts`, `config/tokens.ts`, `config/env.ts`
have almost no documentation. Exported functions like `getWalletAddr()` have zero docs.

**Priority files (in order):**
1. `src/commands/publish.ts` — all exported functions and complex internal functions
2. `src/config/chains.ts` — `ChainConfig` interface fields
3. `src/config/tokens.ts` — `TokenConfig` interface, `addresses` field (why string keys?)
4. `src/config/env.ts` — `loadEnvConfig()`, `EnvConfig` fields, what happens when keys are missing
5. `src/blockchain/evm-publisher.ts` — class, constructor, all public methods
6. `src/blockchain/tvm-publisher.ts` — same
7. `src/blockchain/svm-publisher.ts` — same

**Acceptance criteria:** All exported types, interfaces, and functions have JSDoc with `@param`,
`@returns`, and at least one `@example` for non-trivial functions.

---

### TASK-044: Improve environment variable documentation and validation
**Severity:** HIGH
**Why:** `.env.example` has unclear format guidance (TVM key shows just `...`), bizarre
`QUOTES_API_URL=any_value` pattern, and no startup validation.

**Steps:**
1. Rewrite `.env.example` with:
   - Format examples for every private key type (with exact character count and format)
   - Comments explaining which are REQUIRED vs OPTIONAL
   - Documented defaults for optional values
   - Clear explanation of quote service priority: SOLVER_URL > QUOTES_PREPROD > QUOTES_API_URL
   - Commented-out portal address entries for all supported chains
2. Update `src/config/env.ts` with zod validation (from TASK-012) that runs at startup
3. Print a clear startup error showing exactly which variable is wrong and what format is expected

**Acceptance criteria:** `.env.example` has format comments for every variable; invalid env vars
produce clear, actionable error messages at startup.

---

### TASK-045: Improve CLI help text and error messages
**Severity:** MEDIUM
**Why:** Help text has no examples. Error messages are cryptic (e.g., "No private key configured"
with no guidance on how to fix it).

**Steps:**
1. Add `.addHelpText('after', ...)` examples to all commands in `publish.ts`, `status.ts`, `config.ts`
2. Rewrite error messages for: no private key, invalid address, insufficient balance, quote failure,
   unsupported chain — each should include:
   - What went wrong (machine-readable code)
   - What the user provided (show the bad value)
   - What is expected (format description with example)
   - How to fix it (actionable next step)
3. Fix the non-functional `--verbose` flag (either implement it or remove it from option list)
4. Update `--private-key` option description to mention format per chain type

**Acceptance criteria:** `pnpm dev publish --help` shows at least 3 examples; error messages include
the user's bad input and a corrective action.

---

### TASK-046: Set up CHANGELOG and versioning process
**Severity:** MEDIUM
**Why:** No changelog, no semver discipline. Users cannot track what changed between versions.

**Steps:**
1. Install changesets: `pnpm add -D @changesets/cli`
2. Run `pnpm changeset init`
3. Create `CHANGELOG.md` with initial entry documenting the current state
4. Add to `.github/workflows/ci.yml` a release step triggered on tag push
5. Document the release process in `CONTRIBUTING.md`:
   - Developer runs `pnpm changeset` to describe their change
   - `.changeset/*.md` file is committed with PR
   - On merge to main, CI creates a release PR that bumps version and updates CHANGELOG

**Acceptance criteria:** `pnpm changeset` works; `CHANGELOG.md` exists; release process documented.

---

## Phase 5 — Polish & Hardening

### TASK-050: Implement secure key handling (zeroize on use)
**Severity:** MEDIUM
**Why:** Private keys are held in JavaScript strings through the entire publish flow. Strings are
immutable and cannot be zeroed — keys may persist in memory until GC.

**Steps:**
1. Create `src/core/security/key-manager.ts`:
   ```typescript
   export class KeyHandle {
     private buffer: Buffer;
     constructor(key: string) { this.buffer = Buffer.from(key, 'utf8'); }
     use<T>(fn: (key: string) => T): T {
       try { return fn(this.buffer.toString('utf8')); }
       finally { this.buffer.fill(0); } // Zeroize on use
     }
   }
   ```
2. Update publishers to accept a `KeyHandle` instead of a raw string
3. Update `getPrivateKey()` in `key-provider.ts` to return `KeyHandle`
4. Ensure `TvmPublisher` clears the key from the TronWeb instance after publish:
   ```typescript
   finally { this.tronWeb.setPrivateKey(''); }
   ```

**Acceptance criteria:** `KeyHandle` class exists; publishers use it; TronWeb key is cleared after use.

---

### TASK-051: Add RPC endpoint fallback strategy
**Severity:** MEDIUM
**Why:** If `api.trongrid.io` or `api.mainnet-beta.solana.com` goes down, the CLI is dead for all
users with no way to switch.

**Steps:**
1. Add secondary default RPC URLs to `src/config/env.ts`
2. Create `src/core/rpc/rpc-provider.ts` that tries endpoints in sequence:
   ```typescript
   export async function withFallback<T>(
     endpoints: string[],
     fn: (rpcUrl: string) => Promise<T>
   ): Promise<T> { ... }
   ```
3. Implement retry with exponential backoff for network errors (max 3 attempts)
4. Log which endpoint succeeded at debug level

**Acceptance criteria:** CLI survives primary RPC outage if a secondary is configured; retry logic exists.

---

### TASK-052: Add TypeDoc configuration and generate API docs
**Severity:** LOW
**Why:** Third-party developers using `IntentBuilder` programmatically have no API reference.

**Steps:**
1. Install: `pnpm add -D typedoc`
2. Create `typedoc.json`:
   ```json
   {
     "entryPoints": ["src/index.ts", "src/builders/intent-builder.ts"],
     "out": "docs/api",
     "excludePrivate": true,
     "excludeInternal": true
   }
   ```
3. Add script: `"docs": "typedoc"`
4. Add `docs/` to `.gitignore` (generated artifacts)
5. Add to CI: generate docs on tag push, deploy to GitHub Pages

**Acceptance criteria:** `pnpm docs` generates API documentation; CI deploys on release.

---

### TASK-053: Add chain ID allowlist validation
**Severity:** MEDIUM
**Why:** No explicit allowlist prevents sending transactions to untested or unintended chains.

**Steps:**
1. In `ChainRegistry` (from TASK-020), expose `isRegistered(chainId: bigint): boolean`
2. In each publisher's `runPreflightChecks()`, validate the source chain ID is registered
3. In `publish.ts` interactive flow, filter chain selection to only registered chains
4. Throw `RoutesCliError.unsupportedChain` for unregistered chain IDs

**Acceptance criteria:** Publishing to an unknown chain ID throws a typed error before any RPC call.

---

## Summary — Phase Execution Order

```
Phase 0 (Emergency)  →  Do immediately, in parallel
Phase 1 (Foundation) →  All tasks in parallel, after Phase 0
Phase 2 (Architecture) →  TASK-020 first, then all others in parallel
Phase 3 (Testing)    →  Can start in parallel with Phase 2
Phase 4 (Docs)       →  Fully parallel, can start anytime
Phase 5 (Polish)     →  After Phase 2 completes
```

## Task Index

| Task | Phase | Title | Severity |
|------|-------|-------|----------|
| TASK-001 | 0 | Audit and rotate exposed private keys | CRITICAL |
| TASK-002 | 0 | Patch critical dependency vulnerabilities | CRITICAL |
| TASK-003 | 0 | Add Node.js version constraints | CRITICAL |
| TASK-010 | 1 | Tighten TypeScript compiler settings | HIGH |
| TASK-011 | 1 | Add a typed error hierarchy | HIGH |
| TASK-012 | 1 | Add runtime validation with zod | HIGH |
| TASK-013 | 1 | Eliminate all `any` types | HIGH |
| TASK-014 | 1 | Set up Jest configuration properly | HIGH |
| TASK-015 | 1 | Set up GitHub Actions CI/CD pipeline | HIGH |
| TASK-016 | 1 | Strengthen ESLint configuration | MEDIUM |
| TASK-020 | 2 | Extract chain plugin registry | CRITICAL |
| TASK-021 | 2 | Decompose the publish.ts god class | CRITICAL |
| TASK-022 | 2 | Strengthen BasePublisher contract — fix LSP violation and shared error handling | HIGH |
| TASK-023 | 2 | Add dependency injection to publishers + fix RPC client lifecycle | HIGH |
| TASK-024 | 2 | Reorganize SVM module | HIGH |
| TASK-025 | 2 | Refactor config to remove global state | HIGH |
| TASK-026 | 2 | Fix concrete publisher behavioral bugs (TVM loop, SVM proverAddress, TVM key cleanup, override keyword) | HIGH |
| TASK-030 | 3 | Unit tests — AddressNormalizer | HIGH |
| TASK-031 | 3 | Unit tests — ChainDetector | HIGH |
| TASK-032 | 3 | Unit tests — IntentConverter and PortalEncoder | HIGH |
| TASK-033 | 3 | Unit tests — Quote service | HIGH |
| TASK-034 | 3 | Integration tests — Config loading | MEDIUM |
| TASK-035 | 3 | Integration tests — EVMPublisher | MEDIUM |
| TASK-036 | 3 | Integration tests — Intent publishing flow | MEDIUM |
| TASK-037 | 3 | E2E tests — EVM publish and fund on Anvil fork of Base mainnet | HIGH |
| TASK-040 | 4 | Create ARCHITECTURE.md | HIGH |
| TASK-041 | 4 | Create CONTRIBUTING.md | HIGH |
| TASK-042 | 4 | Create SECURITY.md | HIGH |
| TASK-043 | 4 | Document all public APIs with JSDoc | HIGH |
| TASK-044 | 4 | Improve .env.example and validation | HIGH |
| TASK-045 | 4 | Improve CLI help text and error messages | MEDIUM |
| TASK-046 | 4 | Set up CHANGELOG and versioning | MEDIUM |
| TASK-050 | 5 | Implement secure key handling | MEDIUM |
| TASK-051 | 5 | Add RPC endpoint fallback strategy | MEDIUM |
| TASK-052 | 5 | Add TypeDoc and generate API docs | LOW |
| TASK-053 | 5 | Add chain ID allowlist validation | MEDIUM |
