# LayerZero Interest Quote Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add and run a 12-route quote-only production matrix for the LayerZero TopSwaps routes Eco explicitly identified as interesting.

**Architecture:** Reuse the existing `MatrixService` quote-only path and timestamped report format. Add Plasma mainnet to the static chain registry so the runner can select the EVM public quote actor, then add one curated JSON fixture whose IDs preserve the source CSV ranks; no CSV importer or settlement behavior is added.

**Tech Stack:** TypeScript, NestJS, nest-commander, Jest, viem chain definitions, JSON matrix fixtures, Yellow quote API.

## Global Constraints

- Work on `feat/matrix-run` and preserve the existing uncommitted `--case-delay-sec` changes and `config/matrix-pairs-a2a-production-nondust.json`.
- Include only CSV ranks `1, 3, 4-9, 11, 12, 14, 23` from the three embedded Eco-interest groups.
- Exclude rank 2 (`USDe -> mixed`) and every route whose source or destination is absent from Yellow's live chain endpoint.
- Normalize Plasma rank 6 from `USDT` to the deployed `USDT0` token.
- Resolve ranks 4 and 9 to Solana USDC according to the Eco-interest rollup rather than expanding `mixed` outputs.
- Use source amount `10` and `slippageBps: 50` for all 12 quote requests.
- Quote-only execution may perform HTTP requests but must never read signing keys, approve, publish, poll, or spend funds.
- Token addresses and decimals must match the approved design at `docs/superpowers/specs/2026-07-22-layerzero-interest-quote-matrix-design.md`.

---

## File Structure

- Modify `src/blockchain/chains.config.ts`: register Plasma mainnet as a production EVM chain using viem's canonical chain definition.
- Create `tests/blockchain/chains.config.test.ts`: lock Plasma's production chain metadata and prevent accidental removal.
- Create `config/matrix-pairs-layerzero-interest.json`: hold the 12 curated quote-only routes and public quote actors.
- Create `tests/matrix/layerzero-interest-config.test.ts`: validate the fixture's route IDs, amounts, slippage, chain set, and exact source/destination token mapping.
- Create `docs/diagnostics/2026-07-22-layerzero-interest-quotes.md`: record the run command, artifact, per-route quote outcome, and latency summary after execution.

### Task 1: Register Plasma Mainnet for Quote-Time Chain Resolution

**Files:**
- Modify: `src/blockchain/chains.config.ts`
- Create: `tests/blockchain/chains.config.test.ts`

**Interfaces:**
- Consumes: viem `plasma` chain definition.
- Produces: one `RawChainConfig` with `id: 9745n`, `name: 'Plasma'`, `env: 'production'`, and `type: ChainType.EVM`.

- [ ] **Step 1: Write the failing Plasma chain test**

Create `tests/blockchain/chains.config.test.ts`:

```typescript
import { RAW_CHAIN_CONFIGS } from '@/blockchain/chains.config';
import { ChainType } from '@/shared/types';

describe('production chain config', () => {
  it('registers Plasma mainnet as an EVM production chain', () => {
    const plasma = RAW_CHAIN_CONFIGS.find(chain => chain.id === 9745n);

    expect(plasma).toMatchObject({
      id: 9745n,
      name: 'Plasma',
      type: ChainType.EVM,
      env: 'production',
      rpcUrl: 'https://rpc.plasma.to',
      nativeCurrency: { name: 'Plasma', symbol: 'XPL', decimals: 18 },
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
pnpm test -- tests/blockchain/chains.config.test.ts --runInBand
```

Expected: FAIL because `RAW_CHAIN_CONFIGS` does not contain chain `9745`.

- [ ] **Step 3: Add Plasma mainnet using viem's chain definition**

Extend the import and add the config beside the other production EVM chains:

```typescript
import { arbitrum, bsc, hyperEvm, mainnet, plasma, polygon, ronin, sonic } from 'viem/chains';
```

```typescript
  {
    id: BigInt(plasma.id),
    name: plasma.name,
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: plasma.rpcUrls.default.http[0],
    nativeCurrency: plasma.nativeCurrency,
  },
```

- [ ] **Step 4: Run the focused test and verify green**

Run:

```bash
pnpm test -- tests/blockchain/chains.config.test.ts --runInBand
```

