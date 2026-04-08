# Architecture Improvement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the routes-cli codebase into a clean NestJS-based architecture that resolves all 12 structural issues identified in ARCHITECTURE.md.

**Architecture:** NestJS standalone application using `nestjs-commander` for CLI commands. All business logic lives in focused injectable services organized into domain modules (`BlockchainModule`, `ConfigModule`, `IntentModule`, `QuoteModule`, `StatusModule`). The `CliModule` is the leaf — it consumes all services but nothing imports it. Plain TypeScript in `shared/` replaces the old `CoreModule`.

**Tech Stack:** NestJS (`@nestjs/core`, `@nestjs/common`, `@nestjs/config`), `nestjs-commander`, `inquirer`, `ora`, `cli-table3`, `viem`, `tronweb`, `@solana/web3.js`, `@coral-xyz/anchor`, `zod`

**Design doc:** `docs/plans/2026-02-20-architecture-improvement-design.md`

---

## Phase 1: Foundation & Dependencies

### Task 1: Install NestJS dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install new dependencies**

```bash
pnpm add @nestjs/core @nestjs/common @nestjs/config nestjs-commander reflect-metadata
```

**Step 2: Remove commander (replaced by nestjs-commander)**

```bash
pnpm remove commander
```

**Step 3: Verify install**

```bash
pnpm typecheck
```
Expected: No errors (nothing uses commander yet at the type level).

**Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add nestjs + nestjs-commander, remove commander"
```

---

### Task 2: Create shared/types/

These are pure TypeScript types — no NestJS, no side effects. Migrated from `src/core/types/` and `src/core/interfaces/`.

**Files:**
- Create: `src/shared/types/universal-address.ts`
- Create: `src/shared/types/blockchain-addresses.ts`
- Create: `src/shared/types/intent.interface.ts`

**Step 1: Create `src/shared/types/universal-address.ts`**

Copy verbatim from `src/core/types/universal-address.ts`. No changes needed.

**Step 2: Create `src/shared/types/blockchain-addresses.ts`**

Copy verbatim from `src/core/types/blockchain-addresses.ts`. No changes needed.

**Step 3: Create `src/shared/types/intent.interface.ts`**

Copy verbatim from `src/core/interfaces/intent.ts`. No changes needed.

**Step 4: Create barrel `src/shared/types/index.ts`**

```typescript
export * from './universal-address';
export * from './blockchain-addresses';
export * from './intent.interface';
```

**Step 5: Verify**

```bash
pnpm typecheck
```

**Step 6: Commit**

```bash
git add src/shared/
git commit -m "refactor: add shared/types (migrated from core/types + core/interfaces)"
```

---

### Task 3: Create shared/security/key-handle.ts

Adds `useAsync()` — the critical fix for the async key zeroization race condition.

**Files:**
- Create: `src/shared/security/key-handle.ts`

**Step 1: Write `src/shared/security/key-handle.ts`**

```typescript
/**
 * A single-use wrapper around a private key string.
 *
 * Calling use() or useAsync() passes the key to a function and immediately
 * zeroizes the internal buffer in a finally block, regardless of success or failure.
 *
 * use()      — synchronous; buffer zeroed after fn() returns
 * useAsync() — async-safe; buffer zeroed after the returned Promise settles
 */
export class KeyHandle {
  private buffer: Buffer;

  constructor(key: string) {
    this.buffer = Buffer.from(key, 'utf8');
  }

  /**
   * Synchronous variant. Use for deriving wallet addresses or other
   * synchronous key operations. Buffer is zeroed before any async work begins.
   */
  use<T>(fn: (key: string) => T): T {
    try {
      return fn(this.buffer.toString('utf8'));
    } finally {
      this.buffer.fill(0);
    }
  }

  /**
   * Async-safe variant. Buffer is zeroed only after the promise resolves or rejects.
   * Use this when the key needs to survive through async operations (e.g. publisher.publish).
   */
  async useAsync<T>(fn: (key: string) => Promise<T>): Promise<T> {
    try {
      return await fn(this.buffer.toString('utf8'));
    } finally {
      this.buffer.fill(0);
    }
  }
}
```

**Step 2: Create barrel `src/shared/security/index.ts`**

```typescript
export * from './key-handle';
```

**Step 3: Verify**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/shared/security/
git commit -m "feat(security): add async-safe KeyHandle.useAsync()"
```

---

### Task 4: Create shared/errors/

**Files:**
- Create: `src/shared/errors/routes-cli-error.ts`

**Step 1: Write `src/shared/errors/routes-cli-error.ts`**

Copy verbatim from `src/core/errors/errors.ts`. No changes needed.

**Step 2: Create barrel `src/shared/errors/index.ts`**

```typescript
export * from './routes-cli-error';
```

**Step 3: Create top-level `src/shared/index.ts`**

```typescript
export * from './types';
export * from './security';
export * from './errors';
```

**Step 4: Verify**

```bash
pnpm typecheck
```

**Step 5: Commit**

```bash
git add src/shared/errors/ src/shared/index.ts
git commit -m "refactor: add shared/errors (migrated from core/errors)"
```

---

## Phase 2: ConfigModule

### Task 5: Create config/validation/env.schema.ts

**Files:**
- Create: `src/config/validation/env.schema.ts`

**Step 1: Write the file**

```typescript
import { z } from 'zod';

export const EnvSchema = z.object({
  EVM_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/).optional(),
  TVM_PRIVATE_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
  SVM_PRIVATE_KEY: z.string().min(1).optional(),

  EVM_RPC_URL: z.string().url().optional(),
  TVM_RPC_URL: z.string().url().default('https://api.trongrid.io'),
  TVM_RPC_URL_2: z.string().url().default('https://tron.publicnode.com'),
  SVM_RPC_URL: z.string().url().default('https://api.mainnet-beta.solana.com'),
  SVM_RPC_URL_2: z.string().url().default('https://solana.publicnode.com'),

  SOLVER_URL: z.string().url().optional(),
  QUOTES_API_URL: z.string().optional(),
  QUOTES_PREPROD: z.string().optional(),

  NODE_CHAINS_ENV: z.enum(['production', 'development']).default('production'),
  DEBUG: z.string().optional(),

  DAPP_ID: z.string().default('eco-routes-cli'),
  DEADLINE_OFFSET_SECONDS: z.coerce.number().positive().default(9000),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/config/validation/
git commit -m "feat(config): add Zod env validation schema with configurable dAppID + deadline"
```

---

### Task 6: Create config/config.service.ts

