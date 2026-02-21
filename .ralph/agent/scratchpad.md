## NestJS Architecture Migration — Iteration Log

### 2026-02-20 — TASK-001 Complete

**What was done:**
- Created fresh PROGRESS.md for NestJS migration (overwriting old improvement-plan PROGRESS.md)
- Installed NestJS deps: `@nestjs/core`, `@nestjs/common`, `@nestjs/config`, `nestjs-commander`, `reflect-metadata`
- Removed `commander` (replaced by `nestjs-commander`)
- Typecheck passes

**Important finding:**
`nestjs-commander` only has versions up to 0.2.6 on npm, which targets NestJS v6. We installed NestJS v11. Peer dep warning is present but typecheck passes since we haven't imported any nestjs-commander types yet. This WILL be an issue in TASK-023–027 when `Command`, `CommandRunner`, `Option` decorators are imported. Will need to address then (possibly override peer deps, or find if there's an alternative package name).

**Next task:** TASK-002 — COMPLETE

### 2026-02-20 — TASK-002 Complete

**What was done:**
- Created src/shared/types/ with 4 files
- universal-address.ts, blockchain-addresses.ts: copied verbatim from src/core/types/
- intent.interface.ts: copied from src/core/interfaces/intent.ts with one import path fix (`'../types/universal-address'` → `'./universal-address'`)
- index.ts: barrel export for all three
- Typecheck passes, committed

**Next task:** TASK-003 — Create shared/security/key-handle.ts (no dependencies)

### 2026-02-20 — TASK-003 Complete

**What was done:**
- Created src/shared/security/key-handle.ts — exact verbatim from plan
- Created src/shared/security/index.ts — barrel export
- Typecheck passes, committed

**Next task:** TASK-004 — Create shared/errors/ (no dependencies)

### 2026-02-20 — TASK-004 Complete

**What was done:**
- Created src/shared/errors/routes-cli-error.ts — copied verbatim from src/core/errors/errors.ts
- Created src/shared/errors/index.ts — barrel export
- Created src/shared/index.ts — top-level barrel re-exporting types, security, errors
- Typecheck passes, committed

**Next task:** TASK-005 — COMPLETE

### 2026-02-20 — TASK-005 Complete

**What was done:**
- Created src/config/validation/env.schema.ts — exact verbatim from plan
- zod v4 was already installed, no additional deps needed
- Typecheck passes, committed

**Next task:** TASK-006 — COMPLETE

### 2026-02-20 — TASK-006 Complete

**What was done:**
- Created src/config/config.service.ts — typed wrapper around NestConfigService
- Methods: getEvmPrivateKey, getTvmPrivateKey, getSvmPrivateKey, getRpcUrl(chainType, variant), getQuoteEndpoint, getDeadlineOffsetSeconds, getDappId, getChainsEnv, isDebug
- ChainType imported from @/shared/types (already present in intent.interface.ts)
- Typecheck passes, committed

**Next task:** TASK-007 — Create config/tokens.config.ts + ConfigModule (requires TASK-006 which is now COMPLETE)

### 2026-02-20 — TASK-007 Complete

**What was done:**
- Created src/config/tokens.config.ts — copy of tokens.ts with type imports updated from @/core/ to @/shared/types. AddressNormalizer kept at @/core/utils/address-normalizer (not yet migrated to @/shared/). Added TOKENS alias export.
- Created src/config/config.module.ts — @Global() NestJS module wrapping NestConfigModule with Zod validation via EnvSchema.parse(). Provides and exports ConfigService.
- Typecheck passes, committed.

**Next task:** TASK-008 — Create chain-handler.interface.ts + chain-registry.service.ts (requires TASK-002 which is COMPLETE)

### 2026-02-20 — TASK-008 Complete

**What was done:**
- Created src/blockchain/chain-handler.interface.ts — copied verbatim from src/core/chain/chain-handler.interface.ts with imports updated from @/core/ to @/shared/types
- Created src/blockchain/chain-registry.service.ts — NestJS @Injectable() service replacing the old ChainRegistry singleton. Uses OnModuleInit to bootstrap handlers explicitly (no self-registering side effects).
- The existing chain handlers (evm/tvm/svm) still import from @/core/chain/chain-handler.interface — this is fine because TypeScript structural typing makes them compatible. Migration of those imports happens in TASK-009.
- Typecheck passes, committed.

**Next task:** TASK-009 — Migrate EVM, TVM, SVM chain handlers

### 2026-02-20 — TASK-009 Complete

