# TASK-002 — Completed

## Summary
Patched HIGH CVE dependencies:
- tronweb → 6.2.0 (fixes axios DoS CVEs)
- @coral-xyz/anchor → 0.32.1
- jest → 30.2.0, ts-jest → 29.4.6
- @typescript-eslint → 8.56.0, eslint → 10.0.0 (fixes minimatch ReDoS)
- viem: ~2.40.1 → ^2.40.1

Used pnpm.overrides to force: axios >=1.13.5, minimatch >=10.2.1
Used pnpm.auditConfig.ignoreCves to suppress bigint-buffer (GHSA-3gc7-fjrx-p6mg / CVE-2025-3194) — no upstream fix exists (patched versions: <0.0.0).

`pnpm audit --audit-level=high` now exits 0.
`pnpm build` passes.

## Next task: TASK-003 (Node.js version constraints)

---

# TASK-003 — Completed

## Summary
Added Node.js version constraints:
- `engines` field in package.json: node >=18.0.0, pnpm >=8.0.0
- Created `.nvmrc` with `18` (nvm)
- Created `.node-version` with `18` (mise/asdf)
- Added startup guard at top of `src/index.ts` (before imports)
- Also fixed missing `globals` devDependency (ESLint pre-commit hook was failing)

`pnpm build` passes. Commit: feat(node): add Node.js version constraints and startup guard (TASK-003)

## Next task: TASK-010 (Tighten TypeScript compiler settings)

---

# TASK-010 — Completed

## Summary
Tightened TypeScript compiler settings:
- `strictPropertyInitialization: true` (was false)
- `noUnusedLocals: true` (was false)
- `noUnusedParameters: true` (was false)
- `noImplicitOverride: true` (new)
- `skipLibCheck: false`, `skipDefaultLibCheck: false` (were true)
- Added `src/scripts` to tsconfig exclude (has own node_modules, would cause spurious errors)
- Fixed 4 noUnusedLocals violations by prefixing unused params with `_`:
  - svm-decode.ts: `program` → `_program`, `instructionData` → `_instructionData`
  - svm-transaction.ts: `connection` → `_connection`
  - status.ts: replacer `key` → `_key`

`pnpm build` passes. Commit: chore(ts): tighten TypeScript compiler settings (TASK-010)

## Next task: TASK-011 (Add a typed error hierarchy)

---

# TASK-011 — Completed

## Summary
Added typed error hierarchy:
- Created `src/core/errors/errors.ts` with `ErrorCode` enum (8 codes) and `RoutesCliError` class
- Static factory methods: invalidAddress, invalidPrivateKey, insufficientBalance, unsupportedChain, networkError, configurationError
- `isUserError` flag distinguishes user-facing errors (actionable) from system errors (technical)
- Exported from `src/core/errors/index.ts`
- Updated `src/utils/error-handler.ts`: `handleCliError` checks `RoutesCliError` first; user errors show clean message, system errors show code + optional stack in DEBUG mode

`pnpm build` passes. Commit: feat(errors): add typed error hierarchy (TASK-011)

## Next task: TASK-012 (Add runtime validation with zod)

---

# TASK-012 — Completed

## Summary
Added runtime validation with zod:
- Installed zod v3.x (pnpm add zod)
- Created `src/core/validation/schemas.ts` with schemas for:
  - EVM address: `/^0x[a-fA-F0-9]{40}$/`
  - Universal address: `/^0x[a-fA-F0-9]{64}$/`
  - TVM address: union of base58 (`/^T[A-Za-z0-9]{33}$/`) and hex (`/^(0x)?41.../`)
  - SVM address: base58 chars, 32-44 chars
  - EVM/TVM private keys
  - Token amount (positive decimal string)
  - Chain ID (positive bigint)
- Created `src/core/validation/index.ts` barrel export
- Updated `src/config/env.ts`: uses `EnvSchema.safeParse(process.env)` on load, throws `RoutesCliError.configurationError` with field names on failure
- Updated `src/commands/publish.ts` recipient prompt: replaced inline switch with zod schema `.safeParse()`
- Updated `AddressNormalizer.normalize()`: validates input with zod schema before processing, throws `RoutesCliError.invalidAddress` on failure

Note: zod v4 uses `.issues` not `.errors` on ZodError.

`pnpm build` passes. Commit: feat(validation): add runtime validation with zod (TASK-012)

## Next task: TASK-013 (Eliminate all `any` types)


---

# TASK-013 — Completed

## Summary
Eliminated all `any` types from src/ (excluding scripts which are excluded from tsconfig):
- `quote.ts`: Added `QuoteRequestPayload` interface, replaced `request: any`
- `logger.ts`: Typed `table()` and `displayTable()` options with `ConstructorParameters<typeof Table>[0]`
- `svm-types.ts`: Imported `Program`, `AnchorProvider`, `Transaction` from anchors; replaced all `any` fields; `SvmError.details?: unknown`, `DecodedEvent.data: Record<string, unknown>`
- `svm-decode.ts`: All `catch (error: any)` → `catch (error: unknown)` with narrowing; added `RawIntentPublishedData` interface for safe Anchor event data access; `decodeInstructionData` returns `Promise<{name: string} | null>`; property accesses on `Record<string, unknown>` cast properly
- `svm-transaction.ts`: All `catch (error: any)` → `catch (error: unknown)`; removed unused `PortalIdl` type import; changed `Program<PortalIdl>` → `Program` in `buildFundingTransaction`
- `svm-publisher.ts`: `handleError(error: any)` → `handleError(error: unknown)` with `typeof error === 'object'` narrowing for Solana-specific fields
- `base-publisher.ts`: `decodedData?: any` → `decodedData?: unknown`
- `publish.ts`: `catch (error: any)` → `catch (error: unknown)`