**Files:**
- Create: `src/config/config.service.ts`

**Step 1: Write the file**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
import { Hex } from 'viem';
import { ChainType } from '@/shared/types';

@Injectable()
export class ConfigService {
  constructor(private readonly config: NestConfigService) {}

  getEvmPrivateKey(): Hex | undefined {
    return this.config.get<Hex>('EVM_PRIVATE_KEY');
  }

  getTvmPrivateKey(): string | undefined {
    return this.config.get<string>('TVM_PRIVATE_KEY');
  }

  getSvmPrivateKey(): string | undefined {
    return this.config.get<string>('SVM_PRIVATE_KEY');
  }

  getRpcUrl(chainType: ChainType, variant: 'primary' | 'fallback' = 'primary'): string | undefined {
    const map: Record<ChainType, Record<'primary' | 'fallback', string>> = {
      [ChainType.EVM]: {
        primary: this.config.get<string>('EVM_RPC_URL') ?? '',
        fallback: '',  // EVM fallback not configured via env — handled per-chain
      },
      [ChainType.TVM]: {
        primary: this.config.get<string>('TVM_RPC_URL') ?? 'https://api.trongrid.io',
        fallback: this.config.get<string>('TVM_RPC_URL_2') ?? 'https://tron.publicnode.com',
      },
      [ChainType.SVM]: {
        primary: this.config.get<string>('SVM_RPC_URL') ?? 'https://api.mainnet-beta.solana.com',
        fallback: this.config.get<string>('SVM_RPC_URL_2') ?? 'https://solana.publicnode.com',
      },
    };
    return map[chainType][variant] || undefined;
  }

  getQuoteEndpoint(): { url: string; type: 'solver-v2' | 'preprod' | 'production' } {
    const solverUrl = this.config.get<string>('SOLVER_URL');
    if (solverUrl) {
      return { url: `${solverUrl}/api/v2/quote/reverse`, type: 'solver-v2' };
    }
    if (this.config.get('QUOTES_API_URL') || this.config.get('QUOTES_PREPROD')) {
      return { url: 'https://quotes-preprod.eco.com/api/v3/quotes/single', type: 'preprod' };
    }
    return { url: 'https://quotes.eco.com/api/v3/quotes/single', type: 'production' };
  }

  getDeadlineOffsetSeconds(): number {
    return this.config.get<number>('DEADLINE_OFFSET_SECONDS') ?? 9000;
  }

  getDappId(): string {
    return this.config.get<string>('DAPP_ID') ?? 'eco-routes-cli';
  }

  getChainsEnv(): 'production' | 'development' {
    return this.config.get<'production' | 'development'>('NODE_CHAINS_ENV') ?? 'production';
  }

  isDebug(): boolean {
    return !!this.config.get('DEBUG');
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/config/config.service.ts
git commit -m "feat(config): add typed ConfigService with all env getters"
```

---

### Task 7: Create config/tokens.config.ts

**Files:**
- Create: `src/config/tokens.config.ts`

**Step 1: Write the file**

Copy `src/config/tokens.ts` to `src/config/tokens.config.ts`. Update all imports from `@/core/` to `@/shared/`. No logic changes.

**Step 2: Create config/config.module.ts**

```typescript
import { Module, Global } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ConfigService } from './config.service';
import { EnvSchema } from './validation/env.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => EnvSchema.parse(config),
    }),
  ],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
```

**Step 3: Verify**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/config/
git commit -m "feat(config): add ConfigModule with global Zod-validated config"
```

---

## Phase 3: BlockchainModule

### Task 8: Create chain-handler.interface.ts and chain-registry.service.ts

**Files:**
- Create: `src/blockchain/chain-handler.interface.ts`
- Create: `src/blockchain/chain-registry.service.ts`

**Step 1: Create `src/blockchain/chain-handler.interface.ts`**

Copy verbatim from `src/core/chain/chain-handler.interface.ts`. Update imports to use `@/shared/`.

**Step 2: Create `src/blockchain/chain-registry.service.ts`**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChainType } from '@/shared/types';
import { RoutesCliError } from '@/shared/errors';
import { ChainHandler } from './chain-handler.interface';
import { EvmChainHandler } from './evm/evm-chain-handler';
import { TvmChainHandler } from './tvm/tvm-chain-handler';
import { SvmChainHandler } from './svm/svm-chain-handler';

@Injectable()
export class ChainRegistryService implements OnModuleInit {
  private readonly handlers = new Map<ChainType, ChainHandler>();
  private readonly registeredChainIds = new Set<bigint>();

  onModuleInit(): void {
    this.bootstrap([
      new EvmChainHandler(),
      new TvmChainHandler(),
      new SvmChainHandler(),
    ]);
  }

  bootstrap(handlers: ChainHandler[]): void {
    for (const handler of handlers) {
      this.handlers.set(handler.chainType, handler);
    }
  }

  get(chainType: ChainType): ChainHandler {
    const handler = this.handlers.get(chainType);
    if (!handler) throw RoutesCliError.unsupportedChain(chainType);
    return handler;
  }

  getAll(): ChainHandler[] {
    return [...this.handlers.values()];
  }

  registerChainId(chainId: bigint): void {
    this.registeredChainIds.add(chainId);
  }

  isRegistered(chainId: bigint): boolean {
    return this.registeredChainIds.has(chainId);
  }
}
```

**Step 3: Verify**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/blockchain/chain-handler.interface.ts src/blockchain/chain-registry.service.ts
git commit -m "feat(blockchain): add ChainRegistryService with explicit onModuleInit bootstrap"
```

---

### Task 9: Migrate EVM, TVM, SVM chain handlers

**Files:**
- Create: `src/blockchain/evm/evm-chain-handler.ts`
- Create: `src/blockchain/tvm/tvm-chain-handler.ts`
- Create: `src/blockchain/svm/svm-chain-handler.ts`

**Step 1:** Copy each handler from `src/blockchain/evm/evm-chain-handler.ts`, `src/blockchain/tvm/tvm-chain-handler.ts`, `src/blockchain/svm/svm-chain-handler.ts` (current location).

