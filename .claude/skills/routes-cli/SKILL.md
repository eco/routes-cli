---
name: routes-cli
description: Use when publishing cross-chain intents, checking intent status, or exploring supported chains/tokens with the Eco routes CLI. Covers fully non-interactive publishing (flags, --yes, --json), discovery commands, and error recovery. Triggers: publish intent, cross-chain intent, routes CLI, intent status.
---

# routes-cli — Publishing Cross-Chain Intents

CLI for publishing cross-chain intents on EVM, TVM (Tron), and SVM (Solana) chains.

## Setup

```bash
pnpm install
pnpm dev <command>     # ts-node, no build needed
```

Required env (`.env`): `EVM_PRIVATE_KEY`, `TVM_PRIVATE_KEY`, `SVM_PRIVATE_KEY` — only for
the chain types you touch. NEVER print these values or echo them into logs or commands.

Optional env: `ECO_ENV=production|staging` (Eco API gateway host, default production),
`ECO_API_KEY_STAGING` / `ECO_API_KEY_PRODUCTION` (sent as `x-api-key` to that host only; staging
requires one, production rejects unknown keys — never print them; `ECO_API_KEY` is the fallback), `ECO_API_URL` (gateway
host override), `SOLVER_URL` / `QUOTES_API_URL` / `QUOTES_PREPROD` (bypass the gateway),
`NODE_CHAINS_ENV=development` (testnet chains), `DEBUG=1` (stack traces + request logs).

Quotes and `status` go through the public Eco API gateway (`POST /v1/quotes`,
`GET /v1/intents/status`) unless one of the bypass variables is set.
## Discover valid values first

```bash
pnpm dev chains     # chain names and IDs
pnpm dev tokens     # token symbols per chain
```

## Publish non-interactively (the recipe)

```bash
pnpm dev publish -s base -d optimism \
  --reward-token USDC --route-token USDC --amount 5 \
  --recipient 0xYourRecipient -y --json
```

Validate safely first by adding `--dry-run` (builds everything, signs and broadcasts nothing).

| Flag | Meaning |
|---|---|
| `-s, --source` / `-d, --destination <chain>` | chain name or ID (see `chains`) |
| `--reward-token <symbol\|address>` | token you pay with on the source chain |
| `--route-token <symbol\|address>` | token delivered on the destination chain |
| `--amount <value>` | reward amount in human units (`5` = 5 USDC); requires `--reward-token` |
| `--recipient <address>` | destination-chain recipient; with `-y` defaults to your derived address (requires a key configured for the destination chain type) |
| `-y, --yes` | skip confirmation (required for a non-interactive publish) |
| `--env <production\|staging>` | Eco API gateway environment for this run (overrides `ECO_ENV`) |
| `--json` | one JSON object on stdout; human logs on stderr |
| `--dry-run` | validate without broadcasting (exits before confirmation) |
| `--route-amount <value>` | only needed when the quote service is down (manual fallback); requires `--route-token` |
| `--reward-token-decimals` / `--route-token-decimals <n>` | required when the token flag is a raw address |
| `--portal-address` / `--prover-address` / `--prover-type <v>` | manual overrides; normally supplied by the quote |
| `-k, --private-key <key>` (`--private-key-tvm`, `--private-key-svm`) | override env keys — prefer env vars |
| `-w, --watch` | wait for fulfillment after publishing (EVM destinations only) |

## Parse the output

stdout with `--json` is exactly one JSON object (BigInts as strings):

```json
{"success": true, "intentHash": "0x…", "transactionHash": "0x…",
 "sourceChainId": "8453", "destinationChainId": "10", "recipient": "0x…"}
```

Failure: `{"success": false, "error": "…"}` with a non-zero exit code.
Dry run: `"dryRun": true` and no hashes.

## After publishing

```bash
pnpm dev status <intentHash>                    # via the Eco API gateway (add --env staging as needed)
pnpm dev status <intentHash> --chain optimism   # force the on-chain Portal lookup
```

## Errors → fixes

Any `X not specified. Pass --flag when running non-interactively.` → add that exact flag.

| Symptom | Fix |
|---|---|
| `Reward token not specified` | add `--reward-token USDC` (and `--amount`) |
| `Confirmation not specified. Pass --yes` | add `-y` |
| `Quote failed … falling back` then an amount error | add `--route-amount <value>` (and `--portal-address` if prompted for a portal) |
| `Token "X" is neither a known symbol…` | run `pnpm dev tokens`, or pass a raw address plus the matching `-decimals` flag |
| `--amount requires --reward-token` | pass both flags together |
| `No private key configured for EVM` | set `EVM_PRIVATE_KEY` in `.env` — never paste keys into the command line |
| `Eco API error 401/403 … ECO_API_KEY` | staging: set `ECO_API_KEY_STAGING` in `.env`; production `invalid-api-key`: you are sending a key production does not know — drop it or set a valid `ECO_API_KEY_PRODUCTION` |