`pnpm build` passes. Commit: refactor(types): eliminate all any types (TASK-013)

## Next task: TASK-014 (Set up Jest configuration properly)

---

# TASK-014 — In Progress

## Plan
- Replace jest.config.js with jest.config.ts (spec format + preserve transform → tests/tsconfig.json)
- Create tests/ subdirs: blockchain/, config/, integration/, e2e/ (with .gitkeep)
- Create tests/__mocks__/: viem.ts, tronweb.ts, @solana/web3.js.ts (empty module mocks)
- Add test:unit and test:integration scripts to package.json (test, typecheck, test:coverage already exist)
- Key: coverageThreshold added (branches 70, functions/lines/statements 75)
- Key: jest.config.ts uses export default with Config type from 'jest'

---

# TASK-014 — Completed

## Summary
- Replaced jest.config.js with jest.config.ts (typed, coverageThreshold, moduleNameMapper for ora)
- Created tests/ subdirs: blockchain/, config/, integration/, e2e/ (with .gitkeep)
- Created tests/__mocks__/: pass-through mocks for viem/tronweb/@solana/web3.js, stub for ora
- Added test:unit and test:integration scripts to package.json
- Excluded tests/ from root tsconfig.json (prevents dist/tests/ contamination)
- Added allowJs:true + override exclude in tests/tsconfig.json
- Used projectService:true in ESLint for multi-tsconfig support