Update each to:
- Remove the `chainRegistry.register(new XxxChainHandler())` self-registration line at the bottom (registration now happens in `ChainRegistryService.onModuleInit()`)
- Update all imports to use `@/shared/` and `@/blockchain/chain-handler.interface`

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/evm/evm-chain-handler.ts src/blockchain/tvm/tvm-chain-handler.ts src/blockchain/svm/svm-chain-handler.ts
git commit -m "refactor(blockchain): migrate chain handlers, remove self-registration side effects"
```

---

### Task 10: Create address-normalizer.service.ts

**Files:**
- Create: `src/blockchain/address-normalizer.service.ts`

**Step 1: Write the file**

```typescript
import { Injectable } from '@nestjs/common';
import { ChainType, UniversalAddress, BlockchainAddress, EvmAddress, TronAddress, SvmAddress } from '@/shared/types';
import { ChainRegistryService } from './chain-registry.service';

@Injectable()
export class AddressNormalizerService {
  constructor(private readonly registry: ChainRegistryService) {}

  normalize(address: BlockchainAddress, chainType: ChainType): UniversalAddress {
    return this.registry.get(chainType).normalize(address as string);
  }

  denormalize(address: UniversalAddress, chainType: ChainType): BlockchainAddress {
    return this.registry.get(chainType).denormalize(address);
  }

  denormalizeToEvm(address: UniversalAddress): EvmAddress {
    return this.registry.get(ChainType.EVM).denormalize(address) as EvmAddress;
  }

  denormalizeToTvm(address: UniversalAddress): TronAddress {
    return this.registry.get(ChainType.TVM).denormalize(address) as TronAddress;
  }

  denormalizeToSvm(address: UniversalAddress): SvmAddress {
    return this.registry.get(ChainType.SVM).denormalize(address) as SvmAddress;
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/address-normalizer.service.ts
git commit -m "feat(blockchain): add injectable AddressNormalizerService"
```

---

### Task 11: Create chains.config.ts and chains.service.ts

**Files:**
- Create: `src/blockchain/chains.config.ts`
- Create: `src/blockchain/chains.service.ts`

**Step 1: Create `src/blockchain/chains.config.ts`**

Copy `src/config/chains.ts` to `src/blockchain/chains.config.ts`. Update imports to use `@/shared/` and `@/blockchain/address-normalizer.service`. Remove any calls to the old static `AddressNormalizer` — chain config will store raw strings and normalize lazily via `ChainsService`, OR normalize at construction time passing the service.

> Note: Because config is loaded at module init time and `AddressNormalizerService` requires `ChainRegistryService` to be initialized first, address normalization in chains config must happen in `ChainsService.onModuleInit()`, not at file load time.

Update `chains.config.ts` to export raw chain definitions with addresses as plain strings (pre-normalization), using a new type:

```typescript
export interface RawChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: string;   // raw string, normalized by ChainsService
  proverAddress?: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}
```

**Step 2: Create `src/blockchain/chains.service.ts`**

```typescript
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';
import { ChainConfig, ChainType, UniversalAddress } from '@/shared/types';
import { RoutesCliError } from '@/shared/errors';
import { RAW_CHAIN_CONFIGS, RawChainConfig } from './chains.config';
import { AddressNormalizerService } from './address-normalizer.service';
import { ChainRegistryService } from './chain-registry.service';

@Injectable()
export class ChainsService implements OnModuleInit {
  private chains: ChainConfig[] = [];

  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly registry: ChainRegistryService,
  ) {}

  onModuleInit(): void {
    const env = this.config.getChainsEnv();
    this.chains = RAW_CHAIN_CONFIGS
      .filter(c => c.env === env || c.env === 'production')
      .map(c => this.normalizeChain(c));

    // Register all chain IDs in the allowlist
    for (const chain of this.chains) {
      this.registry.registerChainId(chain.id);
    }
  }

  private normalizeChain(raw: RawChainConfig): ChainConfig {
    return {
      ...raw,
      portalAddress: raw.portalAddress
        ? this.normalizer.normalize(raw.portalAddress as any, raw.type)
        : undefined,
      proverAddress: raw.proverAddress
        ? this.normalizer.normalize(raw.proverAddress as any, raw.type)
        : undefined,
    };
  }

  listChains(): ChainConfig[] {
    return this.chains;
  }

  getChainById(id: bigint): ChainConfig {
    const chain = this.chains.find(c => c.id === id);
    if (!chain) throw RoutesCliError.unsupportedChain(id);
    return chain;
  }

  getChainByName(name: string): ChainConfig {
    const chain = this.chains.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (!chain) throw RoutesCliError.unsupportedChain(name);
    return chain;
  }

  resolveChain(nameOrId: string): ChainConfig {
    const asId = BigInt(nameOrId);
    if (asId) return this.getChainById(asId);
    return this.getChainByName(nameOrId);
  }
}
```

**Step 3: Verify**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/blockchain/chains.config.ts src/blockchain/chains.service.ts
git commit -m "feat(blockchain): add ChainsService with lazy normalization in onModuleInit"
```

---

### Task 12: Create rpc.service.ts

**Files:**
- Create: `src/blockchain/rpc.service.ts`

**Step 1: Write the file**

```typescript
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';
import { ChainConfig, ChainType } from '@/shared/types';

@Injectable()
export class RpcService {
  constructor(private readonly config: ConfigService) {}

  getUrl(chain: ChainConfig): string {
    // Chain-specific RPC overrides env override default
    const envOverride = this.config.getRpcUrl(chain.type, 'primary');
    return envOverride || chain.rpcUrl;
  }

  getFallbackUrl(chain: ChainConfig): string | undefined {
    return this.config.getRpcUrl(chain.type, 'fallback') || undefined;
  }

  async withFallback<T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      return await primary();
    } catch {
      return fallback();
    }
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/rpc.service.ts
git commit -m "feat(blockchain): add RpcService with uniform withFallback() for all chain types"
```

---

### Task 13: Migrate publishers

**Files:**
- Create: `src/blockchain/base.publisher.ts`
- Modify: `src/blockchain/evm/evm.publisher.ts`
- Modify: `src/blockchain/tvm/tvm.publisher.ts`
- Modify: `src/blockchain/svm/svm.publisher.ts`

**Step 1: Create `src/blockchain/base.publisher.ts`**

Copy from `src/blockchain/base-publisher.ts`. Add `@Injectable()` decorator. Update imports to `@/shared/`. Change constructor signature to inject `ChainRegistryService`:

```typescript
import { Injectable } from '@nestjs/common';
import { ChainRegistryService } from './chain-registry.service';

@Injectable()
export abstract class BasePublisher {
  constructor(
    protected readonly rpcUrl: string,
    protected readonly registry: ChainRegistryService,
  ) {}

  protected runPreflightChecks(sourceChainId: bigint): void {
    if (!this.registry.isRegistered(sourceChainId)) {
      throw RoutesCliError.unsupportedChain(sourceChainId);
    }
  }

  // ... rest of abstract methods unchanged
}
```