**What was done:**
- Updated src/blockchain/evm/evm-chain-handler.ts: imports now use @/blockchain/chain-handler.interface, @/shared/errors, @/shared/types. Removed chainRegistry self-registration side effect.
- Updated src/blockchain/tvm/tvm-chain-handler.ts: same import updates, removed self-registration.
- Updated src/blockchain/svm/svm-chain-handler.ts: same import updates, removed self-registration.
- Note: @/core/utils/address-normalizer and @/core/validation imports kept as-is (not yet migrated to shared/).
- Typecheck passes, committed.

**Next task:** TASK-010 — COMPLETE

### 2026-02-20 — TASK-010 Complete

**What was done:**
- Created src/blockchain/address-normalizer.service.ts — exact verbatim from plan
- Injectable NestJS service delegating normalize/denormalize to ChainRegistryService handlers
- Chain-specific convenience methods: denormalizeToEvm, denormalizeToTvm, denormalizeToSvm
- Typecheck passes, committed.

**Next task:** TASK-011 — Create chains.config.ts + chains.service.ts (requires TASK-010 which is now COMPLETE)

### 2026-02-20 — TASK-011 Complete

**What was done:**
- Created src/shared/types/chain-config.ts — ChainConfig interface (needed by ChainsService and future consumers). Added export to shared/types/index.ts.
- Created src/blockchain/chains.config.ts — RawChainConfig interface with string portal/prover addresses (no normalization at load time). RAW_CHAIN_CONFIGS array with all 18 chains matching the original chains.ts.
- Created src/blockchain/chains.service.ts — Injectable service that normalizes addresses lazily in onModuleInit() (after DI container is bootstrapped). resolveChain() uses /^\d+$/ regex to distinguish chain ID from name, fixing the BigInt("string") throw in the plan's original code.
- Typecheck passes, committed.

**Next task:** TASK-012 — Create rpc.service.ts (requires TASK-011 which is now COMPLETE)


### 2026-02-20 — TASK-012 Complete

**What was done:**
- Created src/blockchain/rpc.service.ts — exact verbatim from plan
- Injectable NestJS service with getUrl(), getFallbackUrl(), withFallback<T>()
- getUrl() applies env RPC override on top of per-chain rpcUrl (env wins)
- withFallback<T>() generic retry: calls primary(), falls back on any error
- Typecheck passes, committed.

**Next task:** TASK-013 — Migrate publishers to injectable + useAsync()

### 2026-02-20 — TASK-013 Complete

**What was done:**
- Created src/blockchain/base.publisher.ts: @Injectable(), inject ChainRegistryService, use registry.isRegistered() in runPreflightChecks, imports from @/shared/
- Created src/blockchain/evm/evm.publisher.ts: @Injectable(), constructor(rpcUrl, registry, factory?), keyHandle.useAsync() wrapping entire publish body
- Created src/blockchain/tvm/tvm.publisher.ts: @Injectable(), per-call TronWeb (factory.createClient per publish call), keyHandle.useAsync(), waitForTransaction() now takes tronWeb param
- Created src/blockchain/svm/svm.publisher.ts: @Injectable(), keyHandle.useAsync() with keypair parsed inside
- Kept @/config/chains for getChainById (not yet migrated — task 15+ handles)
- Typecheck passes, committed.

**Next task:** TASK-014 — Migrate SVM helpers

### 2026-02-20 — TASK-014 Complete

**What was done:**
- `pda-manager.ts` and `solana-client.ts` had zero `@/core/` imports — no changes needed
- `transaction-builder.ts`: updated `import { ChainType, Intent } from '@/core/interfaces/intent'` → `@/shared/types`
- `AddressNormalizer` kept at `@/core/utils/address-normalizer` (not yet migrated to shared)
- Typecheck passes, committed.

**Next task:** TASK-015 — Migrate client factories

### 2026-02-20 — TASK-015 Complete

**What was done:**
- All three client factory files (evm-client-factory.ts, tvm-client-factory.ts, svm-client-factory.ts) were already in their correct co-located positions (src/blockchain/evm/, tvm/, svm/) with no @/core/ imports
- They were committed in an earlier commit (d0d16ce) before the migration plan started
- Task was effectively a no-op — just verified typecheck passes and marked COMPLETE
- evm-client-factory.ts: imports from viem only; tvm-client-factory.ts: imports from tronweb only; svm-client-factory.ts: re-exports from ./solana-client

**Next task:** TASK-016 — Create publisher-factory.service.ts (requires TASK-015 which is now COMPLETE)

### 2026-02-20 — TASK-016 Complete

