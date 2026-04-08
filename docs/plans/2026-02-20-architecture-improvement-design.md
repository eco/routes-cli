# Architecture Improvement Design

**Date:** 2026-02-20
**Scope:** Transformative redesign — all layers, CLI only (no SDK surface)
**Approach:** Service Container via NestJS standalone + `nestjs-commander`

---

## Background

The current architecture was researched and documented in `ARCHITECTURE.md`. It identified 12 structural issues across four dimensions:

- **Correctness / reliability** — missing intent persistence, EVM-only status, missing portal addresses on most production chains
- **Developer experience** — side-effect import initialization, monolithic `IntentService`, missing `IntentBuilder`, hardcoded values
- **Security** — `KeyHandle` async race condition, TronWeb singleton state, no EVM RPC fallback
- **Extensibility** — chain type logic scattered across directories, no clean boundary for adding new chains

This design resolves all 12 issues through a transformative restructure using NestJS as the dependency injection container.

---

## Decisions

| Question | Decision |
|----------|----------|
| Scope | Transformative — clean break, not incremental |
| Output | CLI only — no public SDK surface |
| DI Framework | NestJS standalone (`createApplicationContext`) + `nestjs-commander` |
| Prompt library | Keep `inquirer` — wrapped in injectable `PromptService` |
| Test coverage | Not a deliverable of this effort — design for testability, write tests later |
| Phasing | Comprehensive — single design spec, implemented as one effort |

---

## Module Structure

The application decomposes into focused NestJS modules. `CoreModule` was deliberately excluded — types, errors, and security utilities are plain TypeScript in `shared/` and imported directly.

```
AppModule
  imports: [ConfigModule, BlockchainModule, IntentModule,
            QuoteModule, StatusModule, CliModule]

ConfigModule        (global) — env validation, typed config access, token definitions
BlockchainModule    (global) — everything chain-related: registry, handlers, publishers,
                               encoding, address normalization, chains config, RPC fallback
IntentModule                — IntentBuilder (pure), IntentStorage (persistence)
QuoteModule                 — QuoteService (network, no I/O side effects)
StatusModule                — StatusService (all chain types)
CliModule           (leaf)  — commands, PromptService, DisplayService
```

**`ConfigModule` and `BlockchainModule` are `@Global()`** — available everywhere without explicit import in every module.

**`CliModule` is the only leaf** — it imports everything but nothing imports it. CLI concerns can never leak into business logic.

---

## Directory Structure