Expected: PASS, one test.

- [ ] **Step 5: Commit only the Plasma registry task**

```bash
git add src/blockchain/chains.config.ts tests/blockchain/chains.config.test.ts
git commit -m "feat(chains): register Plasma mainnet"
```

### Task 2: Add the Curated LayerZero Interest Fixture

**Files:**
- Create: `config/matrix-pairs-layerzero-interest.json`
- Create: `tests/matrix/layerzero-interest-config.test.ts`

**Interfaces:**
- Consumes: `MatrixConfigFile` and the existing public EVM/SVM quote actors.
- Produces: 12 `MatrixPairConfig` rows with stable IDs `LZ-01`, `LZ-03` through `LZ-09`, `LZ-11`, `LZ-12`, `LZ-14`, and `LZ-23`.

- [ ] **Step 1: Write the failing fixture contract test**

Create `tests/matrix/layerzero-interest-config.test.ts`:

```typescript
import config from '../../config/matrix-pairs-layerzero-interest.json';

const EXPECTED_ROUTES = [
  ['LZ-01', 1399811149, 1, '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
  ['LZ-03', 9745, 1, '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18],
  ['LZ-04', 1, 1399811149, '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6],
  ['LZ-05', 42161, 1, '0x46850aD61C2B7d64d08c9C754F45254596696984', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
  ['LZ-06', 9745, 1, '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
  ['LZ-07', 1399811149, 1, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', '0x0000000000000000000000000000000000000000', 6],
  ['LZ-08', 9745, 1, '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 18],
  ['LZ-09', 1, 1399811149, '0xe343167631d89B6Ffc58B88d6b7fB0228795491D', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 6],
  ['LZ-11', 1399811149, 1, 'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
  ['LZ-12', 1399811149, 1, '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 6],
  ['LZ-14', 1399811149, 1, 'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT', '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 9],
  ['LZ-23', 42161, 1, '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', '0x0000000000000000000000000000000000000000', 6],
] as const;

describe('LayerZero interest matrix config', () => {
  it('contains exactly the approved routes and quote parameters', () => {
    expect(
      config.pairs.map(pair => [
        pair.id,
        pair.sourceChainId,
        pair.destinationChainId,
        pair.inputToken,
        pair.outputToken,
        pair.inputDecimals,
      ])
    ).toEqual(EXPECTED_ROUTES);
    expect(config.pairs).toHaveLength(12);
    expect(config.pairs.every(pair => pair.amount === '10')).toBe(true);
    expect(config.pairs.every(pair => pair.slippageBps === 50)).toBe(true);
    expect(config.pairs.some(pair => pair.id === 'LZ-02')).toBe(false);
  });

  it('uses only public quote actors for EVM and SVM routes', () => {
    expect(config.quoteActors).toEqual({
      evm: '0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1',
      svm: '3vvcFp6rUuTrrYK7SSqQKeYYiwvZXWmMnmgLfXDKgAu6',
    });
  });
});
```

- [ ] **Step 2: Run the test and verify the red state**

Run:

```bash
pnpm test -- tests/matrix/layerzero-interest-config.test.ts --runInBand
```

Expected: FAIL because `config/matrix-pairs-layerzero-interest.json` does not exist.

- [ ] **Step 3: Create the 12-route fixture**

Create `config/matrix-pairs-layerzero-interest.json`:

