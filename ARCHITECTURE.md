# Routes CLI — Architecture

> **Audience:** Developers who want to understand the internals or add support for a new chain.
> After reading this document you should be able to add a new chain type without reading
> `publish.ts` or `address-normalizer.ts`.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Universal Address System](#2-universal-address-system)
3. [Intent Lifecycle](#3-intent-lifecycle)
4. [Publisher Pattern](#4-publisher-pattern)
5. [Chain Registry](#5-chain-registry)
6. [Module Dependency Graph](#6-module-dependency-graph)
7. [Quote Service Integration](#7-quote-service-integration)

---

## 1. System Overview

The following diagram shows the complete data flow from CLI input to on-chain transaction:

```
┌──────────────────────────────────────────────────────────────────┐
│                          CLI Layer                               │
│                                                                  │
│   src/index.ts                                                   │
│       │                                                          │
│       ├── src/commands/publish.ts  (thin orchestrator ~100 LOC)  │
│       │       │                                                  │
│       │       ├── src/cli/prompts/intent-prompts.ts              │
│       │       │       └── Interactive user prompts (inquirer)    │
│       │       │                                                  │
│       │       ├── src/cli/key-provider.ts                        │
│       │       │       └── Private key loading + wallet address   │
│       │       │                                                  │
│       │       └── src/core/services/intent-service.ts            │
│       │               ├── Quote fetching (getQuote)              │
│       │               └── Intent + route assembly                │
│       │                                                          │
│       ├── src/commands/status.ts                                 │
│       └── src/commands/config.ts                                 │
└──────────────────────────────────────────────────────────────────┘
                            │
                            │  reward + encodedRoute
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Blockchain Layer                           │
│                                                                  │
│   src/blockchain/publisher-factory.ts                           │
│       │  createPublisher(chainType, rpcUrl)                      │
│       │                                                          │
│       ├── EvmPublisher  ──────────────────► EVM chains           │
│       │   (viem)             transactions  (ETH, OP, Base...)    │
│       │                                                          │
│       ├── TvmPublisher  ──────────────────► Tron blockchain      │
│       │   (tronweb)                                              │
│       │                                                          │
│       └── SvmPublisher  ──────────────────► Solana blockchain    │
│           (@solana/web3.js + Anchor)                             │
└──────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────────────┐
│                       Portal Contracts                           │
│                                                                  │
│   Each chain has a deployed portal contract that receives the    │
│   intent.  The portal emits IntentPublished, records the reward  │
│   on-chain, and coordinates fulfilment by solvers.               │
└──────────────────────────────────────────────────────────────────┘
```

**Key principle:** All internal data flows in `UniversalAddress` format. Denormalization to
chain-native formats happens *only* inside publisher classes and *only* just before blockchain calls.

---

## 2. Universal Address System

### What it is

A **UniversalAddress** is a 32-byte hex string (`0x` + 64 hex characters) that represents any
blockchain address regardless of its native format:

| Chain type | Native format | Example |
|------------|---------------|---------|
| EVM | 20-byte hex (`0x` + 40 chars) | `0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b` |
| TVM (Tron) | Base58 (21 bytes, starts with `T`) | `TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH` |
| SVM (Solana) | Base58 (32 bytes) | `So11111111111111111111111111111111111111112` |

UniversalAddress (all three normalized):

```
0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b
  ^^^^^^^^^^^^^^^^^^^^^^^^  ←  12 zero bytes of EVM padding
                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  ←  20-byte EVM address
```

### Why it exists

The intent system is *cross-chain*. A single `Intent` struct contains addresses from multiple
chains (e.g. the creator on Ethereum, the portal on Solana). A single address format eliminates
switch statements throughout the codebase and makes the `Intent` interface chain-agnostic.

### Normalize / Denormalize lifecycle

```
User input (chain-native)
    │
    │  AddressNormalizer.normalize(addr, chainType)
    │      delegates to → chainRegistry.get(chainType).normalize(addr)
    │
    ▼
UniversalAddress   ← used everywhere internally
    │
    │  AddressNormalizer.denormalize(addr, chainType)   ← only at boundaries
    │      delegates to → chainRegistry.get(chainType).denormalize(addr)
    │
    ▼
Chain-native format (for blockchain calls or user display)
```

**Where to denormalize:**
- Inside publisher `publish()` — convert portal/token/creator addresses before sending txn
- Before displaying addresses to users in CLI output
- When calling external APIs that expect chain-native formats

**Where NOT to denormalize:**
- In the `Intent` struct
- In config files (`chains.ts`, `tokens.ts` store UniversalAddress)
- When passing addresses between internal functions

### Encoding details

| Chain type | Encoding strategy |
|------------|-------------------|
| EVM | Zero-pad 20-byte address to 32 bytes (left-pad with 12 zero bytes) |
| TVM | Hex representation of Tron's 21-byte address, padded to 32 bytes |
| SVM | Raw 32-byte Solana `PublicKey` → hex string (no padding needed) |

---

## 3. Intent Lifecycle

### Structure

An `Intent` has two main components:

```typescript
interface Intent {
  sourceChainId: bigint;   // Where the reward is offered
  destination:  bigint;    // Where the route executes

  route: {
    salt:        Hex;      // Random bytes for replay protection
    deadline:    bigint;   // Unix timestamp — solver must execute by this time
    portal:      UniversalAddress; // Portal contract on the destination chain
    tokens:      Array<{ token: UniversalAddress; amount: bigint }>;
    calls:       Array<{ target: UniversalAddress; data: Hex; value: bigint }>;
    nativeAmount: bigint;
  };

  reward: {
    deadline:    bigint;   // Unix timestamp — solver can claim by this time
    creator:     UniversalAddress; // Who funded the reward
    prover:      UniversalAddress; // Who can prove fulfillment
    tokens:      Array<{ token: UniversalAddress; amount: bigint }>;
    nativeAmount: bigint;
  };
}
```

### Building an intent (step by step)

```
1.  User selects source chain + destination chain
2.  User selects route token (what they want on destination)
3.  User configures reward (what they're paying on source)
4.  IntentService calls getQuote() → receives encodedRoute + contract addresses
        ↓ (if quote fails, user enters route config manually)
5.  IntentService assembles the reward struct (with UniversalAddresses)
6.  PortalEncoder.encode(route, chainType) → Uint8Array / Hex for the portal call
7.  Publisher.validate(reward, senderAddress) → checks balances before submitting
8.  Publisher.publish(source, dest, reward, encodedRoute, privateKey, portalAddress)
        ↓
9.  Portal contract receives the intent, locks reward tokens, emits IntentPublished
10. Intent is stored in ~/.routes-cli/intents.json for refund tracking
```

### Encoding

`PortalEncoder` serializes the route or reward struct into ABI-encoded bytes for EVM/TVM,
or Borsh-encoded bytes for SVM:

```typescript
// Route → chain-specific bytes
const encoded = PortalEncoder.encode(route, ChainType.EVM);  // returns Hex

// Reward → decode for reading back
const decoded = PortalEncoder.decode(bytes, ChainType.EVM, /* isRoute */ false);
```

### Local intent storage

After a successful publish, the intent is appended to `~/.routes-cli/intents.json`:

```json
{
  "intentHash": "0x...",
  "sourceChainId": "8453",
  "destChainId": "10",
  "reward": { ... },
  "routeHash": "0x...",
  "publishedAt": 1700000000,
  "refundedAt": null
}
```

This file enables the `refund` command to look up past intents and check eligibility.

---

## 4. Publisher Pattern

### BasePublisher contract

```typescript
abstract class BasePublisher {
  // --- Abstract: must be implemented ---

  abstract publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    privateKey: string,
    portalAddress?: UniversalAddress,
    proverAddress?: UniversalAddress
  ): Promise<PublishResult>;

  abstract getBalance(address: string, chainId?: bigint): Promise<bigint>;

  abstract validate(
    reward: Intent['reward'],
    senderAddress: string
  ): Promise<ValidationResult>;

  // --- Concrete: shared helpers ---

  protected handleError(error: unknown): PublishResult { ... }
  protected async runSafely(fn: () => Promise<PublishResult>): Promise<PublishResult> { ... }
}
```

### ValidationResult

```typescript
interface ValidationResult {
  valid: boolean;
  errors: string[];   // empty = valid; multiple errors can be reported at once
}
```

### Key conventions

1. **All override keywords required.** Every method that implements a base abstract must use
   `override`. This converts silent signature drift into compile errors.
2. **Use `runSafely()`** in `publish()`. Wrap the entire publish body in `this.runSafely(async () => { ... })` instead of writing your own try/catch.
3. **Addresses arrive as UniversalAddress; denormalize inside the publisher**, e.g.:
   ```typescript
   const portal = AddressNormalizer.denormalizeToEvm(portalAddress);
   ```
4. **Key cleanup.** If your chain's client holds the private key as state (like TronWeb), clear it
   in a `finally` block regardless of success or failure.

### Adding a new publisher

1. Create `src/blockchain/<chain>-publisher.ts` extending `BasePublisher`
2. Implement all three abstract methods with the `override` keyword
3. Denormalize addresses inside `publish()` before any RPC calls
4. Implement a client factory interface (see below) and pass it to the constructor
5. Register the new `ChainType` enum value in `src/core/interfaces/intent.ts`
6. Add a case to `src/blockchain/publisher-factory.ts`

### Dependency injection (client factories)

Each publisher accepts an optional factory at construction time so tests can inject mocks:

```typescript
// Production: uses real clients
const publisher = new EvmPublisher(rpcUrl);

// Test: injects mock clients
const publisher = new EvmPublisher(rpcUrl, mockEvmClientFactory);
```

Factory interfaces live in `src/blockchain/<chain>/<chain>-client-factory.ts`.

---

## 5. Chain Registry

### Overview

The `ChainRegistry` is a runtime map from `ChainType` → `ChainHandler`. It eliminates all
`switch (chainType)` statements outside the registry itself.

### ChainHandler interface

```typescript
interface ChainHandler {
  readonly chainType: ChainType;

  // Address validation (used in prompts before normalize)
  validateAddress(address: string): boolean;

  // Address conversion
  normalize(address: string): UniversalAddress;
  denormalize(address: UniversalAddress): BlockchainAddress;

  // User-facing error messages
  getAddressFormat(): string;
}
```

### Registration (self-registering modules)

Handler files register themselves at import time. This is a *side-effect import* pattern:

```typescript
// src/blockchain/evm/evm-chain-handler.ts — end of file:
chainRegistry.register(new EvmChainHandler());
```

```typescript
// src/index.ts — these three imports MUST come before any config imports:
import '@/blockchain/evm/evm-chain-handler';
import '@/blockchain/tvm/tvm-chain-handler';
import '@/blockchain/svm/svm-chain-handler';
```

> **⚠️ Import order is critical.** `chains.ts` and `tokens.ts` call
> `AddressNormalizer.normalize()` at module load time to populate their address maps.
> `AddressNormalizer.normalize()` delegates to the chain registry. If chain handlers are not
> registered first, module initialization throws "unsupported chain type". Do not let auto-sort
> tools reorder these imports in `index.ts`.

### Adding a new chain type

1. Add the new value to the `ChainType` enum in `src/core/interfaces/intent.ts`
2. Create `src/blockchain/<vm>/<vm>-chain-handler.ts` implementing `ChainHandler`
3. Call `chainRegistry.register(new YourChainHandler())` at the bottom of the file
4. Import the handler file (side-effect only) near the top of `src/index.ts`
5. Implement address normalization logic in `AddressNormalizer` (static helpers)
6. Create a publisher (see §4)

No other files need to change for address handling. `AddressNormalizer.normalize()` and
`.denormalize()` will automatically dispatch to your new handler.

---

## 6. Module Dependency Graph

Layers are strictly one-directional. Lower layers must never import from higher layers.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4 — Commands  (src/commands/)                            │
│  src/index.ts, src/commands/publish.ts, status.ts, config.ts   │
│  src/cli/prompts/, src/cli/key-provider.ts                      │
│  May import from: all layers below                              │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────┐
│  Layer 3 — Blockchain  (src/blockchain/)                        │
│  evm-publisher.ts, tvm-publisher.ts, svm-publisher.ts           │
│  base-publisher.ts, publisher-factory.ts                        │
│  evm/, tvm/, svm/ (client factories + chain handlers)           │
│  May import from: core/, config/, commons/                      │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────┐
│  Layer 2 — Config  (src/config/)                                │
│  chains.ts, tokens.ts, env.ts, config-service.ts                │
│  May import from: core/, commons/                               │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────┐
│  Layer 1 — Core  (src/core/)                                    │
│  interfaces/, types/, errors/, validation/                      │
│  utils/: address-normalizer, portal-encoder, intent-converter   │
│          quote, chain-detector                                  │
│  chain/: chain-handler.interface, chain-registry               │
│  services/: intent-service                                      │
│  May import from: commons/ only                                 │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────┐
│  Layer 0 — Commons  (src/commons/)                              │
│  abis/, utils/error-handler, utils/serialize                    │
│  types/portal-idl.*                                             │
│  No internal @/ imports                                         │
└─────────────────────────────────────────────────────────────────┘
```

### Notable cross-cutting concerns

| Concern | Where it lives | Notes |
|---------|---------------|-------|
| Logging | `src/utils/logger.ts` | Wraps ora spinners + chalk; imported by any layer |
| Error types | `src/core/errors/` | `RoutesCliError` + `ErrorCode` enum |
| Zod schemas | `src/core/validation/` | Used by chain handlers + config |
| Intent storage | `src/core/services/` | `~/.routes-cli/intents.json` read/write |

---

## 7. Quote Service Integration

The quote service provides an `encodedRoute` (ABI-encoded bytes for the portal call) and the
portal/prover contract addresses for a given cross-chain transfer.

### URL selection (priority order)

```
1.  SOLVER_URL env set  →  {SOLVER_URL}/api/v2/quote/reverse      (solver-v2 API)
2.  QUOTES_PREPROD or
    QUOTES_API_URL set  →  https://quotes-preprod.eco.com/api/v3/quotes/single
3.  (default)           →  https://quotes.eco.com/api/v3/quotes/single
```

Setting `QUOTES_API_URL=any_value` (even an empty string evaluates to falsy) is the mechanism
to force the preprod endpoint — the variable value itself is not used as a URL.

### Response format differences

| API | Response shape |
|-----|----------------|
| solver-v2 | `{ quoteResponses: [...], contracts: {...} }` — array format |
| quote service v3 | `{ data: { quoteResponse: {...}, contracts: {...} } }` — wrapped |

`getQuote()` normalizes both into the same `QuoteResponse` shape before returning:

```typescript
interface QuoteResponse {
  quoteResponse?: { encodedRoute: string; deadline: number; ... };
  contracts: { sourcePortal: Address; prover: Address; destinationPortal: Address; };
}
```

### Fallback behavior

If `getQuote()` throws (network error, non-200, or missing `quoteResponses`), `IntentService`
falls back to interactive prompts where the user manually enters the portal address, prover
address, and encoded route. This ensures the CLI is usable even when the quote service is
unavailable.

### DEBUG mode

Set `DEBUG=1` to log the raw quote request and response to stdout, which is useful when
diagnosing quote format issues.

---

## Quick Reference: Adding a New Chain

Here is the complete checklist for adding `ChainType.XVM` support:

```
1. src/core/interfaces/intent.ts
      Add:  XVM = 'XVM'  to ChainType enum

2. src/blockchain/xvm/xvm-chain-handler.ts  (new file)
      Implement ChainHandler
      Export: class XvmChainHandler
      Bottom: chainRegistry.register(new XvmChainHandler())

3. src/core/utils/address-normalizer.ts  (optional helpers)
      Add: static normalizeXvm(addr: XvmAddress): UniversalAddress
      Add: static denormalizeToXvm(addr: UniversalAddress): XvmAddress

4. src/blockchain/xvm/xvm-client-factory.ts  (new file)
      Define XvmClientFactory interface
      Export: DefaultXvmClientFactory

5. src/blockchain/xvm-publisher.ts  (new file)
      Extend BasePublisher
      Implement: publish() / getBalance() / validate() — all with override keyword
      Accept: optional XvmClientFactory in constructor

6. src/blockchain/publisher-factory.ts
      Add case ChainType.XVM: return new XvmPublisher(rpcUrl, options?.xvmClientFactory)

7. src/config/chains.ts
      Add XVM chain configs with portalAddress in UniversalAddress format

8. src/config/tokens.ts
      Add token addresses for XVM chains (in UniversalAddress format)

9. src/index.ts  (BEFORE all other @/ imports)
      Add: import '@/blockchain/xvm/xvm-chain-handler'

10. tests/__mocks__/xvm-client-factory.mock.ts
       Create mock factory for integration tests
```

After step 9, `AddressNormalizer.normalize(addr, ChainType.XVM)` and
`AddressNormalizer.denormalize(addr, ChainType.XVM)` will work automatically everywhere
in the codebase without any further changes.