**Step 2: Update `src/blockchain/evm/evm.publisher.ts`**

- Add `@Injectable()` decorator
- Update `publish()` to use `keyHandle.useAsync()` instead of `keyHandle.use()` + second KeyHandle construction
- Inject `ChainRegistryService` via constructor
- Update all imports to `@/shared/`

Key change in publish():
```typescript
// Before (current code):
const { senderAccount } = keyHandle.use(rawKey => ({
  senderAccount: privateKeyToAccount(rawKey as Hex),
}));
const publishKeyHandle = new KeyHandle(rawKey); // this is wrong - rawKey not in scope

// After:
return keyHandle.useAsync(async (rawKey) => {
  const senderAccount = privateKeyToAccount(rawKey as Hex);
  // ... all async publisher logic here, key alive for the duration
});
```

**Step 3: Update `src/blockchain/tvm/tvm.publisher.ts`**

- Add `@Injectable()` decorator
- Change from singleton TronWeb to per-call instantiation:

```typescript
// Before: single this.tronWeb instance, key set/clear pattern
// After:
return keyHandle.useAsync(async (rawKey) => {
  const tronWeb = this.factory.create(this.rpcUrl, rawKey);
  // tronWeb scoped to this call, no finally needed
  return this.executePublish(tronWeb, ...);
});
```

**Step 4: Update `src/blockchain/svm/svm.publisher.ts`**

- Add `@Injectable()` decorator
- Update to use `keyHandle.useAsync()`
- Update imports to `@/shared/`

**Step 5: Verify**

```bash
pnpm typecheck
```

**Step 6: Commit**

```bash
git add src/blockchain/base.publisher.ts src/blockchain/evm/evm.publisher.ts src/blockchain/tvm/tvm.publisher.ts src/blockchain/svm/svm.publisher.ts
git commit -m "feat(blockchain): migrate publishers to injectable NestJS services with useAsync()"
```

---

### Task 14: Migrate SVM helpers

**Files:**
- Modify: `src/blockchain/svm/pda-manager.ts`
- Modify: `src/blockchain/svm/transaction-builder.ts`
- Modify: `src/blockchain/svm/solana-client.ts`

**Step 1:** Copy these three files from their current locations. Update imports to `@/shared/`.

No logic changes required — these are already pure functions / utility modules.

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/svm/
git commit -m "refactor(blockchain/svm): migrate SVM helpers to new structure"
```

---

### Task 15: Migrate client factories

**Files:**
- Create: `src/blockchain/evm/evm-client-factory.ts`
- Create: `src/blockchain/tvm/tvm-client-factory.ts`
- Create: `src/blockchain/svm/svm-client-factory.ts`

**Step 1:** Copy each from current `src/blockchain/evm/`, `tvm/`, `svm/` locations. Update imports to `@/shared/`. No logic changes.

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/evm/evm-client-factory.ts src/blockchain/tvm/tvm-client-factory.ts src/blockchain/svm/svm-client-factory.ts
git commit -m "refactor(blockchain): migrate client factories to co-located chain dirs"
```

---

### Task 16: Create publisher-factory.service.ts

**Files:**
- Create: `src/blockchain/publisher-factory.service.ts`

**Step 1: Write the file**

```typescript
import { Injectable } from '@nestjs/common';
import { ChainType } from '@/shared/types';
import { BasePublisher } from './base.publisher';
import { EvmPublisher } from './evm/evm.publisher';
import { TvmPublisher } from './tvm/tvm.publisher';
import { SvmPublisher } from './svm/svm.publisher';
import { ChainRegistryService } from './chain-registry.service';
import { RpcService } from './rpc.service';
import { ChainConfig } from '@/shared/types';

@Injectable()
export class PublisherFactory {
  constructor(
    private readonly registry: ChainRegistryService,
    private readonly rpcService: RpcService,
  ) {}

  create(chain: ChainConfig): BasePublisher {
    const rpcUrl = this.rpcService.getUrl(chain);
    switch (chain.type) {
      case ChainType.EVM:
        return new EvmPublisher(rpcUrl, this.registry);
      case ChainType.TVM:
        return new TvmPublisher(rpcUrl, this.registry);
      case ChainType.SVM:
        return new SvmPublisher(rpcUrl, this.registry);
      default:
        throw new Error(`Unsupported chain type: ${chain.type}`);
    }
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/publisher-factory.service.ts
git commit -m "feat(blockchain): add PublisherFactory as injectable NestJS service"
```

---

### Task 17: Migrate encoding services

**Files:**
- Create: `src/blockchain/encoding/portal-encoder.service.ts`
- Create: `src/blockchain/encoding/intent-converter.service.ts`

**Step 1:** Copy from `src/core/utils/portal-encoder.ts` and `src/core/utils/intent-converter.ts`.

- Add `@Injectable()` decorator to each
- Convert static methods to instance methods
- Inject `AddressNormalizerService` instead of using static `AddressNormalizer`
- Update all imports to `@/shared/`

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/encoding/
git commit -m "feat(blockchain): migrate PortalEncoder and IntentConverter to injectable services"
```

---

### Task 18: Create blockchain.module.ts

**Files:**
- Create: `src/blockchain/blockchain.module.ts`

**Step 1: Write the file**

```typescript
import { Global, Module } from '@nestjs/common';
import { ChainRegistryService } from './chain-registry.service';
import { AddressNormalizerService } from './address-normalizer.service';
import { ChainsService } from './chains.service';
import { RpcService } from './rpc.service';
import { PublisherFactory } from './publisher-factory.service';
import { PortalEncoderService } from './encoding/portal-encoder.service';
import { IntentConverterService } from './encoding/intent-converter.service';

@Global()
@Module({
  providers: [
    ChainRegistryService,
    AddressNormalizerService,
    ChainsService,
    RpcService,
    PublisherFactory,
    PortalEncoderService,
    IntentConverterService,
  ],
  exports: [
    ChainRegistryService,
    AddressNormalizerService,
    ChainsService,
    RpcService,
    PublisherFactory,
    PortalEncoderService,
    IntentConverterService,
  ],
})
export class BlockchainModule {}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/blockchain/blockchain.module.ts
git commit -m "feat(blockchain): assemble BlockchainModule (global)"
```

---

## Phase 4: QuoteModule

### Task 19: Create quote/quote.service.ts

**Files:**
- Create: `src/quote/quote.service.ts`

**Step 1:** Copy logic from `src/core/utils/quote.ts`. Convert to `@Injectable()` class. Replace hardcoded `'eco-routes-cli'` and endpoint selection with `ConfigService` injected via constructor:

```typescript
@Injectable()
export class QuoteService {
  constructor(private readonly config: ConfigService) {}