```json
{
  "quoteActors": {
    "evm": "0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1",
    "svm": "3vvcFp6rUuTrrYK7SSqQKeYYiwvZXWmMnmgLfXDKgAu6"
  },
  "pairs": [
    { "id": "LZ-01", "label": "CSV 1: PYUSD Solana -> USDC Ethereum", "path": "source-swap", "sourceChainId": 1399811149, "destinationChainId": 1, "inputToken": "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-03", "label": "CSV 3: USDe Plasma -> USDC Ethereum", "path": "source-swap", "sourceChainId": 9745, "destinationChainId": 1, "inputToken": "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 18, "slippageBps": 50 },
    { "id": "LZ-04", "label": "CSV 4: PYUSD Ethereum -> USDC Solana", "path": "source-swap", "sourceChainId": 1, "destinationChainId": 1399811149, "inputToken": "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8", "outputToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-05", "label": "CSV 5: PYUSD Arbitrum -> USDC Ethereum", "path": "source-swap", "sourceChainId": 42161, "destinationChainId": 1, "inputToken": "0x46850aD61C2B7d64d08c9C754F45254596696984", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-06", "label": "CSV 6: USDT0 Plasma -> USDC Ethereum", "path": "source-swap", "sourceChainId": 9745, "destinationChainId": 1, "inputToken": "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-07", "label": "CSV 7: USDC Solana -> ETH Ethereum", "path": "dest-swap", "sourceChainId": 1399811149, "destinationChainId": 1, "inputToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "outputToken": "0x0000000000000000000000000000000000000000", "amount": "10", "inputDecimals": 6, "outputDecimals": 18, "slippageBps": 50 },
    { "id": "LZ-08", "label": "CSV 8: sUSDe Plasma -> USDC Ethereum", "path": "source-swap", "sourceChainId": 9745, "destinationChainId": 1, "inputToken": "0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 18, "slippageBps": 50 },
    { "id": "LZ-09", "label": "CSV 9: USDG Ethereum -> USDC Solana", "path": "source-swap", "sourceChainId": 1, "destinationChainId": 1399811149, "inputToken": "0xe343167631d89B6Ffc58B88d6b7fB0228795491D", "outputToken": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-11", "label": "CSV 11: USDS Solana -> USDC Ethereum", "path": "source-swap", "sourceChainId": 1399811149, "destinationChainId": 1, "inputToken": "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-12", "label": "CSV 12: USDG Solana -> USDC Ethereum", "path": "source-swap", "sourceChainId": 1399811149, "destinationChainId": 1, "inputToken": "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 6, "slippageBps": 50 },
    { "id": "LZ-14", "label": "CSV 14: USDe Solana -> USDC Ethereum", "path": "source-swap", "sourceChainId": 1399811149, "destinationChainId": 1, "inputToken": "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT", "outputToken": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", "amount": "10", "inputDecimals": 9, "slippageBps": 50 },
    { "id": "LZ-23", "label": "CSV 23: USDC Arbitrum -> ETH Ethereum", "path": "dest-swap", "sourceChainId": 42161, "destinationChainId": 1, "inputToken": "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", "outputToken": "0x0000000000000000000000000000000000000000", "amount": "10", "inputDecimals": 6, "outputDecimals": 18, "slippageBps": 50 }
  ]
}
```

- [ ] **Step 4: Run fixture and matrix helper tests**

Run:

```bash
pnpm test -- tests/matrix/layerzero-interest-config.test.ts tests/matrix/matrix.util.test.ts --runInBand
```

Expected: PASS, including the two new fixture tests.

- [ ] **Step 5: Commit only the fixture task**

```bash
git add config/matrix-pairs-layerzero-interest.json tests/matrix/layerzero-interest-config.test.ts
git commit -m "test(matrix): add LayerZero interest quote fixture"
```

### Task 3: Validate Live Support and Run the Quote Matrix

**Files:**
- Create: `docs/diagnostics/2026-07-22-layerzero-interest-quotes.md`
- Output: one ignored timestamped `results/matrix-*/summary.json` artifact.

**Interfaces:**
- Consumes: Yellow's live chain API and `config/matrix-pairs-layerzero-interest.json`.
- Produces: one timestamped 12-row quote report and a checked-in diagnostic summary.

- [ ] **Step 1: Verify the four required chains are live in Yellow**

Run:

```bash
curl --fail --silent --show-error --max-time 30 \
  https://solver-yellow.eco.com/api/v1/blockchain/chains \
  | jq -e '[.[].chainId] as $ids | all([1, 42161, 9745, 1399811149][]; . as $id | $ids | index($id))'
```

Expected: `true` and exit code 0.

- [ ] **Step 2: Run the full focused verification suite**

Run:

```bash
pnpm test -- \
  tests/blockchain/chains.config.test.ts \
  tests/matrix/layerzero-interest-config.test.ts \
  tests/matrix/matrix.command.test.ts \
  tests/matrix/matrix.service.test.ts \
  tests/matrix/matrix.util.test.ts \
  tests/quote/quote.service.test.ts \
  --runInBand
pnpm typecheck
```