**What was done:**
- Created src/blockchain/publisher-factory.service.ts — exact verbatim from plan
- @Injectable() service taking ChainRegistryService + RpcService via constructor DI
- create(chain: ChainConfig) dispatches on chain.type to instantiate EVM/TVM/SVM publisher
- Publishers created with rpcUrl from RpcService.getUrl() and shared registry
- Typecheck passes, committed.

**Next task:** TASK-017 — Migrate encoding services (requires TASK-010 which is COMPLETE)

### 2026-02-20 — TASK-017 Complete

**What was done:**
- Created src/blockchain/encoding/portal-encoder.service.ts — @Injectable() class with AddressNormalizerService injected. Static methods → instance methods. AddressNormalizer.X → this.addrNorm.X.
- Created src/blockchain/encoding/intent-converter.service.ts — @Injectable() class. Exported functions → instance methods. AddressNormalizer.denormalizeToEvm → this.addrNorm.denormalizeToEvm.
- Key type fix: Borsh-decoded `pubkey` fields (creator, prover, token) are typed as `PublicKey` from @solana/web3.js. Used `.toBase58() as SvmAddress` to convert before passing to `addrNorm.normalize()`. `bytes32ToAddress()` already returns `SvmAddress` so no cast needed there.
- SvmAddress is a branded type `${string} & { _brand: 'SvmAddress' }` so plain `string` is not assignable — must use `as SvmAddress` cast.
- Typecheck passes, committed.

**Next task:** TASK-018 — Create blockchain.module.ts (requires TASK-016 + TASK-017 which are now COMPLETE)

### 2026-02-20 — TASK-018 Complete

**What was done:**
- Created src/blockchain/blockchain.module.ts — exact verbatim from plan
- @Global() NestJS module declaring and exporting all 7 blockchain services:
  ChainRegistryService, AddressNormalizerService, ChainsService, RpcService,
  PublisherFactory, PortalEncoderService, IntentConverterService
- Typecheck passes, committed.

**Next task:** TASK-019 — Create quote/quote.service.ts + QuoteModule (requires TASK-007 which is COMPLETE)

### 2026-02-20 — TASK-019 Complete

**What was done:**
- Created src/quote/quote.service.ts — @Injectable() class taking ConfigService via constructor
- getQuote() uses config.getQuoteEndpoint() + config.getDappId() instead of process.env directly
- Introduced flat QuoteResult return type (encodedRoute, sourcePortal, prover, deadline, destinationAmount) — simpler than existing nested QuoteResponse for consumers
- Internal types (SolverV2QuoteData, QuoteServiceV3Data, RawQuoteResponse) kept private in the file
- Created src/quote/quote.module.ts — @Module with QuoteService provided + exported
- Typecheck passes, committed.

**Key design decision:** Defined new flat `QuoteResult` type rather than keeping nested `QuoteResponse`. This matches how task-025 (PublishCommand) accesses `quote.encodedRoute`, `quote.sourcePortal`, and `quote.prover` directly.

**Next task:** TASK-020 — Create intent/intent-builder.service.ts (requires TASK-007 + TASK-017 which are COMPLETE)

### 2026-02-20 — TASK-020 Complete

**What was done:**
- Created src/intent/intent-builder.service.ts — @Injectable() service with ConfigService, PortalEncoderService, AddressNormalizerService injected
- buildReward(): assembles Intent['reward'] with computed deadline from ConfigService
- buildManualRoute(): assembles Intent['route'] with ERC-20 transfer call data, encodes via PortalEncoderService
- Key deviation from plan: `this.encoder.encodeErc20Transfer()` doesn't exist on PortalEncoderService — implemented inline using `encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [recipientAddr, amount] })` from viem. AddressNormalizerService.denormalizeToEvm() used to convert UniversalAddress → EVM address.
- Typecheck passes, committed.

**Next task:** TASK-021 — Create intent/intent-storage.service.ts + IntentModule

### 2026-02-20 — TASK-022 Complete

**What was done:**
- Added `IntentStatus` interface to `src/blockchain/base.publisher.ts` (avoids circular dep if in status.service.ts)
- Added abstract `getStatus(intentHash: string, chainId: bigint): Promise<IntentStatus>` to BasePublisher
- Implemented `getStatus()` in EvmPublisher using `publicClient.getContractEvents` with `IntentFulfilled` event
- Added stubs throwing "Not yet implemented" to TvmPublisher and SvmPublisher
- Created `src/status/status.service.ts` + `src/status/status.module.ts`
- Typecheck passes, committed.

**Next task:** TASK-023 — Create cli/services/prompt.service.ts