  async getQuote(params: QuoteRequest): Promise<QuoteResult> {
    const { url, type } = this.config.getQuoteEndpoint();
    const dAppID = this.config.getDappId();
    // ... rest of logic unchanged, uses url + dAppID from config
  }
}
```

**Step 2: Create `src/quote/quote.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { QuoteService } from './quote.service';

@Module({
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
```

**Step 3: Verify**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/quote/
git commit -m "feat(quote): add injectable QuoteService with configurable endpoint + dAppID"
```

---

## Phase 5: IntentModule

### Task 20: Create intent/intent-builder.service.ts

**Files:**
- Create: `src/intent/intent-builder.service.ts`

**Step 1: Write the file**

Extract the pure intent/reward assembly logic from the current `IntentService`. No prompts, no network calls.

```typescript
import { Injectable } from '@nestjs/common';
import { Hex } from 'viem';
import { Intent, UniversalAddress, ChainConfig } from '@/shared/types';
import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { PortalEncoderService } from '@/blockchain/encoding/portal-encoder.service';
import { ConfigService } from '@/config/config.service';

export interface RewardParams {
  sourceChain: ChainConfig;
  creator: UniversalAddress;
  prover: UniversalAddress;
  rewardToken: UniversalAddress;
  rewardAmount: bigint;
  deadline?: bigint;
}

export interface ManualRouteParams {
  destChain: ChainConfig;
  recipient: UniversalAddress;
  routeToken: UniversalAddress;
  routeAmount: bigint;
  portal: UniversalAddress;
  deadline?: bigint;
}

@Injectable()
export class IntentBuilder {
  constructor(
    private readonly config: ConfigService,
    private readonly encoder: PortalEncoderService,
    private readonly normalizer: AddressNormalizerService,
  ) {}

  buildReward(params: RewardParams): Intent['reward'] {
    const deadlineOffset = BigInt(this.config.getDeadlineOffsetSeconds());
    const deadline = params.deadline ?? BigInt(Math.floor(Date.now() / 1000)) + deadlineOffset;
    return {
      deadline,
      creator: params.creator,
      prover: params.prover,
      nativeAmount: 0n,
      tokens: [{ token: params.rewardToken, amount: params.rewardAmount }],
    };
  }

  buildManualRoute(params: ManualRouteParams): { encodedRoute: Hex; route: Intent['route'] } {
    const deadlineOffset = BigInt(this.config.getDeadlineOffsetSeconds());
    const deadline = params.deadline ?? BigInt(Math.floor(Date.now() / 1000)) + deadlineOffset;
    const salt = this.generateSalt();

    // Build ERC-20 transfer call to recipient
    const transferData = this.encoder.encodeErc20Transfer(params.recipient, params.routeAmount);
    const route: Intent['route'] = {
      salt,
      deadline,
      portal: params.portal,
      nativeAmount: 0n,
      tokens: [{ token: params.routeToken, amount: params.routeAmount }],
      calls: [{ target: params.routeToken, data: transferData, value: 0n }],
    };

    const encodedRoute = this.encoder.encode(route, params.destChain.type);
    return { encodedRoute, route };
  }

  private generateSalt(): Hex {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Buffer.from(bytes).toString('hex')}` as Hex;
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/intent/intent-builder.service.ts
git commit -m "feat(intent): add pure IntentBuilder service — no I/O, no prompts"
```

---

### Task 21: Create intent/intent-storage.service.ts

**Files:**
- Create: `src/intent/intent-storage.service.ts`

**Step 1: Write the file**

```typescript
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Intent } from '@/shared/types';
import { PublishResult } from '@/blockchain/base.publisher';

export interface StoredIntent {
  intentHash: string;
  sourceChainId: string;
  destChainId: string;
  reward: unknown;
  routeHash: string;
  publishedAt: number;
  refundedAt: number | null;
  transactionHash: string;
}

@Injectable()
export class IntentStorage {
  private readonly storePath = path.join(os.homedir(), '.routes-cli', 'intents.json');

  async save(intent: Intent, result: PublishResult): Promise<void> {
    const intents = await this.readAll();
    const entry: StoredIntent = {
      intentHash: result.intentHash ?? '',
      sourceChainId: intent.sourceChainId.toString(),
      destChainId: intent.destination.toString(),
      reward: intent.reward,
      routeHash: '',
      publishedAt: Math.floor(Date.now() / 1000),
      refundedAt: null,
      transactionHash: result.transactionHash ?? '',
    };
    intents.push(entry);
    await this.writeAll(intents);
  }

  async findByHash(intentHash: string): Promise<StoredIntent | null> {
    const intents = await this.readAll();
    return intents.find(i => i.intentHash === intentHash) ?? null;
  }

  async listAll(): Promise<StoredIntent[]> {
    return this.readAll();
  }

  async markRefunded(intentHash: string): Promise<void> {
    const intents = await this.readAll();
    const entry = intents.find(i => i.intentHash === intentHash);
    if (entry) {
      entry.refundedAt = Math.floor(Date.now() / 1000);
      await this.writeAll(intents);
    }
  }

  private async readAll(): Promise<StoredIntent[]> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      return JSON.parse(raw, (_, v) => typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
    } catch {
      return [];
    }
  }

  private async writeAll(intents: StoredIntent[]): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(intents, (_, v) => typeof v === 'bigint' ? `${v}n` : v, 2));
  }
}
```

**Step 2: Create `src/intent/intent.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { IntentBuilder } from './intent-builder.service';
import { IntentStorage } from './intent-storage.service';

@Module({
  providers: [IntentBuilder, IntentStorage],
  exports: [IntentBuilder, IntentStorage],
})
export class IntentModule {}
```

**Step 3: Verify**

```bash
pnpm typecheck
```

**Step 4: Commit**

```bash
git add src/intent/
git commit -m "feat(intent): add IntentBuilder + IntentStorage services and IntentModule"
```

---

## Phase 6: StatusModule

### Task 22: Create status/status.service.ts

**Files:**
- Create: `src/status/status.service.ts`
- Create: `src/status/status.module.ts`

**Step 1: Write `src/status/status.service.ts`**

Extract the EVM status logic from `src/commands/status.ts`. Add TVM and SVM status checking via the respective publishers' new `checkStatus()` method on `BasePublisher`.

```typescript
import { Injectable } from '@nestjs/common';
import { ChainConfig, ChainType } from '@/shared/types';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';

