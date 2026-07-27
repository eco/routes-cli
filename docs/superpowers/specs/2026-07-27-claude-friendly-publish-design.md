# Claude-Friendly `publish` Command — Design

**Date:** 2026-07-27
**Status:** Approved
**Goal:** Claude (and any non-TTY automation) can run `routes publish` end-to-end without interactive prompts, and a SKILL.md teaches it how.

## Problem

The `publish` command is only partially usable non-interactively:

- No CLI flags exist for route token, reward token, or reward amount — `selectToken` and `inputAmount` prompts always fire (`src/cli/services/intent-publish-flow.service.ts`). The prompt-skipping mechanism (`PublishFlowOverrides`) is only reachable from internal feature commands.
- `confirmPublish()` always prompts; there is no `--yes`. The prompt fires **before** the `--dry-run` check, so even a dry run blocks on a prompt.
- If the quote fails, the manual-route fallback prompts for a route amount mid-flow.
- `--recipient` exists, but when omitted the flow prompts (with a derived default) instead of using the default.
- `--rpc` is parsed by `PublishCommand` but consumed by nothing (dead flag).
- Output is spinners/tables on stdout — nothing machine-parseable.
- No skill documents CLI usage for Claude.

In a non-TTY session every prompt hangs forever; that is the failure mode this design removes.

## Scope

`publish` only. `chains`, `tokens`, `status`, `config`, and `feature:*` commands are out of scope (already mostly non-interactive reads, or opinionated wrappers that inherit these flow improvements for free).

MCP/programmatic API: **deferred**. Claude Code drives CLIs through Bash; a complete flag surface plus a skill covers the goal. Revisit only if intents must be published from environments without a shell (claude.ai) or by non-CLI agents.

## Design

### 1. CLI surface

New flags on `publish`:

| Flag | Value | Behavior |
|---|---|---|
| `--route-token <symbol\|address>` | `USDC` or raw address | Resolved against `TOKEN_CONFIGS` for the **destination** chain; raw address passthrough for unlisted tokens, in which case `--route-token-decimals <n>` is required (no silent default) |
| `--reward-token <symbol\|address>` | same | Resolved for the **source** chain; `--reward-token-decimals <n>` required for raw addresses |
| `--amount <value>` | human units, e.g. `10.5` | Parsed with the reward token's decimals (same conversion the interactive prompt uses) |
| `--route-amount <value>` | human units | Only consumed by the quote-failure manual-route fallback; without it that fallback is fatal in non-interactive runs |
| `-y, --yes` | boolean | Skip the final confirmation prompt |
| `--json` | boolean | Human output to stderr; single JSON result object on stdout |

Behavior changes:

- `--dry-run` returns **before** the confirmation prompt and before any signing. With `--json` it emits the would-be intent summary as JSON.
- When `--recipient` is omitted and a destination-chain key is available: use the derived address without prompting **only when `--yes` is set**; otherwise prompt as today.
- `--rpc` is **removed** (dead surface).

Canonical non-interactive invocation (also the skill's core recipe and an e2e test):

```bash
routes publish -s base -d optimism --reward-token USDC --route-token USDC \
  --amount 5 --recipient 0xabc... -y --json
```

### 2. Non-interactive behavior & internals

**Fail-fast guard (`PromptService`).** A single check at the top of every prompt method: if `!process.stdin.isTTY || !process.stdout.isTTY`, throw `NonInteractiveError` (extends `RoutesCliError`) whose message names the exact flag that would have satisfied the prompt, e.g. `Reward token not specified. Pass --reward-token <symbol|address> when running non-interactively.` One choke point; no per-call-site checks in the flow.

**Flag wiring (`PublishCommand`).** The command resolves `--route-token`/`--reward-token`/`--amount` into the existing `PublishFlowOverrides` shape and passes them to `IntentPublishFlow.publish()`. Token resolution lives in a new helper `resolveTokenSelection(input, chain)` (symbol lookup in `TOKEN_CONFIGS` → `TokenSelection`; else raw-address passthrough requiring the explicit decimals flag). The flow service changes minimally: overrides already short-circuit prompts; `--yes` gates `confirmPublish()`; the dry-run check moves above confirmation.

**JSON mode (`DisplayService`).** A `jsonMode` switch set by the command routes all human output methods to **stderr** (ora spinners already degrade on non-TTY streams). The command prints exactly one JSON object to **stdout** on completion:

```json
{"success": true, "intentHash": "0x…", "txHash": "0x…", "sourceChainId": "8453",
 "destinationChainId": "10", "recipient": "0x…", "explorerUrl": "https://…"}
```

On failure: `{"success": false, "error": "…"}` plus a non-zero exit code. BigInts serialize as strings (pattern already used by intent storage).

### 3. Skill

**Repo skill — `.claude/skills/routes-cli/SKILL.md`** (committed; source of truth; ~100 lines):

- Frontmatter: `name: routes-cli`; description with WHEN triggers (publish intent, cross-chain intent, routes CLI, intent status, refund).
- Setup: `pnpm install && pnpm build`; run via `pnpm dev <cmd>` or `node dist/main.js`; required env vars (`EVM_PRIVATE_KEY`, `TVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY`) with an explicit "never print key values" warning.
- Core recipe: the canonical non-interactive publish line, per-flag explanation, and how to parse the stdout JSON.
- Discovery: `chains` and `tokens` to enumerate valid values first; `status <hash>` / `--watch` afterwards.
- Error→fix table: each `NonInteractiveError` message and its flag; quote-fallback semantics; `--dry-run` for safe validation.

**Global pointer — `~/.claude/skills/routes-cli/SKILL.md`** (user-local, not committed; ~10 lines): same triggers; body points at `~/dev/eco/routes-cli` and its repo skill, notes to rebuild if `dist/` is stale. No duplicated flag docs, so nothing drifts.

### 4. Error handling

- `NonInteractiveError` extends `RoutesCliError`; non-zero exit; with `--json` the failure object is still emitted on stdout.
- Token resolution failure lists valid options: `Token 'USDX' not found on Base. Known symbols: USDC, USDT, …, or pass a raw address.`
- `--amount`/`--route-amount` validated before any network call: numeric, positive, no more decimal places than the token allows.
- Confirmation remains mandatory without `-y`; a command that spends real funds never auto-confirms implicitly.

### 5. Testing (TDD)

- **Unit:** `resolveTokenSelection` (symbol per chain, raw address + decimals flag, unknown symbol error); amount parsing against decimals; `PromptService` non-TTY guard throws the flag-specific message per prompt type; prover/portal resolution priority regression; dry-run returns before confirm (mock call-order assertion).
- **Integration:** `IntentPublishFlow.publish()` with full overrides and mocked quote/publisher — asserts zero prompt invocations when all inputs are provided; JSON result shape with BigInt-safe serialization.
- **E2E (spawned CLI, stdin not a TTY):** (a) fully-specified `--dry-run --json` run exits 0 with parseable JSON — this is the skill's documented recipe, verified; (b) missing `--reward-token` exits non-zero with the flag hint; (c) `--rpc` is rejected as unknown.
- No test broadcasts a transaction or touches real keys — freshly generated synthetic keypairs only.

## Out of scope / future

- MCP server or exported programmatic API wrapping `IntentPublishFlow` (gated on a no-shell consumer actually existing).
- Non-interactive coverage for `feature:*` commands (they inherit flow-level improvements but keep their own prompts today).
- Fulfillment watching for non-EVM destination chains.