Key lessons:
1. Jest auto-applies any __mocks__/*.ts under rootDir for node_modules (not just adjacent to node_modules)
2. Use pass-through mocks (module.exports = jest.requireActual()) to prevent interference
3. ora@8 is ESM-only; use moduleNameMapper to stub it instead of transformIgnorePatterns
4. tests/tsconfig.json must override exclude: to prevent inheriting parent's "tests" exclusion
5. @typescript-eslint/parser v8 uses projectService:true for multi-tsconfig projects

pnpm test: 38/38 pass. pnpm build: passes.

## Next task: TASK-015 (Set up GitHub Actions CI/CD pipeline)

---

# TASK-016 — Completed

## Summary
Strengthened ESLint configuration:
- `@typescript-eslint/no-explicit-any: 'error'` (was 'off')
- `@typescript-eslint/explicit-function-return-type: 'error'` with allowExpressions:true, allowTypedFunctionExpressions:true
- `@typescript-eslint/no-floating-promises: 'error'`
- `@typescript-eslint/require-await: 'error'`
- `no-console: ['error', { allow: ['warn', 'error'] }]`
- `@typescript-eslint/no-unsafe-assignment: 'warn'`
- Added `src/scripts/**` to globalIgnores (scripts not in tsconfig)

Fixed all 46 resulting errors:
1. `logger.ts`: Added `/* eslint-disable no-console */` (logger IS the console abstraction)
2. `evm-publisher.ts`: Added `: Chain` return type to `getChain`
3. `svm-transaction.ts`: Added inline return type to `buildPortalReward`
4. `svm-decode.ts`: Removed `async` from `decodeInstructionData` (no await)
5. `config.ts`: Removed `async` from 7 functions/actions that didn't use await; updated callers
6. `publish.ts`: Added `BuildIntentResult` interface; return types; changed `console.log` → `console.error`
7. `buffer.ts`: Added `: Buffer` return type
8. `portal-borsh-coder.ts`: Added `: BorshCoder` return type
9. `chains.ts`: Added `: void` to `updatePortalAddresses`
10. `intent-converter.ts`: Added imports (`Hex`, `EvmAddress`); annotated 3 function return types
11. `quote.ts`: Added `: Promise<QuoteResponse>` to `getQuote`
12. `quote.test.ts`: Changed `json: async () =>` to `json: () =>` (9 occurrences)
13. `.husky/pre-commit`: Added `pnpm typecheck`

`pnpm lint` exits 0 (only warnings). `pnpm build` passes. `pnpm test`: 38/38 pass.

## Next task: TASK-020 (Extract chain plugin registry)

---

# TASK-020 — Completed

## Summary
Extracted chain plugin registry:
- Created `src/core/chain/chain-handler.interface.ts` — `ChainHandler` interface (validateAddress, normalize, denormalize, getAddressFormat)
- Created `src/core/chain/chain-registry.ts` — `ChainRegistry` class + singleton; dispatches to registered handlers
- Created `src/core/chain/index.ts` — barrel exports
- Created `src/blockchain/evm/evm-chain-handler.ts` — EVM handler (self-registers on import)
- Created `src/blockchain/tvm/tvm-chain-handler.ts` — TVM handler (self-registers on import)
- Created `src/blockchain/svm/svm-chain-handler.ts` — SVM handler (self-registers on import)
- Updated `AddressNormalizer.normalize()` and `denormalize()` to delegate to `chainRegistry`
- Updated `publish.ts` recipient validation to use `chainRegistry.get(destChain.type).validateAddress()`
- Updated `src/index.ts` to import handlers BEFORE @/ named imports (with eslint-disable for sort order)
- Created `tests/setup/register-chain-handlers.ts` for Jest setup (tests bypass index.ts)
- Updated `jest.config.ts` to include the setup file in `setupFilesAfterEnv`

Key design decisions:
1. Self-registering handlers: each handler file runs `chainRegistry.register(...)` at module level
2. Initialization order: handlers MUST be imported before chains.ts/tokens.ts (which call AddressNormalizer at module load)
3. eslint-disable for simple-import-sort in index.ts — the initialization order requirement conflicts with alphabetical side-effect-after-named-imports rule
4. Jest setup file: tests that import address-normalizer directly need handlers registered via setupFilesAfterEnv

`pnpm build` passes. `pnpm lint` exits 0 (warnings only). `pnpm test`: 38/38 pass.

## Next task: TASK-021 (Decompose the publish.ts god class) — depends on TASK-020 ✓

---

# TASK-021 — Completed

## Summary
Decomposed the 650-line publish.ts god class into focused modules:
- `src/cli/key-provider.ts` — getPrivateKey, getWalletAddress (pure crypto helpers)
- `src/cli/prompts/intent-prompts.ts` — all interactive CLI prompts (selectSourceChain, selectDestinationChain, selectToken, configureReward, selectRecipient)
- `src/core/services/intent-service.ts` — IntentService class with buildIntent, getQuoteOrFallback, buildManualFallback, encodeRoute
- `src/blockchain/publisher-factory.ts` — createPublisher factory function
- `src/commands/publish.ts` reduced from 650 → 115 lines (thin orchestrator)

Key decisions:
1. Display summary + confirmation kept in IntentService.buildIntent (they're part of the interactive intent building flow, not publish orchestration)
2. `as BlockchainAddress` casts needed at user input boundaries (inquirer returns `string`, normalize expects branded type)
3. `configureReward` takes sourceChain (not destChain as the task spec said) — reward is on source chain

`pnpm build` passes. `pnpm test`: 38/38 pass. `pnpm lint` exits 0.

## Next task: TASK-022 (Strengthen BasePublisher contract — fix LSP violation and shared error handling) — requires TASK-011 ✓

---

# TASK-022 — Completed

## Summary
Strengthened BasePublisher contract — fixed LSP violation and added shared error handling:
- Added `ValidationResult` interface (`{ valid: boolean; errors: string[] }`) to `base-publisher.ts`
- Added abstract `validate(reward, senderAddress)` to `BasePublisher` — fixes LSP violation (EVMPublisher had validate() as non-contracted public method)
- Added `protected handleError(error): PublishResult` — shared error handler, `logger.stopSpinner()` + return `{ success: false }`
- Added `protected async runSafely(fn): Promise<PublishResult>` — eliminates duplicate try-catch boilerplate
- Implemented `validate()` on all three publishers:
  - `EvmPublisher`: checks native balance + ERC-20 token balances using viem client (chains.mainnet as placeholder)
  - `TvmPublisher`: checks tokens.length > 0, TRX native balance, token balances via TronWeb contract
  - `SvmPublisher`: checks SOL lamport balance, SPL token balances via `getAccount`/`getAssociatedTokenAddressSync`
- Added `override` keyword to `publish()`, `getBalance()`, `validate()` on all three publishers
- Wrapped all three publishers' `publish()` in `this.runSafely()` — removed duplicate try-catch blocks
- SVM: converted `private handleError` → `protected override handleError` to preserve Solana-specific error context (logs, err, details)

Key decisions:
1. EVM validate uses `chains.mainnet` as client chain placeholder — actual RPC calls go to `this.rpcUrl` regardless; chain obj only affects type metadata
2. SVM validate: wraps SPL token checks in try-catch (account may not exist) — returns error if cannot verify
3. abstract validate does not REQUIRE `override` keyword (noImplicitOverride only applies to concrete methods) but adding it gives drift protection

`pnpm build` passes. `pnpm test`: 38/38 pass. `pnpm lint`: 0 errors.

## Next task: TASK-023 (Add dependency injection to publishers + fix RPC client lifecycle)

---

# TASK-023 — Completed

## Summary
Added dependency injection to publishers + fixed EVM RPC client lifecycle:
- Created `src/blockchain/evm/evm-client-factory.ts` — EvmClientFactory interface + DefaultEvmClientFactory
- Created `src/blockchain/tvm/tvm-client-factory.ts` — TvmClientFactory interface + DefaultTvmClientFactory
- Created `src/blockchain/svm/svm-client-factory.ts` — SvmClientFactory interface + DefaultSvmClientFactory
- Fixed EvmPublisher: `_publicClient` cached per instance (lazy init with chains.mainnet as placeholder); wallet client created fresh per publish (accounts vary per call)
- Updated TvmPublisher constructor to accept optional TvmClientFactory (defaults to DefaultTvmClientFactory)
- Updated SvmPublisher constructor to accept optional SvmClientFactory (defaults to DefaultSvmClientFactory)
- Updated PublisherFactory to accept PublisherFactoryOptions with optional factories
- Created mock factories under tests/__mocks__/: evm-client-factory.mock.ts, tvm-client-factory.mock.ts, svm-client-factory.mock.ts

Key design decision: Cache only PublicClient (not WalletClient) per EvmPublisher instance.
Reason: WalletClient binds an account; accounts can differ across publish() calls (different private keys). Public client is stateless re: account so a single cached instance works for all read ops.

`pnpm build` passes. `pnpm test`: 38/38 pass. `pnpm lint`: 0 errors.

## Next task: TASK-024 (Reorganize SVM module for clarity)

---

# TASK-024 — Completed

## Summary
Reorganized SVM module for clarity:
- Created `src/blockchain/svm/pda-manager.ts` — PDA derivations (calculateVaultPDA)
- Created `src/blockchain/svm/solana-client.ts` — Connection + Anchor setup (factory + setupAnchorProgram)
- Created `src/blockchain/svm/transaction-builder.ts` — all transaction functions (replaces svm-transaction.ts)
- Updated `src/blockchain/svm/svm-client-factory.ts` → barrel re-export (backward compat)
- Updated `src/blockchain/svm-publisher.ts` — exactly 4 local imports
- portal-idl.type.ts + portal-idl-coder.type.ts left in commons (not orphans; used by portal-encoder + instruments)

`pnpm build` passes. `pnpm test`: 38/38 pass.

## Next task: TASK-025 (Refactor config to remove global state mutation)

---

# TASK-025 — Completed

## Summary
Refactored config to remove global state mutation:
- Created `src/config/config-service.ts` — `ConfigService` class with constructor(chains, tokens, env)
- `getChain(idOrName)`, `getToken(symbol, chainId)`, `overridePortalAddress()`, `getEnv()` methods
- `fromEnvironment()` static factory: shallow-copies CHAIN_CONFIGS per entry, applies PORTAL_ADDRESS_* env overrides without mutating the global CHAIN_CONFIGS, returns new instance
- `updatePortalAddresses` logic moved inside `fromEnvironment()` — PORTAL_ADDRESS_ENV_MAP const defined locally
- Removed `updatePortalAddresses(process.env)` call from `src/index.ts`; replaced with `ConfigService.fromEnvironment()` inside the existing try-catch

Key design decisions:
1. Shallow copy (spread) per ChainConfig entry is sufficient since `portalAddress` is a top-level field
2. No module-level singleton — `ConfigService.fromEnvironment()` is called explicitly in index.ts
3. Existing `CHAIN_CONFIGS` helpers (`getChainById` etc.) remain unchanged for backward compat; ConfigService holds its own copy with env overrides
4. `noUnusedLocals` is not triggered: `ConfigService.fromEnvironment()` is used as a side-effectful expression statement (not assigned)

`pnpm build` passes. `pnpm test`: 38/38 pass. `pnpm lint`: 0 errors.

## Next task: TASK-026 (Fix concrete publisher behavioral bugs)


---

# TASK-026 — Completed

## Summary
Fixed four concrete publisher behavioral bugs:

Bug 1 (TVM token loop): Replaced `reward.tokens[0]` hardcoded approval with a `for...of` loop over all `reward.tokens`, matching EVM. Uses `RoutesCliError(ErrorCode.TRANSACTION_FAILED, ...)` on failure.

Bug 2 (SVM proverAddress): Added `proverAddress?: UniversalAddress` as 7th param to `SvmPublisher.publish()` (matching `BasePublisher` signature). Added field to `PublishContext` in `svm-types.ts`. Used `context.proverAddress ?? context.reward.prover` in `buildFundingTransaction`.

Bug 3 (TVM key cleanup): Added `try { ... } finally { this.tronWeb.setPrivateKey('') }` inside the `runSafely` lambda so key is always cleared. The `try` wraps all post-`setPrivateKey` logic; errors still propagate through `runSafely`.

Bug 4 (override keyword): Already done in TASK-022 — no change needed.

Key fix: Import sort error required `@/core/errors` to come before `@/core/interfaces/intent` in tvm-publisher.ts.

`pnpm build` passes. `pnpm test`: 38/38 pass. `pnpm lint`: 0 errors.

## Next task: TASK-030 (Unit tests — AddressNormalizer)


---

# TASK-030 — Completed

## Summary
Added comprehensive unit tests for AddressNormalizer (18 tests, 42/42 suite passes):
- EVM: checksummed normalize, lowercase normalize, invalid throws RoutesCliError.INVALID_ADDRESS, zero-address, denormalize, round-trip
- TVM: base58 normalize, hex (0x41...) normalize (same universal as base58), invalid throws, round-trip
- SVM: Solana pubkey normalize, invalid base58 throws, round-trip
- Unsupported chain type throws RoutesCliError.UNSUPPORTED_CHAIN (both normalize + denormalize)
- Convenience methods: denormalizeToEvm, denormalizeToTvm, denormalizeToSvm

Key lessons:
1. viem's isViemAddress uses strict EIP-55 by default — use real addresses (e.g. vitalik.eth 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)
2. padTo32Bytes preserves case — don't hardcode exact universal address; verify format + round-trip
3. expect.objectContaining({ code: ErrorCode.X }) is more precise than just toThrow(RoutesCliError)

42/42 tests pass, build passes. Commit: test(address-normalizer): unit tests covering all round-trips and error cases (TASK-030)

## Next task: TASK-031 (Unit tests — ChainDetector)


---

# TASK-031 — Completed

## Summary
Added 4 new test cases to the existing chain-detector.test.ts (which already had 13 tests):
- `isValidAddressForChain` unknown chain type → returns false (covers the default case)
- `getNetworkFromChainConfig` MAINNET for production chains (Tron mainnet + Solana mainnet)
- `getNetworkFromChainConfig` DEVNET for development chains (used jest.spyOn to mock getChainById since CHAIN_CONFIGS filters to production-only at module load time)
- `getNetworkFromChainConfig` throws for unknown chain IDs

Key lesson: CHAIN_CONFIGS is filtered by NODE_CHAINS_ENV at module load time, so development chains aren't accessible without mocking. Used jest.spyOn(chainsModule, 'getChainById') in a try/finally block to safely mock and restore.

17/17 tests pass in suite, 46/46 total. Build passes.

## Next task: TASK-032 (Unit tests — IntentConverter and PortalEncoder)

---

# TASK-032 — Completed

## Summary
Added unit tests for IntentConverter and PortalEncoder (53 new tests, 99/99 total pass):

**intent-converter.test.ts** (18 tests):
- `toRewardEVMIntent`: creator/prover EVM format, multiple tokens all converted, zero amounts, large BigInt, empty tokens, deadline preservation
- `toRouteEVMIntent`: portal format, multiple tokens/calls all converted, call data/value unchanged, salt/deadline preserved, empty arrays
- `toEVMIntent`: full intent, chain IDs + intentHash pass-through

**portal-encoder.test.ts** (35 tests):
- `isRoute()`: returns true for Route (salt+portal+calls), false for Reward
- EVM route: encode returns 0x hex, decode round-trip for portal/deadline/amounts/multi-token/empty arrays/large BigInt
- EVM reward: encode returns 0x hex, decode round-trip for creator/prover/deadline/amounts/empty arrays
- TVM: encode produces same bytes as EVM (they share ABI encoding)
- SVM route: Borsh encode/decode round-trips for portal/deadline/token amounts
- SVM reward: Borsh encode/decode round-trips for creator/deadline/token amounts
- Unsupported chain: both encode and decode throw /unsupported chain type/i

Fixtures used real EVM addresses (vitalik, USDC, WETH) and known Solana pubkeys (wSOL, Token program, USDC mint).

`pnpm test`: 99/99 pass. `pnpm build`: passes. Commit: bbc8ac6

## Next task: TASK-033 (Unit tests — Quote service)

---

# TASK-033 — Completed

## Summary
Added 4 new test cases to the existing quote.test.ts (which already had 9 tests):
- Non-200 response from production quote service → throws
- Non-200 response from solver-v2 → throws
- Missing `quoteResponses` field (undefined, not just empty array) → throws same error
- `QUOTES_API_URL` set → uses preprod URL (covers the OR branch in getQuoteUrl)

Key observations:
1. `quote.test.ts` already existed with 9 tests covering happy paths
2. Missing: the `!response.ok` branch (line 160) was never tested — added two tests (prod + solver-v2)
3. Missing: `quoteResponses` absent entirely (undefined) — the code uses `!result.quoteResponses` so falsy covers it; existing test only had empty array
4. Missing: `QUOTES_API_URL` branch in getQuoteUrl — the code has `QUOTES_API_URL || QUOTES_PREPROD`

`pnpm test`: 103/103 pass. `pnpm build`: passes. Commit: 1c4438b

## Next task: TASK-034 (Integration tests — Config loading)

---

# TASK-034 — Completed

## Summary
Added integration tests for Config loading (40 tests, 143/143 total pass):

**chains.test.ts** (23 tests):
- Required fields: all chains have BigInt id, string name, valid ChainType, http(s) rpcUrl, universal-format portal addresses, complete nativeCurrency
- `getChainById()`: returns correct chain for Ethereum/Tron/Solana, undefined for unknown ID
- `getChainByName()`: case-insensitive, returns undefined for unknown name
- `updatePortalAddresses()`: sets portal address, doesn't throw on invalid (logs warning), ignores unknown env vars
- `ConfigService.fromEnvironment()`: applies PORTAL_ADDRESS_ETH, does NOT mutate module-level CHAIN_CONFIGS (immutability test), returns Ethereum by default

**tokens.test.ts** (17 tests):
- Required fields: all tokens have non-empty symbol, name, numeric decimals >= 0, at least one address
- Universal address format: all addresses pass `isUniversalAddress()`, specific spot-checks for USDC/ETH, USDC/SOL, USDT/TVM
- `getTokenBySymbol()`: USDC, USDT, undefined for unknown
- `getTokenAddress()`: USDC on Base (8453n), undefined for unknown symbol/chain, bUSDC on BSC (56n)
- `listTokens()`: returns >= 4 tokens with required fields
- `ConfigService.getToken()`: USDC on ETH, undefined for unknown symbol, undefined for chain without address

Key: removed two-argument `expect(val, msg)` pattern (TypeScript type TS2554 error — @types/jest doesn't support it); used `throw new Error(msg)` pattern for loop context instead.

## Next task: TASK-035 (Integration tests — EVMPublisher with mocked clients)

---

# TASK-035 — Completed

## Summary
Created `tests/blockchain/evm-publisher.integration.test.ts` — 8 integration tests for EVMPublisher using injected mock `EvmClientFactory`:
- `getBalance()` returns mocked balance
- `validate()` returns valid when native + token balances sufficient
- `validate()` returns error when native balance insufficient
- `validate()` returns error when token balance insufficient
- Token approval skipped when allowance sufficient
- Token approval sent when allowance insufficient
- `publish()` calls portal contract with correct encoded data (verifies `encodeFunctionData` output)
- `publish()` returns `{ success: false }` on transaction revert

Key patterns:
1. `beforeEach` calls `jest.clearAllMocks()` then re-sets defaults — ensures isolated per-test mock state
2. `mockResolvedValueOnce` chaining for sequential `readContract` calls (balanceOf → allowance)
3. `expect.objectContaining(...)` for loose assertions on `writeContract`/`sendTransaction` args
4. `encodeFunctionData()` in test to compute expected calldata for comparison

151/151 tests pass. Build passes.

## Next task: TASK-036 (Integration tests — Intent publishing flow)

---

# TASK-036 — Completed

## Summary
Created `tests/integration/intent-publishing.test.ts` — 12 integration tests covering the full intent publishing pipeline:
- Full flow (quote → encode → publish): mocked getQuote returns valid response, buildIntent confirmed by mock inquirer, EvmPublisher.publish succeeds with ABI-encoded IntentPublished receipt
- Quote failure → manual fallback: getQuote throws, SOURCE_CHAIN.portalAddress/proverAddress used from config, intent built from manual config prompts
- Invalid address: AddressNormalizer.normalize('garbage', EVM) → RoutesCliError with INVALID_ADDRESS, isUserError=true
- Insufficient balance: validate() returns { valid: false } + publish() returns { success: false } when mocked balanceOf < required
- Publisher factory dispatch: createPublisher(EVM/TVM/SVM/UNKNOWN) → correct type or throws

Key lessons:
1. Mock inquirer via `jest.mock('inquirer', () => ({ __esModule: true, default: { prompt: jest.fn() } }))` — default import requires __esModule flag
2. Success path with IntentPublished event: use `encodeEventTopics` + `encodeAbiParameters` from viem to build proper receipt
3. QuoteResponse.quoteResponse.fees typed as tuple `[{...}]` — use `as any` with eslint-disable
4. `as jest.Mock` → needs `as unknown as jest.Mock` when source type incompatible
5. `explicit-function-return-type` for functions returning complex inferred types → use eslint-disable

163/163 tests pass. Build passes. Commit: e558d0d

## Next task: TASK-037 (E2E tests — EVM publish and fund on Anvil fork of Base mainnet)


---

# TASK-037 — In Progress

## Plan
1. Add portalAddress to `src/config/chains.ts` for Base mainnet
2. Create `jest.e2e.config.ts` (separate config, no viem mock, uses real DefaultEvmClientFactory)
3. Create `tests/e2e/docker-compose.e2e.yml` (Anvil fork)
4. Create `tests/e2e/setup/global-setup.ts` — docker compose up, wait for Anvil
5. Create `tests/e2e/setup/global-teardown.ts` — docker compose down
6. Create `tests/e2e/setup/anvil-helpers.ts` — fund USDC via storage slot, read balance
7. Create `tests/e2e/evm-publish.e2e.test.ts` — 6 test cases
8. Add test:e2e / test:e2e:ci scripts to package.json
9. Update .github/workflows/ci.yml with e2e job

# TASK-037 — Completed

## Summary
Created full E2E test infrastructure for EVM publish on Anvil fork of Base mainnet:

- `src/config/chains.ts`: Added `portalAddress` for Base mainnet (`0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97`)
- `jest.e2e.config.ts`: Separate config (no viem mock, testTimeout 120s, maxWorkers 1)
- `jest.config.ts`: Added `testPathIgnorePatterns` to exclude `/tests/e2e/` from unit runs
- `tests/e2e/docker-compose.e2e.yml`: Anvil fork with healthcheck
- `tests/e2e/setup/global-setup.ts`: docker compose up + poll for Anvil readiness
- `tests/e2e/setup/global-teardown.ts`: docker compose down (sync, not async)
- `tests/e2e/setup/anvil-helpers.ts`: `anvil_setStorageAt` USDC injection (slot 9), `getUsdcBalance`
- `tests/e2e/evm-publish.e2e.test.ts`: 6 test cases (happy path, USDC deducted, skip approval, validate pass/fail, expired deadline, wrong portal)
- `package.json`: `test:e2e` and `test:e2e:ci` scripts
- `.github/workflows/ci.yml`: E2E job with `BASE_RPC_URL` secret

Key decisions:
1. `globalTeardown` must NOT be async (no await) — `@typescript-eslint/require-await` error
2. `console.log` not allowed — used `process.stderr.write` instead
3. `ReturnType<typeof createPublicClient>` can't hold a Base-specific client (deposit tx type) — used `| any` escape
4. `testPathIgnorePatterns: ['/tests/e2e/']` essential to prevent unit jest config from picking up e2e tests

`pnpm build` passes. `pnpm test`: 163/163 pass. Commit: e44d82a

## Next task: TASK-040 (Create ARCHITECTURE.md)

---

# TASK-040 — Completed

## Summary
Created ARCHITECTURE.md (510 lines) covering all 7 required sections:
1. System overview — ASCII diagram showing CLI → IntentService → Publisher → Portal contracts
2. Universal Address System — 32-byte format, normalize/denormalize lifecycle, encoding per chain type
3. Intent lifecycle — building, encoding, submitting, local storage in intents.json
4. Publisher pattern — BasePublisher contract, key conventions, adding a new publisher
5. Chain Registry — ChainHandler interface, self-registering module pattern, critical import order note
6. Module dependency graph — 4-layer architecture (commands → blockchain → config → core → commons)
7. Quote service integration — URL priority, response format normalization, fallback behavior

Quick reference at end shows complete 10-step checklist for adding a new chain type.

`pnpm build` passes. Commit: 9751186

## Next task: TASK-041 (Create CONTRIBUTING.md)

---

# TASK-042 — Completed

## Summary
Created SECURITY.md (204 lines, 5 sections):
1. Supported versions — 1.x active, <1.0 EOL
2. Reporting vulnerability — GitHub Security Advisory + email, 5-day SLA
3. Security model — key load/pass/sign/discard lifecycle, TVM finally-block cleanup, what is never persisted, RPC note
4. Private key format reference — EVM (0x+64hex), TVM (64hex no prefix), SVM (base58/array/csv)
5. Best practices — dedicated keys, .env in .gitignore, hardware wallet note, key rotation, pnpm audit

`pnpm build`: passes. Commit: 421a85c

## Next task: TASK-043 (Document all public APIs with JSDoc)

# TASK-043 — Completed

## Summary
Added JSDoc to all public APIs across 7 priority files:

**Interfaces documented (field-level):**
- `PublishCommandOptions` — each field (source, destination, privateKey, etc.)
- `ChainConfig` — id, name, env (with NODE_CHAINS_ENV note), type, rpcUrl, portalAddress, proverAddress, nativeCurrency
- `TokenConfig` — symbol, name, decimals, addresses (explained WHY string keys, not bigint)
- `EnvConfig` — each field with format requirements and defaults

**Functions documented (@param/@returns/@example):**
- `createPublishCommand()` — @returns + @example
- `getChainById/ByName/listChains/updatePortalAddresses` — all 4 in chains.ts
- `getTokenBySymbol/getTokenAddress/listTokens/addCustomToken` — all 4 in tokens.ts
- `loadEnvConfig()` — @returns + @throws description

**Classes documented (class-level + constructor + methods):**
- `EvmPublisher` — class doc, constructor @param, publish/getBalance/validate all documented
- `TvmPublisher` — same pattern (noted finally-block key clearing in publish docs)
- `SvmPublisher` — same pattern (noted 3 private key formats)

`pnpm build` passes. `pnpm test`: 163/163 pass. Commit: c4a0705

## Next task: TASK-044 (Improve .env.example and validation)

---

# TASK-045 — In Progress

## Plan
1. `src/commands/publish.ts` — add `.addHelpText('after', ...)` with ≥3 examples, update `--private-key` description
2. `src/commands/status.ts` — add `.addHelpText('after', ...)` with examples
3. `src/commands/config.ts` — add `.addHelpText('after', ...)` with examples
4. `src/core/errors/errors.ts` — improve error message bodies for invalidPrivateKey, invalidAddress, insufficientBalance, unsupportedChain
5. `src/cli/key-provider.ts` — use RoutesCliError.invalidPrivateKey() (richer + typed) instead of plain Error

# TASK-045 — Completed

## Summary
Improved CLI help text and error messages across 5 files:

**Help text added (`.addHelpText('after', ...)`):**
- `publish.ts`: 5 examples + private key format reference block (EVM/TVM/SVM)
- `status.ts`: 4 examples (once/watch/json/verbose) + note about intentHash format
- `config.ts`: 5 examples covering list, set, interactive, profile create/switch/list

**Option descriptions improved:**
- `--private-key`: now mentions all 3 chain formats inline
- `--dry-run`: clarified as "validate without broadcasting"
- `--watch`: clarified as "poll every 10 seconds"
- `--verbose`: clarified what it shows

**Error messages enriched (errors.ts):**
- `invalidPrivateKey`: now includes expected format + env var name + "--private-key" fix
- `invalidAddress`: now includes format hint per chain type
- `insufficientBalance`: now shows required vs available on separate lines + fund instruction
- `unsupportedChain`: now directs user to run "routes-cli chains"

**key-provider.ts**: replaced `new Error(...)` with `RoutesCliError.invalidPrivateKey(chainType)` — typed + richer message.

`pnpm build`: passes. `pnpm test`: 163/163 pass. Commit: 4cb01b3

## Next task: TASK-046 (Set up CHANGELOG and versioning process)

---

# TASK-046 — Completed

## Summary
Set up CHANGELOG and versioning process:
- Installed `@changesets/cli` as dev dependency
- Ran `pnpm changeset init` → created `.changeset/config.json` and `.changeset/README.md`
- Created `CHANGELOG.md` (36 lines) documenting the 1.0.0 initial release: features, supported chains, architecture highlights
- Updated `.github/workflows/ci.yml`: added `tags: ['v*']` trigger + new `release` job (needs: quality, if: tag push) that publishes to npm and creates GitHub Release via softprops/action-gh-release@v2
- Updated `CONTRIBUTING.md` with §7 Release Process covering contributor flow (pnpm changeset) and maintainer flow (pnpm changeset version → tag → CI publishes)

`pnpm build` passes. Commit: c633da7

## Next task: TASK-050 (Implement secure key handling — zeroize on use)

---

# TASK-051 — Completed

## Summary
Created RPC endpoint fallback strategy with exponential backoff:

- `src/core/rpc/rpc-provider.ts`: `withFallback<T>(endpoints, fn)` utility
  - Tries each endpoint up to MAX_ATTEMPTS (3) times
  - Exponential backoff: 500ms, 1000ms between retries per endpoint
  - Logs successful endpoint via `logger.log()`
  - Guards against empty endpoint list
- `src/core/rpc/index.ts`: barrel export
- `src/config/env.ts`: added `TVM_RPC_URL_2` and `SVM_RPC_URL_2` env vars (zod-validated URLs)
  - New fields: `tvmFallbackRpcUrl` (default: https://tron.publicnode.com) and `svmFallbackRpcUrl` (default: https://solana.publicnode.com)

Key ESLint constraints respected:
- `require-await`: withFallback is async and contains `await fn(endpoint)` + `await sleep()`
- `no-console`: used `logger.log()` instead of direct console
- `explicit-function-return-type`: all functions typed
- `sleep()` is NOT async (returns Promise<void> directly) to avoid `require-await` complaint

163/163 tests pass. Build passes. Commit: 2771d8e

## Next task: TASK-052 (Add TypeDoc configuration and generate API docs)

---

# TASK-052 — Completed

## Summary
Added TypeDoc configuration and GitHub Pages deployment:
- Installed `typedoc@0.28.17` as dev dependency
- Created `typedoc.json` with `entryPoints: ["src/index.ts"]`, `out: "docs/api"`, excludePrivate+excludeInternal
  - Note: IMPROVEMENT_PLAN referenced `src/builders/intent-builder.ts` but that directory doesn't exist; used `src/index.ts` as the valid public API entry point
- Added `"docs": "typedoc"` script to package.json — `pnpm docs` generates HTML docs in `docs/api/`
- Added `docs/api/` to `.gitignore` (generated artifacts)
- Added `docs` job to `.github/workflows/ci.yml`: triggers on tag push, runs `pnpm docs`, deploys `docs/api` to GitHub Pages via `actions/deploy-pages@v4`

Build passes. Commit: 6de90e7

## Next task: TASK-053 (Add chain ID allowlist validation)

---

# TASK-053 — Completed

## Summary
Added chain ID allowlist validation to prevent publishing to unknown chains before any RPC call:

**`src/core/chain/chain-registry.ts`**: Added `registeredChainIds: Set<bigint>`, `registerChainId(chainId)`, and `isRegistered(chainId)` to `ChainRegistry`

**`src/blockchain/base-publisher.ts`**: Added `runPreflightChecks(sourceChainId: bigint): void` protected method — uses `getChainById` from config to validate chain ID; throws `RoutesCliError.unsupportedChain` if not found. Added imports for `getChainById` and `RoutesCliError`.

**`src/blockchain/evm-publisher.ts`, `tvm-publisher.ts`, `svm-publisher.ts`**: Each calls `this.runPreflightChecks(source)` at the top of `publish()`, BEFORE `runSafely`. This ensures the check happens before any key derivation or RPC calls.

**`src/cli/prompts/intent-prompts.ts`**: Upgraded `throw new Error(...)` → `throw RoutesCliError.unsupportedChain(...)` for both source and destination CLI flag lookup failures.

**`src/index.ts`**: Added `listChains().forEach(chain => chainRegistry.registerChainId(chain.id))` after `ConfigService.fromEnvironment()` to populate the allowlist at startup.

Key decisions:
1. `runPreflightChecks` uses `getChainById` (not `chainRegistry.isRegistered`) — avoids circular imports (core/chain can't import from config)
2. `chainRegistry.isRegistered` uses a separate Set populated from index.ts — exposed as a public API for external consumers
3. Preflight check is BEFORE `runSafely` so unknown chain ID throws immediately (not wrapped as `{ success: false }`)
4. Tests still pass without modification because `getChainById` always has `CHAIN_CONFIGS` populated at module load time

163/163 tests pass. Build passes.