```
src/
├── main.ts                          # bootstrap() only
├── app.module.ts                    # root AppModule
│
├── shared/                          # plain TypeScript — no NestJS module
│   ├── types/
│   │   ├── intent.interface.ts      # Intent, Route, Reward interfaces
│   │   ├── universal-address.ts     # UniversalAddress branded type + helpers
│   │   └── blockchain-addresses.ts  # EvmAddress, TronAddress, SvmAddress
│   ├── security/
│   │   └── key-handle.ts            # KeyHandle with sync use() + async useAsync()
│   └── errors/
│       └── routes-cli-error.ts      # RoutesCliError + ErrorCode enum
│
├── config/                          # ConfigModule (global)
│   ├── config.module.ts
│   ├── config.service.ts            # typed getters: getRpcUrl(), getDeadlineOffset(), etc.
│   ├── tokens.config.ts             # token definitions (USDC, USDT, bUSDC, bUSDT)
│   └── validation/
│       └── env.schema.ts            # Zod schemas for all env vars
│
├── blockchain/                      # BlockchainModule (global)
│   ├── blockchain.module.ts
│   ├── address-normalizer.service.ts # normalize() / denormalize() — injectable
│   ├── chain-registry.service.ts    # explicit bootstrap(), isRegistered()
│   ├── chain-handler.interface.ts   # ChainHandler interface
│   ├── chains.config.ts             # all chain definitions (prod + dev)
│   ├── chains.service.ts            # getChainById(), listChains(), resolveChain()
│   ├── base.publisher.ts            # abstract BasePublisher
│   ├── publisher-factory.service.ts # createPublisher(chainType, rpcUrl)
│   ├── rpc.service.ts               # withFallback(primary, secondary) — all chain types
│   ├── encoding/
│   │   ├── portal-encoder.service.ts   # ABI (EVM/TVM) + Borsh (SVM) encoding
│   │   └── intent-converter.service.ts # UniversalAddress → chain-native conversion
│   ├── abis/
│   │   ├── portal.abi.ts
│   │   └── erc20.abi.ts
│   ├── evm/                         # all EVM logic together
│   │   ├── evm-chain-handler.ts     # EVM address normalize/denormalize
│   │   ├── evm.publisher.ts         # viem PublicClient + WalletClient
│   │   └── evm-client-factory.ts    # injectable factory for testability
│   ├── tvm/                         # all TVM logic together
│   │   ├── tvm-chain-handler.ts     # Tron address normalize/denormalize
│   │   ├── tvm.publisher.ts         # per-call TronWeb instantiation
│   │   └── tvm-client-factory.ts
│   └── svm/                         # all SVM logic together
│       ├── svm-chain-handler.ts     # Solana address normalize/denormalize
│       ├── svm.publisher.ts         # @solana/web3.js + Anchor
│       ├── svm-client-factory.ts
│       ├── pda-manager.ts           # vault, proof, withdrawn_marker PDA derivation
│       ├── transaction-builder.ts   # buildFundingTransaction()
│       └── solana-client.ts         # setupAnchorProgram(), connection config
│
├── intent/                          # IntentModule
│   ├── intent.module.ts
│   ├── intent-builder.service.ts    # pure data assembly — no I/O, no prompts
│   └── intent-storage.service.ts    # ~/.routes-cli/intents.json persistence
│
├── quote/                           # QuoteModule
│   ├── quote.module.ts
│   └── quote.service.ts             # endpoint selection, request, response normalization
│
├── status/                          # StatusModule
│   ├── status.module.ts
│   └── status.service.ts            # status checking for EVM + TVM + SVM
│
├── cli/                             # CliModule (leaf)
│   ├── cli.module.ts
│   ├── services/
│   │   ├── prompt.service.ts        # injectable inquirer wrapper
│   │   └── display.service.ts       # injectable ora + cli-table3 wrapper
│   └── commands/
│       ├── publish.command.ts       # @Command('publish')
│       ├── status.command.ts        # @Command('status')
│       ├── config.command.ts        # @Command('config')
│       ├── chains.command.ts        # @Command('chains')
│       └── tokens.command.ts        # @Command('tokens')
│
└── commons/
    └── utils/                       # shared pure utilities (no NestJS)
```

---

## Service Designs

### `ConfigService` (ConfigModule)

Wraps `@nestjs/config` with Zod validation. All values are typed — no raw `process.env` access outside this service.

```typescript
@Injectable()
class ConfigService {
  getEvmPrivateKey(): Hex | undefined
  getTvmPrivateKey(): string | undefined
  getSvmPrivateKey(): string | undefined
  getRpcUrl(chainType: ChainType, variant: 'primary' | 'fallback'): string
  getQuoteEndpoint(): string          // selects SOLVER_URL, preprod, or production
  getDeadlineOffsetSeconds(): number  // default: 9000 (2.5h), was hardcoded
  getDappId(): string                 // default: 'eco-routes-cli', was hardcoded
  isProdEnvironment(): boolean
}
```

### `ChainRegistryService` (BlockchainModule)

Explicit initialization — no side-effect imports. Bootstrapped inside `BlockchainModule.onModuleInit()`.

```typescript
@Injectable()
class ChainRegistryService implements OnModuleInit {
  onModuleInit() {
    this.bootstrap([
      new EvmChainHandler(),
      new TvmChainHandler(),
      new SvmChainHandler(),
    ]);
  }

  bootstrap(handlers: ChainHandler[]): void
  get(chainType: ChainType): ChainHandler
  isRegistered(chainId: bigint): boolean
  registerChainId(chainId: bigint): void
}
```

### `AddressNormalizerService` (BlockchainModule)

Same API as the current static `AddressNormalizer` class, now injectable. Delegates to `ChainRegistryService`.

```typescript
@Injectable()
class AddressNormalizerService {
  normalize(address: BlockchainAddress, chainType: ChainType): UniversalAddress
  denormalize(address: UniversalAddress, chainType: ChainType): BlockchainAddress
  denormalizeToEvm(address: UniversalAddress): EvmAddress
  denormalizeToTvm(address: UniversalAddress): TronAddress
  denormalizeToSvm(address: UniversalAddress): SvmAddress
}
```

### `RpcService` (BlockchainModule)

Uniform RPC fallback for all chain types — fixes the current EVM gap.