export interface IntentStatus {
  fulfilled: boolean;
  solver?: string;
  fulfillmentTxHash?: string;
  blockNumber?: bigint;
  timestamp?: number;
}

@Injectable()
export class StatusService {
  constructor(private readonly publisherFactory: PublisherFactory) {}

  async getStatus(intentHash: string, chain: ChainConfig): Promise<IntentStatus> {
    const publisher = this.publisherFactory.create(chain);
    return publisher.getStatus(intentHash, chain.id);
  }

  async watch(
    intentHash: string,
    chain: ChainConfig,
    onUpdate: (status: IntentStatus) => void,
    intervalMs = 10_000,
  ): Promise<void> {
    let last: IntentStatus | null = null;
    while (true) {
      const status = await this.getStatus(intentHash, chain);
      if (!last || status.fulfilled !== last.fulfilled) {
        onUpdate(status);
        last = status;
      }
      if (status.fulfilled) break;
      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
}
```

**Step 2: Add `getStatus()` abstract method to `BasePublisher`**

```typescript
abstract getStatus(intentHash: string, chainId: bigint): Promise<IntentStatus>;
```

Implement in EVM publisher (extract from current `status.ts`). Add stub implementations to TVM and SVM publishers that throw `'Not yet implemented'` — this makes TVM/SVM status a tracked gap without blocking the rest.

**Step 3: Create `src/status/status.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { StatusService } from './status.service';

@Module({
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
```

**Step 4: Verify**

```bash
pnpm typecheck
```

**Step 5: Commit**

```bash
git add src/status/
git commit -m "feat(status): add StatusService routing status checks by chain type"
```

---

## Phase 7: CliModule

### Task 23: Create cli/services/prompt.service.ts

**Files:**
- Create: `src/cli/services/prompt.service.ts`

**Step 1:** Extract all inquirer calls from the current `src/cli/prompts/intent-prompts.ts` and `src/commands/publish.ts` into a single injectable class. Methods map 1:1 to existing prompt logic — no UX changes.

```typescript
import { Injectable } from '@nestjs/common';
import inquirer from 'inquirer';
import { ChainConfig, TokenConfig } from '@/shared/types';

@Injectable()
export class PromptService {
  async selectChain(chains: ChainConfig[], message: string): Promise<ChainConfig> {
    const { chain } = await inquirer.prompt([{
      type: 'list', name: 'chain', message,
      choices: chains.map(c => ({ name: `${c.name} (${c.id})`, value: c })),
    }]);
    return chain;
  }

  async selectToken(tokens: TokenConfig[], label: string): Promise<{ address: string; decimals: number; symbol?: string }> {
    // ... existing logic from intent-prompts.ts
  }

  async inputAmount(symbol: string): Promise<{ raw: string; parsed: bigint; decimals: number }> {
    // ... existing logic
  }

  async inputAddress(chain: ChainConfig, label: string, defaultValue?: string): Promise<string> {
    // ... existing logic
  }

  async confirmPublish(): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm', name: 'confirmed', message: 'Publish this intent?', default: true,
    }]);
    return confirmed;
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([{
      type: 'confirm', name: 'confirmed', message, default: defaultValue,
    }]);
    return confirmed;
  }

