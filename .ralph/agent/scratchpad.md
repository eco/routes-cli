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