```typescript
@Injectable()
class RpcService {
  getUrl(chain: ChainConfig): string   // applies withFallback(primary, secondary)
  withFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T>
}
```

### `QuoteService` (QuoteModule)

Pure network concern — extracted from the current monolithic `IntentService`. No prompts, no intent assembly.

```typescript
@Injectable()
class QuoteService {
  async getQuote(params: QuoteRequest): Promise<QuoteResult>
  // Normalizes both v3 wrapped and solver-v2 array response formats
  // Throws QuoteServiceError on failure — caller decides fallback behavior
}
```

### `IntentBuilder` (IntentModule)

Pure data assembly — no I/O, no network calls, no prompts. Takes explicit inputs, returns immutable data.

```typescript
@Injectable()
class IntentBuilder {
  buildReward(params: RewardParams): Intent['reward']
  buildManualRoute(params: ManualRouteParams): Intent['route']
  buildFromQuote(params: QuoteRouteParams): Intent['route']
}
```

### `IntentStorage` (IntentModule)

Implements the missing `~/.routes-cli/intents.json` persistence.

```typescript
@Injectable()
class IntentStorage {
  async save(intent: Intent, result: PublishResult): Promise<void>
  async findByHash(intentHash: string): Promise<StoredIntent | null>
  async listAll(): Promise<StoredIntent[]>
  async markRefunded(intentHash: string): Promise<void>
}
```

### `StatusService` (StatusModule)

Replaces the EVM-only `status` command. Routes to the correct publisher based on chain type.

```typescript
@Injectable()
class StatusService {
  async getStatus(intentHash: string, chain: ChainConfig): Promise<IntentStatus>
  async watch(intentHash: string, chain: ChainConfig, onUpdate: (s: IntentStatus) => void): Promise<void>
}
```

### `PromptService` (CliModule)

Injectable wrapper around inquirer. All prompt logic centralized here.

```typescript
@Injectable()
class PromptService {
  async selectChain(chains: ChainConfig[], message: string): Promise<ChainConfig>
  async selectToken(tokens: TokenConfig[], label: string): Promise<TokenSelection>
  async inputAmount(symbol: string): Promise<{ raw: string; parsed: bigint }>
  async inputAddress(chain: ChainConfig, label: string): Promise<string>
  async confirmPublish(summary: IntentSummary): Promise<boolean>
  async inputManualRoute(chain: ChainConfig): Promise<ManualRouteInput>
  async confirm(message: string, defaultValue?: boolean): Promise<boolean>
}
```

### `DisplayService` (CliModule)

Injectable wrapper around `ora` and `cli-table3`.

```typescript
@Injectable()
class DisplayService {
  spinner(text: string): void
  succeed(text?: string): void
  fail(text?: string): void
  displayIntentSummary(summary: IntentSummary): void
  displayTransactionResult(result: PublishResult): void
  displayTable(headers: string[], rows: string[][]): void
  displayChains(chains: ChainConfig[]): void
  displayTokens(tokens: TokenConfig[]): void
}
```

---

## Security Changes

### AsyncKeyHandle — fixes async zeroization race

```typescript
class KeyHandle {
  private buffer: Buffer;

  // Sync variant — kept for synchronous derivations
  use<T>(fn: (key: string) => T): T {
    try { return fn(this.buffer.toString('utf8')); }
    finally { this.buffer.fill(0); }
  }

  // Async variant — zeroes buffer only after the promise resolves/rejects
  async useAsync<T>(fn: (key: string) => Promise<T>): Promise<T> {
    try { return await fn(this.buffer.toString('utf8')); }
    finally { this.buffer.fill(0); }
  }
}
```

Publishers call `keyHandle.useAsync()` directly. No second `KeyHandle` construction needed.

### TronWeb per-call instantiation — fixes singleton concurrency risk

```typescript
// tvm.publisher.ts
async publish(..., keyHandle: KeyHandle): Promise<PublishResult> {
  return keyHandle.useAsync(async (key) => {
    const tronWeb = this.tvmClientFactory.create(this.rpcUrl, key);
    return this.executePublish(tronWeb, ...);
    // tronWeb scoped to this call — no shared state, no key clearing needed
  });
}
```

### Chain ID allowlist via `ChainRegistryService`

All chain IDs registered during `BlockchainModule.onModuleInit()`. `BasePublisher.runPreflightChecks()` injects `ChainRegistryService` and calls `isRegistered(sourceChainId)`.

---

## Data Flow — Publish Intent