  async inputManualPortal(chain: ChainConfig): Promise<string> {
    // ... existing fallback logic
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/cli/services/prompt.service.ts
git commit -m "feat(cli): add injectable PromptService wrapping all inquirer calls"
```

---

### Task 24: Create cli/services/display.service.ts

**Files:**
- Create: `src/cli/services/display.service.ts`

**Step 1:** Extract all `ora` and `cli-table3` calls from `src/utils/logger.ts` into an injectable class. Methods map 1:1 — no UX changes.

```typescript
import { Injectable } from '@nestjs/common';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';
import chalk from 'chalk';
import { PublishResult } from '@/blockchain/base.publisher';
import { ChainConfig, TokenConfig } from '@/shared/types';

@Injectable()
export class DisplayService {
  private activeSpinner: Ora | null = null;

  spinner(text: string): void {
    this.stopSpinner();
    this.activeSpinner = ora(text).start();
  }

  succeed(text?: string): void { this.activeSpinner?.succeed(text); this.activeSpinner = null; }
  fail(text?: string): void { this.activeSpinner?.fail(text); this.activeSpinner = null; }
  warn(text?: string): void { this.activeSpinner?.warn(text); this.activeSpinner = null; }
  stopSpinner(): void { this.activeSpinner?.stop(); this.activeSpinner = null; }

  log(msg: string): void { console.log(chalk.gray(msg)); }
  success(msg: string): void { console.log(chalk.green(`✅ ${msg}`)); }
  error(msg: string): void { console.error(chalk.red(`❌ ${msg}`)); }
  warning(msg: string): void { console.warn(chalk.yellow(`⚠️  ${msg}`)); }
  title(msg: string): void { console.log(chalk.bold.blue(msg)); }
  section(msg: string): void { console.log(chalk.blue(msg)); }

  displayTable(headers: string[], rows: string[][]): void {
    const table = new Table({ head: headers.map(h => chalk.cyan(h)), style: { border: ['gray'] } });
    rows.forEach(row => table.push(row));
    console.log(table.toString());
  }

  displayTransactionResult(result: PublishResult): void {
    this.displayTable(['Field', 'Value'], [
      ['Transaction Hash', result.transactionHash ?? '-'],
      ['Intent Hash', result.intentHash ?? '-'],
      ['Vault Address', result.vaultAddress ?? '-'],
    ]);
  }

  displayChains(chains: ChainConfig[]): void {
    this.displayTable(
      ['Name', 'ID', 'Type', 'Native Currency'],
      chains.map(c => [c.name, c.id.toString(), c.type, c.nativeCurrency.symbol]),
    );
  }

  displayTokens(tokens: TokenConfig[]): void {
    this.displayTable(
      ['Symbol', 'Name', 'Decimals', 'Available Chains'],
      tokens.map(t => [t.symbol, t.name, t.decimals.toString(), Object.keys(t.addresses).join(', ')]),
    );
  }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/cli/services/display.service.ts
git commit -m "feat(cli): add injectable DisplayService wrapping ora + cli-table3"
```

---

### Task 25: Create cli/commands/publish.command.ts

**Files:**
- Create: `src/cli/commands/publish.command.ts`

**Step 1: Write the file**

This is the thin orchestrator — prompts + service calls, no business logic:

```typescript
import { Command, CommandRunner, Option } from 'nestjs-commander';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';
import { ChainsService } from '@/blockchain/chains.service';
import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { QuoteService } from '@/quote/quote.service';
import { IntentBuilder } from '@/intent/intent-builder.service';
import { IntentStorage } from '@/intent/intent-storage.service';
import { PromptService } from '../services/prompt.service';
import { DisplayService } from '../services/display.service';
import { KeyHandle } from '@/shared/security';

interface PublishOptions {
  source?: string;
  destination?: string;
  privateKey?: string;
  rpc?: string;
  recipient?: string;
  dryRun?: boolean;
}

@Injectable()
@Command({ name: 'publish', description: 'Publish an intent to the blockchain' })
export class PublishCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly publisherFactory: PublisherFactory,
    private readonly quoteService: QuoteService,
    private readonly intentBuilder: IntentBuilder,
    private readonly intentStorage: IntentStorage,
    private readonly prompt: PromptService,
    private readonly display: DisplayService,
  ) {
    super();
  }

  async run(_params: string[], options: PublishOptions): Promise<void> {
    this.display.title('🎨 Interactive Intent Publishing');

    const allChains = this.chains.listChains();
    const sourceChain = options.source
      ? this.chains.resolveChain(options.source)
      : await this.prompt.selectChain(allChains, 'Select source chain:');

    const destChain = options.destination
      ? this.chains.resolveChain(options.destination)
      : await this.prompt.selectChain(allChains.filter(c => c.id !== sourceChain.id), 'Select destination chain:');

    this.display.section('📏 Route Configuration (Destination Chain)');
    const routeToken = await this.prompt.selectToken([], 'route');

    this.display.section('💰 Reward Configuration (Source Chain)');
    const rewardToken = await this.prompt.selectToken([], 'reward');
    const { parsed: rewardAmount } = await this.prompt.inputAmount(rewardToken.symbol ?? 'tokens');

    this.display.section('👤 Recipient Configuration');
    const recipientRaw = options.recipient ?? await this.prompt.inputAddress(destChain, 'recipient');
    const recipient = this.normalizer.normalize(recipientRaw as any, destChain.type);

    const rawKey = options.privateKey ?? this.config.getEvmPrivateKey() ?? '';
    const keyHandle = new KeyHandle(rawKey);

    // Derive sender address synchronously, then keep async key handle for publisher
    let senderAddress: string;
    const publishKeyHandle = new KeyHandle(rawKey);
    keyHandle.use(key => {
      // derive wallet address for display
      senderAddress = key; // replace with getWalletAddress(sourceChain.type, key)
    });

    // Quote or fallback
    let encodedRoute: string;
    let sourcePortal = sourceChain.portalAddress!;
    let proverAddress = sourceChain.proverAddress!;

    try {
      this.display.spinner('Getting quote...');
      const quote = await this.quoteService.getQuote({
        source: sourceChain.id,
        destination: destChain.id,
        amount: rewardAmount,
        funder: senderAddress!,
        recipient: recipientRaw,
        routeToken: routeToken.address,
        rewardToken: rewardToken.address,
      });
      this.display.succeed('Quote received');
      encodedRoute = quote.encodedRoute;
      sourcePortal = this.normalizer.normalize(quote.sourcePortal as any, sourceChain.type);
      proverAddress = this.normalizer.normalize(quote.prover as any, sourceChain.type);
    } catch {
      this.display.warn('Quote service unavailable — using manual configuration');
      const manual = await this.prompt.inputManualPortal(sourceChain);
      encodedRoute = manual; // simplified — full manual fallback in production
    }

    const reward = this.intentBuilder.buildReward({
      sourceChain,
      creator: this.normalizer.normalize(senderAddress! as any, sourceChain.type),
      prover: proverAddress,
      rewardToken: this.normalizer.normalize(rewardToken.address as any, sourceChain.type),
      rewardAmount,
    });

    // Display summary + confirm
    const confirmed = await this.prompt.confirmPublish();
    if (!confirmed) throw new Error('Publication cancelled by user');

    if (options.dryRun) {
      this.display.warning('Dry run — not publishing');
      return;
    }

    this.display.spinner('Publishing intent to blockchain...');
    const publisher = this.publisherFactory.create(sourceChain);
    const result = await publisher.publish(
      sourceChain.id, destChain.id, reward, encodedRoute, publishKeyHandle, sourcePortal,
    );

    if (!result.success) {
      this.display.fail('Publishing failed');
      throw new Error(result.error);
    }

    await this.intentStorage.save({ destination: destChain.id, sourceChainId: sourceChain.id, route: {} as any, reward }, result);
    this.display.succeed('Intent published!');
    this.display.displayTransactionResult(result);
  }

  @Option({ flags: '-s, --source <chain>', description: 'Source chain name or ID' })
  parseSource(val: string) { return val; }

  @Option({ flags: '-d, --destination <chain>', description: 'Destination chain name or ID' })
  parseDestination(val: string) { return val; }

  @Option({ flags: '-k, --private-key <key>', description: 'Private key override' })
  parsePrivateKey(val: string) { return val; }

  @Option({ flags: '-r, --rpc <url>', description: 'RPC URL override' })
  parseRpc(val: string) { return val; }

  @Option({ flags: '--recipient <address>', description: 'Recipient address on destination chain' })
  parseRecipient(val: string) { return val; }

  @Option({ flags: '--dry-run', description: 'Validate without broadcasting' })
  parseDryRun() { return true; }
}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/cli/commands/publish.command.ts
git commit -m "feat(cli): add PublishCommand as nestjs-commander injectable"
```

---

### Task 26: Create remaining commands

**Files:**
- Create: `src/cli/commands/status.command.ts`
- Create: `src/cli/commands/config.command.ts`
- Create: `src/cli/commands/chains.command.ts`
- Create: `src/cli/commands/tokens.command.ts`

**Step 1: Create `src/cli/commands/chains.command.ts`**

```typescript
import { Command, CommandRunner } from 'nestjs-commander';
import { Injectable } from '@nestjs/common';
import { ChainsService } from '@/blockchain/chains.service';
import { DisplayService } from '../services/display.service';

@Injectable()
@Command({ name: 'chains', description: 'List supported chains' })
export class ChainsCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly display: DisplayService,
  ) { super(); }

  async run(): Promise<void> {
    this.display.displayChains(this.chains.listChains());
  }
}
```

**Step 2: Create `src/cli/commands/tokens.command.ts`**

```typescript
import { Command, CommandRunner } from 'nestjs-commander';
import { Injectable } from '@nestjs/common';
import { DisplayService } from '../services/display.service';
import { TOKENS } from '@/config/tokens.config';

