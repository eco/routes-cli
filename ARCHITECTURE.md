# Routes CLI — Architecture Document

> Generated 2026-02-20. Intended as the foundation for the upcoming architecture improvement initiative.
> For a developer how-to guide on adding new chains, see the "Quick Reference" at the bottom.

---

## Table of Contents

1. [Overview](#1-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Core Type System](#3-core-type-system)
4. [Universal Address System](#4-universal-address-system)
5. [Configuration Layer](#5-configuration-layer)
6. [Intent Construction](#6-intent-construction)
7. [Blockchain Publisher Layer](#7-blockchain-publisher-layer)
8. [CLI Layer](#8-cli-layer)
9. [Security Architecture](#9-security-architecture)
10. [Data & Control Flows](#10-data--control-flows)
11. [Module Dependency Graph](#11-module-dependency-graph)
12. [Build System](#12-build-system)
13. [Supported Chains & Tokens](#13-supported-chains--tokens)
14. [Known Issues & Improvement Opportunities](#14-known-issues--improvement-opportunities)
15. [Quick Reference: Adding a New Chain](#15-quick-reference-adding-a-new-chain)

---

## 1. Overview

Routes CLI is a command-line tool for publishing **cross-chain intents** on EVM, TVM (Tron), and SVM (Solana) blockchains. Built by Eco Protocol, it lets users specify a **reward** on a source chain in exchange for a solver executing a **route** on a destination chain.

**Core Concepts:**
- **Intent** = Route (what to do on destination) + Reward (what to pay on source)
- **Route** = A series of smart contract calls to execute on the destination chain
- **Reward** = Tokens/native currency locked on the source chain as solver incentive
- **Universal Address** = 32-byte chain-agnostic address format used throughout all internal logic
- **Publisher** = Chain-specific class responsible for broadcasting the intent transaction

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CLI LAYER                                   │
│  src/index.ts → commands/ → cli/prompts/ → utils/logger.ts         │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   INTENT SERVICE LAYER                              │
│  src/core/services/intent-service.ts                                │
│  ├── Quote fetching (src/core/utils/quote.ts)                       │
│  └── Manual fallback route building                                 │
└───────────────────────────┬─────────────────────────────────────────┘
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
┌─────────────────────┐      ┌────────────────────────────────────────┐
│  ENCODING LAYER     │      │         CONFIGURATION LAYER            │
│  portal-encoder.ts  │      │  config/chains.ts   config/tokens.ts   │
│  intent-converter   │      │  config/env.ts      chain-registry.ts  │
└─────────────────────┘      └────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    PUBLISHER LAYER                                  │
│   BasePublisher (abstract)                                          │
│   ├── EVMPublisher  → viem (PublicClient + WalletClient)            │
│   ├── TVMPublisher  → TronWeb                                       │
│   └── SVMPublisher  → @solana/web3.js + Anchor                     │
└─────────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   ADDRESS SYSTEM                                    │
│   AddressNormalizer  ──  UniversalAddress  ──  ChainRegistry        │
│   (normalize / denormalize at all chain boundaries)                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Key principle:** All internal data flows in `UniversalAddress` format. Denormalization to chain-native formats happens *only* inside publisher classes and *only* just before blockchain calls.

---

## 3. Core Type System

### ChainType Enum

```typescript
// src/core/interfaces/intent.ts
enum ChainType {
  EVM = 'EVM',   // Ethereum-compatible chains
  TVM = 'TVM',   // Tron Virtual Machine
  SVM = 'SVM',   // Solana Virtual Machine
}
```

### Intent Interface

The central data structure of the system. **All addresses stored as UniversalAddress.**

```typescript
interface Intent {
  intentHash?: Hex;           // Computed after creation
  destination: bigint;        // Destination chain ID
  sourceChainId: bigint;      // Source chain ID

  route: {
    salt: Hex;                // Random 32-byte replay protection
    deadline: bigint;         // Unix seconds — route execution deadline
    portal: UniversalAddress; // Portal contract on destination chain
    nativeAmount: bigint;     // Native token for route execution
    tokens: Array<{ amount: bigint; token: UniversalAddress }>;
    calls: Array<{
      data: Hex;
      target: UniversalAddress;
      value: bigint;
    }>;
  };

  reward: {
    deadline: bigint;         // Unix seconds — reward claiming deadline
    creator: UniversalAddress;
    prover: UniversalAddress; // Authorized prover/solver
    nativeAmount: bigint;
    tokens: Array<{ amount: bigint; token: UniversalAddress }>;
  };
}
```

### Blockchain Address Types

```typescript
type EvmAddress   = Address;                              // viem Address (0x + 40 hex)
type TronAddress  = `T${string}`;                         // Base58, starts with 'T'
type SvmAddress   = string & { _brand: 'SvmAddress' };   // Base58 Solana pubkey
type BlockchainAddress = EvmAddress | TronAddress | SvmAddress;
```

### Configuration Types

```typescript
interface ChainConfig {
  id: bigint;
  name: string;
  env: 'production' | 'development';
  type: ChainType;
  rpcUrl: string;
  portalAddress?: UniversalAddress;
  proverAddress?: UniversalAddress;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<string, UniversalAddress>; // key = chainId.toString()
}
```

### Publisher Result Types

```typescript
interface PublishResult {
  success: boolean;
  transactionHash?: string;
  intentHash?: string;
  error?: string;
  vaultAddress?: string;   // EVM vault address created on publish
  decodedData?: unknown;   // SVM program output
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
}
```

### Error Types

```typescript
enum ErrorCode {
  INVALID_ADDRESS       = 'INVALID_ADDRESS',
  INVALID_PRIVATE_KEY   = 'INVALID_PRIVATE_KEY',
  INSUFFICIENT_BALANCE  = 'INSUFFICIENT_BALANCE',
  UNSUPPORTED_CHAIN     = 'UNSUPPORTED_CHAIN',
  NETWORK_ERROR         = 'NETWORK_ERROR',
  TRANSACTION_FAILED    = 'TRANSACTION_FAILED',
  CONFIGURATION_ERROR   = 'CONFIGURATION_ERROR',
  QUOTE_SERVICE_ERROR   = 'QUOTE_SERVICE_ERROR',
}

class RoutesCliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly isUserError: boolean = false,
    public readonly cause?: unknown
  )
  // Factory methods: invalidAddress(), invalidPrivateKey(),
  //                  insufficientBalance(), unsupportedChain(), etc.
}
```

### Validation Schemas (Zod)

| Schema | Pattern |
|--------|---------|
| `EvmAddressSchema` | `/^0x[a-fA-F0-9]{40}$/` |
| `UniversalAddressSchema` | `/^0x[a-fA-F0-9]{64}$/` |
| `TvmAddressSchema` | Base58 `T[34 chars]` or hex `0x41[40 hex]` |
| `SvmAddressSchema` | Base58, 32–44 chars |
| `EvmPrivateKeySchema` | `/^0x[a-fA-F0-9]{64}$/` |
| `TvmPrivateKeySchema` | `/^[a-fA-F0-9]{64}$/` (no `0x`) |
| `TokenAmountSchema` | Positive decimal string |
| `ChainIdSchema` | Positive bigint |

---

## 4. Universal Address System

### Design Rationale

The intent system is *cross-chain*. A single `Intent` struct contains addresses from multiple chains (e.g. the creator on Ethereum, the portal on Solana). A single 32-byte address format eliminates `switch (chainType)` statements throughout the codebase and makes the `Intent` interface chain-agnostic.

### Format

```
UniversalAddress = "0x" + 64 hex characters  (32 bytes)

EVM (20 bytes, zero-padded):
  0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b
    ^^^^^^^^^^^^^^^^^^^^^^^^ 12 zero bytes   ^^^^^^^^^^^^^^^^^^^^^^^^ 20-byte EVM addr

TVM (21 bytes, Tron 0x41 prefix, padded):
  0x0000000000000000000000004166b86ac24bd89bf2e8c33a3a6c4b63d5c4acef

SVM (32 bytes, no padding):
  0xc69a84e3e1abff0111b65bc2daa7a8b6b2a0cec08d6c6d2c1b2f0e4cb3de5f7
```

### Normalization Rules

| Chain | Native Format | Universal Encoding |
|-------|-------------|-------------------|
| EVM   | `0x` + 40 hex (checksummed) | Left-pad to 32 bytes with zeros |
| TVM   | Base58 `T...` | Convert to hex `0x41...`, pad to 32 bytes |
| SVM   | Base58 (32-byte pubkey) | Raw 32-byte pubkey as hex |

### AddressNormalizer API (`src/core/utils/address-normalizer.ts`)

```typescript
// Normalize: chain-native → UniversalAddress
AddressNormalizer.normalize(address, chainType)    // generic dispatch
AddressNormalizer.normalizeEvm(evmAddress)
AddressNormalizer.normalizeTvm(tronAddress)
AddressNormalizer.normalizeSvm(solanaAddress | PublicKey)

// Denormalize: UniversalAddress → chain-native
AddressNormalizer.denormalize(universal, chainType) // generic, type-safe return
AddressNormalizer.denormalizeToEvm(universal)  → EvmAddress
AddressNormalizer.denormalizeToTvm(universal)  → TronAddress
AddressNormalizer.denormalizeToSvm(universal)  → SvmAddress
```

### Address Flow Rule (Critical)

```
User Input          Internal Logic          Blockchain / Display
(chain-native)  →  (UniversalAddress)  →   (chain-native)
    normalize()                                denormalize()
```

**Where to denormalize:**
- Inside publisher `publish()` — before any RPC or contract call
- Before displaying addresses to users in CLI output
- When calling external APIs that expect chain-native formats

**Where NOT to denormalize:**
- In the `Intent` struct
- In `chains.ts` / `tokens.ts` configuration
- When passing addresses between internal functions

### ChainHandler & ChainRegistry

Each chain type has a self-registering handler module:

```typescript
interface ChainHandler {
  readonly chainType: ChainType;
  validateAddress(address: string): boolean;
  normalize(address: string): UniversalAddress;
  denormalize(address: UniversalAddress): BlockchainAddress;
  getAddressFormat(): string;
}

// Singleton, populated by side-effect imports in src/index.ts:
export const chainRegistry = new ChainRegistry();
```

> **⚠️ Import order is critical.** `chains.ts` and `tokens.ts` call `AddressNormalizer.normalize()`
> at module load time. If chain handlers are not registered first the process throws on startup.
> The three handler imports in `src/index.ts` must always precede all other `@/` imports.

---

## 5. Configuration Layer

### Chain Configuration (`src/config/chains.ts`)

Chains are partitioned by `env`:
- **`production`** — loaded by default
- **`development`** — loaded when `NODE_CHAINS_ENV=development`

**Portal address env overrides:** `PORTAL_ADDRESS_ETH`, `PORTAL_ADDRESS_OPTIMISM`, `PORTAL_ADDRESS_BASE`, `PORTAL_ADDRESS_TRON`, `PORTAL_ADDRESS_SOLANA`

### Token Configuration (`src/config/tokens.ts`)

Tokens have addresses per chain, keyed by `chainId.toString()`. All addresses are auto-normalized to `UniversalAddress` at module load via `AddressNormalizer.normalize()`.

### Environment Configuration (`src/config/env.ts`)

All variables validated with Zod at startup. Unknown or malformed variables throw `RoutesCliError.configurationError`.

```
EVM_PRIVATE_KEY    0x + 64 hex chars             (required for EVM)
TVM_PRIVATE_KEY    64 hex chars, no 0x            (required for TVM)
SVM_PRIVATE_KEY    Base58 | [1,2,...] | 1,2,...   (required for SVM)

EVM_RPC_URL        optional override
TVM_RPC_URL        default: https://api.trongrid.io
TVM_RPC_URL_2      default: https://tron.publicnode.com  (fallback)
SVM_RPC_URL        default: https://api.mainnet-beta.solana.com
SVM_RPC_URL_2      default: https://solana.publicnode.com  (fallback)
SOLVER_URL         optional; enables solver-v2 quote endpoint
QUOTES_ENDPOINT_URL optional; uses this URL as the quotes endpoint
NODE_CHAINS_ENV    'production' (default) | 'development'
DEBUG              optional; enables verbose logging + stack traces
```

### Persistent CLI Config (`~/.eco-routes/config.json`)

Managed by the `config` command. Supports named profiles.

```json
{
  "defaultSourceChain": "base",
  "defaultDestinationChain": "optimism",
  "defaultPrivateKeys": { "EVM": "...", "TVM": "...", "SVM": "..." },
  "rpcUrls": { "base": "https://..." },
  "profiles": { "mainnet": {}, "testnet": {} },
  "currentProfile": "mainnet"
}
```

---

## 6. Intent Construction

### IntentService (`src/core/services/intent-service.ts`)

Central orchestrator for building intents. Coordinates quote fetching, manual fallback, user confirmation, and final reward/route assembly.

```typescript
interface IntentConfig {
  sourceChain: ChainConfig;
  destChain: ChainConfig;
  creator: UniversalAddress;
  recipient: UniversalAddress;
  rewardToken: { address: BlockchainAddress; decimals: number; symbol?: string };
  rewardAmount: bigint;
  rewardAmountStr: string;
  routeToken: { address: BlockchainAddress; decimals: number; symbol?: string };
}

interface BuildIntentResult {
  reward: Intent['reward'];
  encodedRoute: Hex;
  sourcePortal: UniversalAddress;
}
```

#### buildIntent() Flow

```
IntentService.buildIntent(config: IntentConfig)
  │
  ├─► Phase 1: getQuoteOrFallback()
  │     ├─ Calls quote service (see §6.1 below)
  │     └─ On failure: manual portal/prover prompts + manual route encoding
  │
  ├─► Phase 2: Construct reward object
  │     └─ { deadline, creator, prover (UniversalAddress), nativeAmount: 0, tokens }
  │
  ├─► Phase 3: Display "📋 Intent Summary" table
  │
  ├─► Phase 4: User confirmation prompt (default: true)
  │     └─ Throws "Publication cancelled by user" if denied
  │
  └─► Return: { reward, encodedRoute, sourcePortal }
```

### Quote Service (`src/core/utils/quote.ts`)

**Endpoint selection (priority order):**
1. `SOLVER_URL` → `{SOLVER_URL}/api/v2/quote/reverse`
2. `QUOTES_ENDPOINT_URL` → uses the exact value as the endpoint URL
3. Default → `https://quotes.eco.com/api/v3/quotes/single`

**Request:**
```typescript
{
  dAppID: 'eco-routes-cli',
  quoteRequest: {
    sourceChainID, sourceToken, destinationChainID, destinationToken,
    sourceAmount, funder, recipient   // all in chain-native format
  }
}
```

**Response (both formats normalized internally):**
```typescript
{
  quoteResponse: { encodedRoute, deadline, destinationAmount, estimatedFulfillTimeSec?, ... },
  contracts: { sourcePortal: Address, prover: Address, destinationPortal: Address }
}
```

### PortalEncoder (`src/core/utils/portal-encoder.ts`)

Encodes Route and Reward structs for the target chain. Handles address denormalization internally.

| Chain | Encoding | Library |
|-------|----------|---------|
| EVM | ABI encoding | viem `encodeAbiParameters` |
| TVM | ABI encoding (same as EVM) | viem `encodeAbiParameters` |
| SVM | Borsh serialization | `portalBorshCoder` |

```typescript
PortalEncoder.encode(route | reward, chainType): Hex
PortalEncoder.decode(data, chainType, 'route' | 'reward'): Route | Reward
PortalEncoder.isRoute(data): data is Route   // type guard
```

### IntentConverter (`src/core/utils/intent-converter.ts`)

Converts the universal-address-based `Intent` to EVM-native format before ABI encoding:

```typescript
toEVMIntent(intent: Intent): { route: EVMRoute; reward: EVMReward; ... }
toRewardEVMIntent(reward: Intent['reward']): EVMReward
toRouteEVMIntent(route: Intent['route']): EVMRoute
```

---

## 7. Blockchain Publisher Layer

### Class Hierarchy

```
BasePublisher (abstract)
├── EVMPublisher    viem PublicClient + WalletClient
├── TVMPublisher    TronWeb
└── SVMPublisher    @solana/web3.js Connection + Anchor Program
```

### BasePublisher Contract

```typescript
abstract class BasePublisher {
  constructor(rpcUrl: string)

  abstract publish(
    source: bigint, destination: bigint,
    reward: Intent['reward'], encodedRoute: string,
    keyHandle: KeyHandle,
    portalAddress?: UniversalAddress, proverAddress?: UniversalAddress
  ): Promise<PublishResult>

  abstract getBalance(address: string, chainId?: bigint): Promise<bigint>
  abstract validate(reward: Intent['reward'], senderAddress: string): Promise<ValidationResult>

  protected handleError(error: unknown): PublishResult
  protected runSafely(fn: () => Promise<PublishResult>): Promise<PublishResult>
  protected runPreflightChecks(sourceChainId: bigint): void  // validates allowlist
}
```

**Factory function:**
```typescript
createPublisher(chainType: ChainType, rpcUrl: string): BasePublisher
```

Each publisher accepts an optional client factory constructor parameter for testability:
```typescript
new EVMPublisher(rpcUrl, mockEvmClientFactory)
new TVMPublisher(rpcUrl, mockTvmClientFactory)
new SVMPublisher(rpcUrl, mockSvmClientFactory)
```

### EVMPublisher

**Tech:** viem

**Client strategy:**
- Cached `PublicClient` for all reads (balance checks, allowances, validation)
- Fresh `WalletClient` created per `publish()` call for signing

**Publish sequence:**
1. Preflight check (chain ID in allowlist)
2. Derive account from `KeyHandle` via `privateKeyToAccount(key)`
3. For each reward token: check balance → check allowance → `approve(portal, maxUint256)` if needed (wait 2 confirmations)
4. Denormalize all addresses (UniversalAddress → checksummed EVM)
5. `encodeFunctionData("publishAndFund", [destination, encodedRoute, evmReward, false])`
6. `walletClient.sendTransaction({ to: portalAddress, data, value: nativeAmount })`
7. Wait for receipt; parse `IntentPublished` event logs
8. Return `{ success, transactionHash, intentHash }`

**Contract functions called on Portal:**
```solidity
function publishAndFund(uint64 destination, bytes route, Reward reward, bool allowPartial)
  external payable returns (bytes32 intentHash, address vault)
```

**Contract functions called on ERC-20:**
```solidity
function balanceOf(address account) view returns (uint256)
function allowance(address owner, address spender) view returns (uint256)
function approve(address spender, uint256 amount) returns (bool)
```

### TVMPublisher

**Tech:** TronWeb

**Key security invariant:** Private key is set on the TronWeb instance immediately before use and always cleared in a `finally` block.

**Publish sequence:**
1. Preflight check
2. `keyHandle.use(key => { tronWeb.setPrivateKey(key); ... })` — key captured synchronously
3. `try {` For each reward token: TRC-20 `approve(portal, amount)` → poll confirmation (20 × 4s)
4. Denormalize addresses (UniversalAddress → Base58 Tron)
5. Call Portal `publishAndFund(dest, encodedRoute, tvmReward, false)` with TRX `callValue`
6. Compute `intentHash` locally via `PortalHashUtils`
7. `} finally { tronWeb.setPrivateKey('') }`

**TVM invariant:** At least one reward token is required (Tron Portal does not support native-only rewards).

**Transaction confirmation polling:** 20 attempts × 4-second interval. Checks `txInfo.blockNumber && receipt.result === 'SUCCESS'`.

### SVMPublisher

**Tech:** `@solana/web3.js` + `@coral-xyz/anchor`

**Private key formats supported:**
1. JSON byte array: `[1, 2, 3, ...]`
2. Comma-separated: `1, 2, 3, ...`
3. Base58 string (default Solana/Phantom export format)

**Publish sequence:**
1. Preflight check
2. Parse `Keypair` from `KeyHandle`
3. Derive portal `PublicKey` from chain config
4. Calculate `intentHash` and `routeHash` via `PortalHashUtils`
5. `setupAnchorProgram(connection, context)` → Anchor `Program` instance
6. `buildFundingTransaction()`:
   - Derive vault PDA: `["vault", intentHashBytes]`
   - Derive associated token accounts (funder ATA + vault ATA per token)
   - `program.methods.fund({ destination, routeHash, reward, allowPartial })`
   - Set `{ vault, payer, funder }` accounts + remaining token accounts
7. `sendAndConfirmTransaction()`: `skipPreflight: false`, `maxRetries: 3`, poll 30× at 1s intervals until `'confirmed'`
8. Return `{ success, transactionHash, intentHash }`

**PDA Derivation:**
```
vault PDA:             ["vault",            intentHash bytes]
proof PDA:             ["proof",            intentHash bytes, proverAddress bytes]
withdrawn_marker PDA:  ["withdrawn_marker", intentHash bytes]
```

**Connection config:**
```typescript
{
  commitment: 'confirmed',
  disableRetryOnRateLimit: true,
  confirmTransactionInitialTimeout: 60000,
}
```

### Portal Contract ABIs (`src/commons/abis/`)

Key Solidity signatures:

```solidity
// Portal contract
function publishAndFund(
  uint64 destination,
  bytes memory route,
  Reward memory reward,
  bool allowPartial
) external payable returns (bytes32 intentHash, address vault)

function fund(
  uint64 destination,
  bytes32 routeHash,
  Reward memory reward,
  bool allowPartial
) external payable returns (bytes32 intentHash)

event IntentPublished(
  bytes32 indexed intentHash,
  uint64 destination,
  bytes route,
  address indexed creator,
  address indexed prover,
  uint64 rewardDeadline,
  uint256 rewardNativeAmount,
  TokenAmount[] rewardTokens
)

// Reward struct
struct Reward {
  uint64 deadline;
  address creator;
  address prover;
  uint256 nativeAmount;
  TokenAmount[] tokens;
}
struct TokenAmount { address token; uint256 amount; }
```

---

## 8. CLI Layer

### Entry Point (`src/index.ts`)

**Import order is critical and must not be changed:**

```typescript
// MUST come first — populates chainRegistry before chains.ts/tokens.ts load:
import '@/blockchain/evm/evm-chain-handler';
import '@/blockchain/tvm/tvm-chain-handler';
import '@/blockchain/svm/svm-chain-handler';

// Only then can config files be imported:
import { listChains } from '@/config/chains';
import { listTokens } from '@/config/tokens';
```

**Startup sequence:**
1. Node >= 18 version check (exits with code 1 if failed)
2. `setupGlobalErrorHandlers()` — uncaught exceptions, unhandled rejections, SIGTERM/SIGINT
3. `ConfigService.fromEnvironment()` — loads and validates `.env`
4. Register all chain IDs in `chainRegistry` (security allowlist)
5. Create Commander program, register all commands
6. `program.parse(argv)`

### Commands

#### `publish` — Main Command

```
routes-cli publish [options]

Options:
  -s, --source <chain>       Source chain name or ID
  -d, --destination <chain>  Destination chain name or ID
  -k, --private-key <key>    Override env private key
  -r, --rpc <url>            Override RPC endpoint
  --recipient <address>      Recipient on destination chain
  --dry-run                  Validate only, do not broadcast
```

**Interactive publish flow:**

```
1.  "🎨 Interactive Intent Publishing"
2.  PROMPT: Select source chain     (list of all chains)
3.  PROMPT: Select destination chain (all except source)
4.  SECTION: "📏 Route Configuration (Destination Chain)"
5.  PROMPT: Select route token      (tokens on dest chain, or custom address+decimals)
6.  SECTION: "💰 Reward Configuration (Source Chain)"
7.  PROMPT: Select reward token
8.  PROMPT: Enter reward amount → parseUnits(str, decimals) → bigint
9.  SECTION: "👤 Recipient Configuration"
10. PROMPT: Enter recipient address → validate → normalize to UniversalAddress
11. DERIVE: keyHandle.use(rawKey => ({
              senderNative: getWalletAddress(chainType, rawKey),
              publishKeyHandle: new KeyHandle(rawKey)
            }))
12. BUILD: IntentService.buildIntent()
    ├── getQuoteOrFallback() with spinner
    ├── Display "📋 Intent Summary" table
    └── CONFIRM: "Publish this intent?" (default: true)
13. CHECK: --dry-run → log warning and exit
14. CREATE: createPublisher(sourceChain.type, rpcUrl)
15. SPINNER: "Publishing intent to blockchain..."
16. CALL: publisher.publish(source, dest, reward, encodedRoute, keyHandle, portal)
17. DISPLAY: Transaction result table (hash, intent hash, vault address)
```

#### `status` — Check Intent Status

```
routes-cli status <intentHash> -c <chain> [--watch] [--json] [--verbose]
```

Queries Portal contract for `IntentFulfilled` events. Currently **EVM-only**. Watch mode polls every 10 seconds.

#### `chains` — List Chains

Inline command. Displays table: Name, ID, Type, Native Currency.

#### `tokens` — List Tokens

Inline command. Displays table: Symbol, Name, Decimals, Available Chains.

#### `config` — Manage CLI Configuration

Subcommands: `list`, `set [-i]`, `get <key>`, `unset <key>`, `reset [--force]`
Profile management: `profile create|switch|delete|list`

### Logger (`src/utils/logger.ts`)

Singleton `logger` instance wrapping `ora` (spinners) and `cli-table3` (tables).

**Spinner lifecycle:** `spinner(text)` → `succeed/fail/warn/info(text?)`

**Display methods:**

| Method | Color | Prefix |
|--------|-------|--------|
| `success(msg)` | Green | ✅ |
| `error(msg)` | Red | ❌ |
| `warning(msg)` | Yellow | ⚠️ |
| `log(msg)` | Gray | — |
| `title(msg)` | Bold blue | — |
| `section(msg)` | Blue | — |

**Table methods:** `displayTable(headers, rows)`, `displayTransactionResult(result)`, `displayIntentSummary(summary)`, `displayKeyValue(data, title?)`

### Prompts (`src/cli/prompts/intent-prompts.ts`)

All prompts use `inquirer`. Types used: `list`, `input`, `confirm`, `password`.

| Prompt | Returns |
|--------|---------|
| `selectSourceChain` | `ChainConfig` |
| `selectDestinationChain` | `ChainConfig` |
| `selectToken` | `{ address, decimals, symbol? }` |
| `configureReward` | `{ token, amount: bigint, amountStr }` |
| `selectRecipient` | `UniversalAddress` |
| Intent confirmation | `boolean` (default `true`) |
| Destructive operations | `boolean` (default `false`) |

### Error Handling (`src/utils/error-handler.ts`)

**Error class hierarchy:**

```
RoutesCliError   (code: ErrorCode, isUserError: boolean) — primary error type
CliError         generic CLI errors
NetworkError     ECONNREFUSED, ENOTFOUND, etc.
ValidationError  input validation failures
ConfigurationError config issues
BlockchainError  chain operation failures
```

**Retry wrapper:**
```typescript
withRetry(fn, maxRetries=3, delayMs=1000)
// Retries only: NetworkError, ECONNREFUSED, ETIMEDOUT, ENOTFOUND
// Backoff: delayMs × 1.5 per attempt
```

---

## 9. Security Architecture

### KeyHandle — Private Key Zeroization

```typescript
// src/core/security/key-manager.ts
class KeyHandle {
  private buffer: Buffer;  // mutable; can be zeroed

  use<T>(fn: (key: string) => T): T {
    try { return fn(this.buffer.toString('utf8')); }
    finally { this.buffer.fill(0); }  // always zeroed, even on throw
  }
}
```

**Async limitation:** `use()` is synchronous. The buffer is zeroed immediately after `fn` returns — before any `await`. For async publisher flows, callers must derive all synchronous key material (account, address) inside `use()` and create a second `KeyHandle` for the async publisher:

```typescript
// src/commands/publish.ts
const { senderNative, publishKeyHandle } = keyHandle.use(rawKey => ({
  senderNative:     getWalletAddress(sourceChain.type, rawKey),
  publishKeyHandle: new KeyHandle(rawKey),  // second handle for publisher
}));
```

### Chain ID Allowlist

All chain IDs from `CHAIN_CONFIGS` are registered at startup. `BasePublisher.runPreflightChecks()` verifies the source chain ID is allowlisted before any transaction is sent. Publishing to an unrecognized chain ID throws immediately.

### TVM Key Clearing

TronWeb requires the private key on the global instance object. `TVMPublisher` enforces a strict try-finally pattern:
```typescript
this.tronWeb.setPrivateKey(key);
try { /* all TronWeb operations */ }
finally { this.tronWeb.setPrivateKey(''); }  // always cleared
```

### Address & Input Validation

All user-supplied addresses are validated with Zod schemas before normalization. Invalid inputs throw `RoutesCliError.invalidAddress()` with a chain-specific format hint.

---

## 10. Data & Control Flows

### Address Flow

```
User types:   "0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b"
                      │  normalize(addr, ChainType.EVM)
                      ▼
Internal:     "0x000000000000000000000000742d35cc6634c0532925a3b8d65c32c2b3f6de1b"
              (UniversalAddress stored in Intent, passed between functions)
              │                                              │
              │  at blockchain boundary                      │  at display boundary
              ▼                                              ▼
   EVMPublisher.publish()                          logger.displayIntentSummary()
   TVMPublisher.publish()                          status command output
   SVMPublisher.publish()
   PortalEncoder.encode()
```

### Publish Transaction Data Flow

```
CLI Prompts (chain names, token, amount, recipient)
  │
  └─► IntentService.buildIntent()
        │
        ├─► getQuote() → encodedRoute (hex), sourcePortal, proverAddress, deadline
        │   (addresses returned in chain-native format; normalized before storing)
        │
        └─► reward = {
              deadline, prover (UniversalAddress), creator (UniversalAddress),
              nativeAmount: 0n, tokens: [{ token: UniversalAddress, amount: bigint }]
            }
              │
              └─► publisher.publish(source, dest, reward, encodedRoute, keyHandle, portal)
                    │
                    ├─ EVM:
                    │   denormalize addresses in reward
                    │   viem encodeFunctionData("publishAndFund", [...])
                    │   walletClient.sendTransaction({ data, value })
                    │
                    ├─ TVM:
                    │   denormalize addresses in reward
                    │   tronWeb.contract.publishAndFund(...).send({ callValue })
                    │
                    └─ SVM:
                        setupAnchorProgram()
                        buildFundingTransaction() [vault PDA + ATAs]
                        sendAndConfirmTransaction()
```

---

## 11. Module Dependency Graph

Layers are strictly one-directional. Lower layers must never import from higher layers.

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 4 — Commands  (src/commands/, src/cli/, src/index.ts)    │
│  May import from: all layers below                              │
└──────────────────────────────────┬──────────────────────────────┘
                                   │
┌──────────────────────────────────▼──────────────────────────────┐
│  Layer 3 — Blockchain  (src/blockchain/)                        │
│  evm-publisher, tvm-publisher, svm-publisher                    │
│  base-publisher, publisher-factory                              │
│  evm/, tvm/, svm/ (client factories, chain handlers, PDAs)      │
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
│  security/: key-manager                                         │
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

**Cross-cutting (importable from any layer):**
- `src/utils/logger.ts` — singleton logger
- `src/core/errors/` — `RoutesCliError`, `ErrorCode`

---

## 12. Build System

### TypeScript Configuration

```
target:  ES2021
module:  CommonJS
outDir:  ./dist
strict:  true (all strict checks: noImplicitAny, strictNullChecks, noUnusedLocals, etc.)
paths:   @/* → src/*
exclude: node_modules, dist, src/scripts, tests
```

### Scripts

```bash
pnpm build            # tsc
pnpm dev              # tsx + tsconfig-paths (production chains)
pnpm dev:testnet      # NODE_CHAINS_ENV=development tsx
pnpm start            # node dist/index.js (production)
pnpm clean            # rm -rf dist
pnpm test             # jest (all)
pnpm test:unit        # tests/core | config | blockchain
pnpm test:integration # tests/integration
pnpm test:coverage    # jest --coverage
pnpm test:e2e         # jest.e2e.config.ts
pnpm typecheck        # tsc --noEmit
pnpm lint             # eslint src tests
pnpm format           # prettier
pnpm docs             # typedoc → GitHub Pages
```

### Key Dependencies

| Category | Package | Version | Purpose |
|----------|---------|---------|---------|
| EVM | `viem` | ^2.40.1 | EVM client, ABI encoding, address utils |
| Tron | `tronweb` | ^6.2.0 | Tron client + address conversion |
| Solana | `@solana/web3.js` | ^1.91.8 | Solana client |
| Solana | `@solana/spl-token` | ^0.4.14 | SPL token accounts |
| Solana | `@coral-xyz/anchor` | ^0.32.1 | Anchor IDL + program interaction |
| CLI | `commander` | ^12.1.0 | Argument parsing |
| CLI | `inquirer` | ^9.3.7 | Interactive prompts |
| CLI | `ora` | ^8.2.0 | Spinners |
| CLI | `chalk` | ^4.1.2 | Terminal colors |
| CLI | `cli-table3` | ^0.6.5 | Formatted tables |
| Validation | `zod` | ^4.3.6 | Schema validation |
| Config | `dotenv` | ^16.4.5 | `.env` loading |
| Dev | `tsx` | ^4.20.5 | TypeScript execution in dev |
| Dev | `jest` | ^30.2.0 | Test runner |
| Dev | `husky + lint-staged` | latest | Pre-commit hooks |
| Dev | `typedoc` | ^0.28.17 | API documentation |
| Dev | `@changesets/cli` | latest | Changelog management |

---

## 13. Supported Chains & Tokens

### Production Chains

| Name | ID | Type | Portal | RPC Default |
|------|----|------|--------|-------------|
| Ethereum | 1 | EVM | — | viem default |
| Optimism | 10 | EVM | — | https://mainnet.optimism.io |
| BSC | 56 | EVM | — | viem default |
| Base | 8453 | EVM | `0x399Dbd5...` | https://mainnet.base.org |
| Arbitrum | 42161 | EVM | — | viem default |
| Polygon | 137 | EVM | — | viem default |
| Ronin | 2020 | EVM | — | viem default |
| Sonic | 146 | EVM | — | viem default |
| Hyper EVM | 999 | EVM | — | viem default |
| Tron | 728126428 | TVM | — | https://api.trongrid.io |
| Solana | 1399811149 | SVM | — | https://api.mainnet-beta.solana.com |

### Development / Testnet Chains

| Name | ID | Type | Portal | Prover |
|------|----|------|--------|--------|
| Base Sepolia | 84532 | EVM | `0x06EFdb68...` | `0x9523b6c0...` |
| Optimism Sepolia | 11155420 | EVM | `0x06EFdb68...` | `0x9523b6c0...` |
| Plasma Testnet | 9746 | EVM | `0x06EFdb68...` | `0x9523b6c0...` |
| Sepolia | 11155111 | EVM | `0x06EFdb68...` | `0x9523b6c0...` |
| Tron Shasta | 2494104990 | TVM | — | — |
| Solana Devnet | 1399811150 | SVM | — | — |

### Configured Tokens

| Symbol | Decimals | Chains |
|--------|----------|--------|
| USDC | 6 | ETH, OP, Base, Polygon, Arbitrum, HyperEVM, Ronin, Sonic, Base Sepolia, OP Sepolia, Plasma, Sepolia, Solana mainnet/devnet |
| USDT | 6 | ETH, OP, Base, Tron mainnet/shasta, HyperEVM, Solana mainnet |
| bUSDC | 18 | BSC |
| bUSDT | 18 | BSC |

---

## 14. Known Issues & Improvement Opportunities

Structural issues observed during architecture research. Intended as input for the improvement initiative.

### 1. Import Order Side-Effect Dependency
**File:** `src/index.ts`
Chain handlers must be imported before config files due to `chainRegistry` side-effects at module load time. This is fragile and breaks silently if auto-sort tools reorder the imports.
**Opportunity:** Explicit `initializeChainHandlers()` function called before any config access.

### 2. KeyHandle Async Limitation
**Files:** `src/core/security/key-manager.ts`, `src/commands/publish.ts`
`KeyHandle.use()` zeroes the buffer synchronously after `fn()` returns. For async publisher flows a second `KeyHandle` must be constructed from the raw key, partially defeating the zeroization guarantee.
**Opportunity:** An async-aware `KeyHandle` that defers zeroization until `dispose()` is explicitly called.

### 3. Intent Persistence Not Implemented
CLAUDE.md and the existing ARCHITECTURE.md describe intent storage to `~/.routes-cli/intents.json` but this is not implemented. Refunds require manual record-keeping.
**Opportunity:** Implement the local intent store as described.

### 4. IntentService Mixes Concerns
`src/core/services/intent-service.ts` combines quote fetching, UI prompts, reward construction, and route encoding in a single class.
**Opportunity:** Separate into `QuoteService` (pure data), `IntentBuilder` (pure construction), and `PublishOrchestrator` (UX + confirmation flow).

### 5. No Standalone IntentBuilder
CLAUDE.md references `src/builders/intent-builder.ts` with a fluent builder pattern, but the file does not exist. All intent construction is coupled to CLI prompts.
**Opportunity:** Implement a prompt-free `IntentBuilder` to enable programmatic SDK usage.

### 6. Missing Portal Addresses on Most Production Chains
Only Base (mainnet) and the four testnet chains have portal addresses configured. All other production chains depend entirely on the quote service to supply the portal address.
**Opportunity:** Populate portal and prover addresses for all chains where Eco Protocol is deployed.

### 7. Status Command is EVM-Only
Intent status (`IntentFulfilled` event query) only works on EVM chains.
**Opportunity:** Add `checkStatus()` to `BasePublisher` (or a separate `StatusChecker` interface) for TVM and SVM.

### 8. RPC Fallback is TVM/SVM-Only
TVM and SVM have configurable fallback RPC URLs; EVM has none.
**Opportunity:** Extend fallback RPC strategy uniformly to EVM chains.

### 9. No Tests Despite Full Test Infrastructure
Jest, ts-jest, E2E config, and test scripts are all set up but no test files exist. Core utilities (AddressNormalizer, PortalEncoder, IntentService) are untested.
**Opportunity:** Start with unit tests for `AddressNormalizer` and `PortalEncoder`; add publisher integration tests using the factory mock pattern.

### 10. Hardcoded dAppID in Quote Requests
`dAppID: 'eco-routes-cli'` is hardcoded in `quote.ts`.
**Opportunity:** Make configurable for SDK/programmatic usage.

### 11. TVMPublisher Singleton TronWeb State
TronWeb holds private key state on a shared instance. Concurrent use of `TVMPublisher` would be unsafe.
**Opportunity:** Create TronWeb per-publish-call or add a concurrency guard.

### 12. Manual Route Deadline is Hardcoded
The quote fallback path sets route deadline to `now + 2 hours` with no way to configure it.
**Opportunity:** Expose as a CLI flag or configurable default.

---

## 15. Quick Reference: Adding a New Chain

Complete checklist for adding `ChainType.XVM` support:

```
1. src/core/interfaces/intent.ts
      Add: XVM = 'XVM'  to ChainType enum

2. src/blockchain/xvm/xvm-chain-handler.ts  (new file)
      Implement ChainHandler interface
      Bottom: chainRegistry.register(new XvmChainHandler())

3. src/core/utils/address-normalizer.ts  (optional helpers)
      Add: static normalizeXvm(addr: XvmAddress): UniversalAddress
      Add: static denormalizeToXvm(addr: UniversalAddress): XvmAddress

4. src/blockchain/xvm/xvm-client-factory.ts  (new file)
      Define XvmClientFactory interface
      Export: DefaultXvmClientFactory

5. src/blockchain/xvm-publisher.ts  (new file)
      Extend BasePublisher
      Implement publish(), getBalance(), validate() — all with `override` keyword
      Denormalize addresses inside publish() before any RPC call

6. src/blockchain/publisher-factory.ts
      Add: case ChainType.XVM: return new XvmPublisher(rpcUrl, options?.xvmClientFactory)

7. src/config/chains.ts
      Add XVM chain configs with portalAddress in UniversalAddress format

8. src/config/tokens.ts
      Add token addresses for XVM chains (in UniversalAddress format)

9. src/index.ts  (BEFORE all other @/ imports!)
      Add: import '@/blockchain/xvm/xvm-chain-handler'

10. tests/__mocks__/xvm-client-factory.mock.ts
       Create mock factory for integration tests
```

After step 9, `AddressNormalizer.normalize(addr, ChainType.XVM)` and
`AddressNormalizer.denormalize(addr, ChainType.XVM)` work automatically everywhere.