```
nestjs-commander parses args + options
        │
        ▼
PublishCommand.run(params, options)
        │
        ├─► PromptService.selectChain()       → ChainsService.listChains()
        ├─► PromptService.selectChain()       → destination chain
        ├─► PromptService.selectToken()       → route token on dest
        ├─► PromptService.selectToken()       → reward token on source
        ├─► PromptService.inputAmount()       → reward amount as bigint
        ├─► PromptService.inputAddress()      → recipient → normalize
        │
        ├─► KeyHandle.useAsync(key => {
        │     senderAddress = getWalletAddress(chainType, key)
        │     return publisher.publish(..., key)   ← full async publish inside useAsync
        │   })
        │
        ├─► QuoteService.getQuote(params)
        │     └─► on failure: PromptService.inputManualRoute()
        │
        ├─► IntentBuilder.buildReward(params)        ← pure, no I/O
        │
        ├─► DisplayService.displayIntentSummary()
        ├─► PromptService.confirmPublish()
        │
        ├─► RpcService.getUrl(sourceChain)           ← withFallback applied here
        ├─► PublisherFactory.create(chainType, url)
        │
        ├─► publisher.publish(source, dest, reward, encodedRoute, keyHandle, portal)
        │
        ├─► IntentStorage.save(intent, result)       ← always persisted
        │
        └─► DisplayService.displayTransactionResult(result)
```

---

## Module Dependency Graph

```
ConfigModule (global)
  exports: [ConfigService]
  imports: []

BlockchainModule (global)
  exports: [AddressNormalizerService, ChainsService, ChainRegistryService,
            PublisherFactory, RpcService]
  imports: [ConfigModule]

QuoteModule
  exports: [QuoteService]
  imports: [ConfigModule, BlockchainModule]

IntentModule
  exports: [IntentBuilder, IntentStorage]
  imports: [BlockchainModule]

StatusModule
  exports: [StatusService]
  imports: [BlockchainModule]

CliModule  ← leaf, nothing imports this
  exports: []
  imports: [BlockchainModule, ConfigModule, IntentModule,
            QuoteModule, StatusModule]
```

---

## Issues Resolved

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Side-effect import order dependency | `ChainRegistryService.onModuleInit()` bootstrap |
| 2 | KeyHandle async race condition | `useAsync()` awaits before zeroing |
| 3 | No intent persistence | `IntentStorage` service |
| 4 | IntentService mixes concerns | Dissolved into `IntentBuilder` + `QuoteService` + `PublishCommand` |
| 5 | No standalone IntentBuilder | `IntentBuilder` as pure injectable service |
| 6 | Missing portal addresses on production chains | Populate in `chains.config.ts` as part of implementation |
| 7 | Status command EVM-only | `StatusService` routes to correct publisher by chain type |
| 8 | RPC fallback EVM-only | `RpcService.withFallback()` uniform across all chain types |
| 9 | No tests | Not a deliverable — designed for testability via injection |
| 10 | Hardcoded dAppID | `ConfigService.getDappId()` |
| 11 | TronWeb singleton state | Per-call `TronWeb` instantiation in `TvmPublisher` |
| 12 | Hardcoded route deadline | `ConfigService.getDeadlineOffsetSeconds()` |

---

## New Dependencies Required

| Package | Purpose |
|---------|---------|
| `@nestjs/core` | NestJS IoC container |
| `@nestjs/common` | Decorators (`@Injectable`, `@Module`, etc.) |
| `@nestjs/config` | Environment config with validation |
| `nestjs-commander` | CLI command decorators (`@Command`, `@Option`) |
| `reflect-metadata` | Required by NestJS decorators (may already be present) |

**Packages to remove:**
| Package | Replaced by |
|---------|-------------|
| `commander` | `nestjs-commander` |

---

## Implementation Notes

1. `tsconfig.json` already has `experimentalDecorators: true` and `emitDecoratorMetadata: true` — NestJS decorator support is ready
2. `nestjs-commander` wraps Commander internally — migration from Commander to `nestjs-commander` is straightforward
3. All existing inquirer prompts migrate verbatim into `PromptService` methods
4. All existing `ora` / `cli-table3` calls migrate verbatim into `DisplayService` methods
5. Chain type subdirectories (`evm/`, `tvm/`, `svm/`) already exist in current codebase — files move, not rewrite
6. `shared/` replaces the need for `src/core/` as a NestJS module — same files, no NestJS wiring