Expected: all selected Jest suites pass and TypeScript exits 0.

- [ ] **Step 3: Execute the sequential quote-only run against Yellow**

Run:

```bash
DEBUG= pnpm dev matrix --quote-only \
  --config config/matrix-pairs-layerzero-interest.json \
  --timeout 30 \
  --case-delay-sec 1
```

Expected: the command prints a timestamped report path and completes all 12 rows without publishing.

- [ ] **Step 4: Verify the generated artifact is quote-only and terminal**

Resolve the newest report produced after the fixture was created, then validate it:

```bash
LZ_REPORT_PATH="$(find results -mindepth 2 -maxdepth 2 -name summary.json \
  -newer config/matrix-pairs-layerzero-interest.json -print | sort | tail -1)"
jq -e '
  (.rows | length) == 12
  and all(.rows[]; (.phase == "QUOTED" or .phase == "QUOTE_FAILED"))
  and all(.rows[]; .intentHash == null and .publishTxHash == null)
' "$LZ_REPORT_PATH"
```

Expected: `true` and exit code 0. Record the `QUOTED` and `QUOTE_FAILED` counts; quote failures are valid diagnostic outcomes and do not invalidate the run itself.

- [ ] **Step 5: Write the diagnostic report from the generated artifact**

Use `jq` against `$LZ_REPORT_PATH` to collect `.runId`, every row's `id`, `label`,
`phase`, `quoteLatencyMs`, `quoteHttpStatus`, and `error`, plus the count of
`QUOTED` and `QUOTE_FAILED` rows. Compute nearest-rank p50 and p95 from the
numeric quote latencies using the same percentile rule as `matrix.util.ts`.

Then use `apply_patch` to create
`docs/diagnostics/2026-07-22-layerzero-interest-quotes.md` with these exact
sections and no unresolved fields:

1. `# LayerZero Interest Quote Matrix — 2026-07-22`.
2. `## Outcome` listing Yellow production/direct solver-v2, quote-only safety,
   the fixture path, exact artifact path, quoted count, failed count, p50, and
   p95.
3. `## Route Results` with a 12-row table in fixture order. Columns are ID, CSV
   rank, route, result, latency in milliseconds, and HTTP status/error (or `-`
   for a successful quote).
4. `## Interpretation` grouping actual failures by unsupported route, source
   token pricing/liquidity, destination execution policy, provider error, or
   unexpected response. If no failures occurred, state that all 12 requested
   combinations were quoteable at this timestamp. Explicitly state that the
   quote-only run does not prove settlement health.

- [ ] **Step 6: Self-check and commit the diagnostic report**

Run:

```bash
rg -n 'TBD|TODO|REPLACE_ME' docs/diagnostics/2026-07-22-layerzero-interest-quotes.md
git diff --check -- docs/diagnostics/2026-07-22-layerzero-interest-quotes.md
```

Expected: `rg` returns no matches and `git diff --check` exits 0.

Then commit only the diagnostic report:

```bash
git add docs/diagnostics/2026-07-22-layerzero-interest-quotes.md
git commit -m "docs(matrix): record LayerZero interest quote run"
```

### Task 4: Final Verification

**Files:**
- Verify: all files from Tasks 1-3

**Interfaces:**
- Consumes: committed implementation and the generated ignored artifact.
- Produces: completion evidence for handoff.

- [ ] **Step 1: Run final tests and type-check**

```bash
pnpm test -- \
  tests/blockchain/chains.config.test.ts \
  tests/matrix/layerzero-interest-config.test.ts \
  tests/matrix/matrix.command.test.ts \
  tests/matrix/matrix.service.test.ts \
  tests/matrix/matrix.util.test.ts \
  tests/quote/quote.service.test.ts \
  --runInBand
pnpm typecheck
```

Expected: every command exits 0.

- [ ] **Step 2: Verify commit and worktree scope**

```bash
git log -4 --oneline
git status --short --branch
```

Expected: the LayerZero registry, fixture, and diagnostic commits are present. Only the pre-existing user changes remain uncommitted: `src/cli/commands/matrix.command.ts`, `src/matrix/matrix.service.ts`, and `config/matrix-pairs-a2a-production-nondust.json`.