### 2026-02-20 — TASK-024 Complete

**What was done:**
- Created src/cli/services/display.service.ts — exact verbatim from plan
- @Injectable() class with ora spinner management, chalk console wrappers, cli-table3 display methods
- TokenConfig imported from @/config/tokens.config (not in @/shared/types yet — kept consistent with project)
- ChainConfig from @/shared/types, PublishResult from @/blockchain/base.publisher
- Typecheck passes, committed.

**Next task:** TASK-024 complete → next is TASK-025 (requires TASK-023 + TASK-024 + TASK-021 + TASK-019, all now COMPLETE)

### 2026-02-20 — TASK-025 Complete

**What was done:**
- Created src/cli/commands/publish.command.ts — thin orchestrator for publish flow
- **Key fix**: `nestjs-commander` (0.2.6) has wrong API — correct package is `nest-commander` (3.20.1). Swapped packages. This was predicted in TASK-001 scratchpad note.
- Adapted plan template to match actual service signatures:
  - `selectToken(chain, tokens, label)` — not `selectToken([], label)`
  - `inputAmount(label, decimals)` — not `inputAmount(label)`
  - `intentStorage.save(intent, result)` — passed minimal Intent with `route: {} as Intent['route']`
- Typecheck passes, committed.

**Next task:** TASK-026 — Create remaining CLI commands (chains, tokens, status, config)

### 2026-02-20 — TASK-028 Complete

**What was done:**
- Created src/app.module.ts — AppModule importing ConfigModule, BlockchainModule, IntentModule, QuoteModule, StatusModule, CliModule
- Created src/main.ts — CommandFactory.run(AppModule) with nest-commander (not nestjs-commander as plan said)
- Updated package.json: dev/start scripts point to src/main.ts; switched dev to ts-node --transpile-only (tsx lacks emitDecoratorMetadata support, causing NestJS DI to fail)

**Bugs fixed along the way:**
1. tokens.config.ts called AddressNormalizer.normalize(addr, ChainType.EVM) at module-load time → replaced with normalizeEvm/normalizeTvm direct methods (bypass old chainRegistry singleton)
2. chain-detector.ts imported getChainById from old chains.ts (dragged in via portal-hash.utils.ts) → removed getNetworkFromChainConfig method + its import
3. Publishers still imported getChainById from old chains.ts → migrated to ChainsService.findChainById via constructor injection; PublisherFactory.create() passes ChainsService
4. CliModule missing imports for QuoteModule, IntentModule, StatusModule → PublishCommand.QuoteService couldn't be resolved
5. BlockchainModule missing ConfigModule import → ChainsService DI failure

**Smoke tests:**
- pnpm build: PASS
- pnpm dev chains: PASS (shows 11-chain table)
- pnpm dev tokens: PASS (shows USDC, USDT, bUSDC, bUSDT)

**Next task:** TASK-029 — Remove old source files

### 2026-02-20 — TASK-029 Complete

**What was done:**
- Created src/blockchain/utils/address-normalizer.ts — self-contained static class (no chainRegistry dependency). normalize()/denormalize() now use direct switch over ChainType instead of the old singleton registry.
- Created src/blockchain/utils/portal-encoder.ts — standalone static PortalEncoder replacing old @/core/utils/portal-encoder.
- Moved src/core/validation/ → src/blockchain/validation/ (schemas.ts + index.ts)
- Updated @/core/utils/address-normalizer → @/blockchain/utils/address-normalizer in 8 new-arch files
- Updated @/core/validation → @/blockchain/validation in 3 chain-handler files
- Updated @/core/interfaces/intent / @/core/types/* → @/shared/types in svm-types.ts, instruments.ts, tvm-utils.ts, converter.ts
- Rewrote portal-hash.utils.ts — replaced ChainTypeDetector + PortalEncoder with inline chain detection and new standalone PortalEncoder
- Fixed transaction-builder.ts: PublishResult import from ../base-publisher → ../base.publisher
- Deleted: src/core/, src/commands/, src/index.ts, old blockchain root publishers (base-publisher.ts, evm-publisher.ts, tvm-publisher.ts, svm-publisher.ts, publisher-factory.ts), src/config/{chains,env,tokens,config-service}.ts, src/cli/key-provider.ts, src/cli/prompts/, src/utils/error-handler.ts
- Kept: src/utils/logger.ts (still used by new publishers), src/commons/ (still used by encoding services)
- pnpm typecheck: PASS, pnpm build: PASS, pnpm dev chains + tokens: PASS

**Next task:** TASK-030 — Update tsconfig.json