@Injectable()
@Command({ name: 'tokens', description: 'List configured tokens' })
export class TokensCommand extends CommandRunner {
  constructor(private readonly display: DisplayService) { super(); }

  async run(): Promise<void> {
    this.display.displayTokens(Object.values(TOKENS));
  }
}
```

**Step 3: Create `src/cli/commands/status.command.ts`**

Migrate `src/commands/status.ts` logic. Inject `StatusService` and `DisplayService`. Replace Commander option declarations with `@Option()` decorators.

**Step 4: Create `src/cli/commands/config.command.ts`**

Migrate `src/commands/config.ts` logic. Inject `ConfigService` and `PromptService`.

**Step 5: Verify**

```bash
pnpm typecheck
```

**Step 6: Commit**

```bash
git add src/cli/commands/
git commit -m "feat(cli): add chains, tokens, status, config commands as nestjs-commander injectables"
```

---

### Task 27: Create cli.module.ts

**Files:**
- Create: `src/cli/cli.module.ts`

**Step 1: Write the file**

```typescript
import { Module } from '@nestjs/common';
import { PromptService } from './services/prompt.service';
import { DisplayService } from './services/display.service';
import { PublishCommand } from './commands/publish.command';
import { StatusCommand } from './commands/status.command';
import { ConfigCommand } from './commands/config.command';
import { ChainsCommand } from './commands/chains.command';
import { TokensCommand } from './commands/tokens.command';

@Module({
  providers: [
    PromptService,
    DisplayService,
    PublishCommand,
    StatusCommand,
    ConfigCommand,
    ChainsCommand,
    TokensCommand,
  ],
})
export class CliModule {}
```

**Step 2: Verify**

```bash
pnpm typecheck
```

**Step 3: Commit**

```bash
git add src/cli/cli.module.ts
git commit -m "feat(cli): assemble CliModule (leaf module)"
```

---

## Phase 8: App Bootstrap

### Task 28: Create app.module.ts and main.ts

**Files:**
- Create: `src/app.module.ts`
- Create: `src/main.ts`

**Step 1: Create `src/app.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { IntentModule } from './intent/intent.module';
import { QuoteModule } from './quote/quote.module';
import { StatusModule } from './status/status.module';
import { CliModule } from './cli/cli.module';

@Module({
  imports: [
    ConfigModule,
    BlockchainModule,
    IntentModule,
    QuoteModule,
    StatusModule,
    CliModule,
  ],
})
export class AppModule {}
```

**Step 2: Create `src/main.ts`**

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { CommandFactory } from 'nestjs-commander';
import { AppModule } from './app.module';

async function bootstrap() {
  const majorVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (majorVersion < 18) {
    console.error(`Node.js >= 18 required. Current: ${process.version}`);
    process.exit(1);
  }

  await CommandFactory.run(AppModule, {
    logger: false,
    errorHandler: (err) => {
      console.error(err.message);
      if (process.env['DEBUG']) console.error(err.stack);
      process.exit(1);
    },
  });
}

bootstrap();
```

**Step 3: Update `package.json` scripts**

```json
"dev": "tsx -r tsconfig-paths/register src/main.ts",
"dev:testnet": "NODE_CHAINS_ENV=development tsx -r tsconfig-paths/register src/main.ts",
"start": "node -r tsconfig-paths/register dist/main.js"
```

**Step 4: Verify full build**

```bash
pnpm build
```
Expected: Clean compile, `dist/` populated.

**Step 5: Smoke test**

```bash
pnpm dev chains
```
Expected: Table of supported chains printed.

```bash
pnpm dev tokens
```
Expected: Table of tokens printed.

**Step 6: Commit**

```bash
git add src/app.module.ts src/main.ts package.json
git commit -m "feat: bootstrap NestJS application with CommandFactory"
```

---

### Task 29: Remove old source files

Once the new structure is verified working, remove the old files to avoid confusion.

**Files to delete:**
- `src/index.ts` (replaced by `src/main.ts`)
- `src/core/` (replaced by `src/shared/` + moved to `src/blockchain/`)
- `src/commands/` (replaced by `src/cli/commands/`)
- `src/builders/` (replaced by `src/intent/intent-builder.service.ts`)
- `src/utils/logger.ts` (replaced by `src/cli/services/display.service.ts`)
- `src/commons/` if fully migrated

**Step 1: Delete old directories**

```bash
rm -rf src/index.ts src/core/ src/commands/ src/builders/ src/utils/logger.ts
```

**Step 2: Verify clean build**

```bash
pnpm build
```
Expected: No errors.

**Step 3: Full smoke test**

```bash
pnpm dev chains
pnpm dev tokens
pnpm dev publish --dry-run
```

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old src/core, src/commands, src/builders, src/index.ts"
```

---

### Task 30: Update tsconfig.json

**Files:**
- Modify: `tsconfig.json`

**Step 1:** Update `exclude` to remove `src/scripts` if moved, add `src/shared` to include:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 2: Final full verification**

```bash
pnpm build && pnpm dev chains && pnpm dev tokens
```

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: update tsconfig paths for new directory structure"
```

---

## Summary

| Phase | Tasks | Key Deliverables |
|-------|-------|-----------------|
| 1: Foundation | 1–4 | NestJS deps, `shared/` types + security + errors |
| 2: ConfigModule | 5–7 | Typed config with Zod, configurable deadline + dAppID |
| 3: BlockchainModule | 8–18 | ChainRegistry with `onModuleInit`, all chain logic co-located, `useAsync`, per-call TronWeb, `RpcService` |
| 4: QuoteModule | 19 | Injectable `QuoteService` |
| 5: IntentModule | 20–21 | Pure `IntentBuilder`, `IntentStorage` persistence |
| 6: StatusModule | 22 | Multi-chain `StatusService` |
| 7: CliModule | 23–27 | `PromptService`, `DisplayService`, all commands |
| 8: Bootstrap | 28–30 | `AppModule`, `main.ts`, cleanup |

**Issues resolved:** All 12 from `ARCHITECTURE.md`
