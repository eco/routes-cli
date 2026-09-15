# Eco API gateway as the default quote source — design

**Date:** 2026-09-14
**Status:** approved (brainstorming session)
**Scope:** routes-cli. Adds a client for the public Eco API (`api.eco.com/v1`, AWS API Gateway with
API keys), makes it the default quote source, and backs `status` with `GET /v1/intents/status`.
No change to how intents are built, signed, or published on-chain.

## 1. Why

routes-cli quotes against internal hosts today: `quotes.eco.com` (quote-service v3 shape) by
default, or a solver-v2 host via `SOLVER_URL`, or any URL via `QUOTES_ENDPOINT_URL`. Partners and
Eco's own tooling are moving to the public front door, `api.eco.com/v1/*`, which is keyed
(`x-api-key`), typed by the published `@eco-foundation/api-schemas` package, and has a staging twin
at `api.stag.eco.com`. The CLI is the reference client for self-published intents, so it should
speak that contract natively rather than through an internal path that may not exist tomorrow.

## 2. Decisions

- **Gateway is the default quote source.** Resolution order: `SOLVER_URL` (solver-v2) →
  `QUOTES_ENDPOINT_URL` (custom v3 endpoint) → gateway. The two existing variables stay as explicit
  escape hatches; `quotes.eco.com` is no longer implied by "nothing set".
- **Environment selects the host.** `ECO_ENV=production|staging` (default `production`) maps to
  `https://api.eco.com` / `https://api.stag.eco.com`. `ECO_API_URL` overrides the host outright.
  `publish` and `status` accept `--env <production|staging>`, which wins over `ECO_ENV`.
- **`ECO_API_KEY` is optional** and sent as `x-api-key` when present. Production currently answers
  keyless for quotes and reads; staging and future registry versions require a key. The CLI never
  prints the value: debug output logs header *names*, and `config list` redacts any key containing
  `private` or `api_key`.
- **Native v1 client + adapter.** A new `EcoApiClient` speaks the public contract; a small adapter
  maps a `V1QuoteResponse` onto the CLI's existing `QuoteResult`, so the publish flow, publishers,
  and portal/prover resolution are untouched.
- **Public visibility only.** The CLI needs `encodedRoute` to call `publishAndFund` itself;
  private-visibility quotes null it. Requests set `options.visibility: 'public'`, and a response
  with `execution: null` or a null `encodedRoute` is a hard error (never a silent manual fallback).
- **Types, not runtime, from the schemas package.** `@eco-foundation/api-schemas@0.8.0` is a
  devDependency used for `V1QuoteRequest`, `V1QuoteResponse`, `V1StatusEntry`, `V1ProblemBody`.
  Nothing from it ships in the ncc bundle.
- **Out of scope (follow-ups):** sending the gateway's prebuilt `execution.transaction` instead of
  encoding locally; sourcing `chains`/`tokens` from `/v1/chains` and `/v1/tokens`; verifying the
  quote `signature`.

## 3. Components

### 3.1 Config (`src/config/`)

`env.schema.ts` gains `ECO_ENV` (enum, default `production`), `ECO_API_URL` (url, optional),
`ECO_API_KEY` (non-empty string, optional).

`ConfigService.getQuoteEndpoint()` returns a discriminated union:

```ts
type QuoteEndpoint =
  | { type: 'solver-v2'; url: string }
  | { type: 'custom'; url: string }
  | { type: 'gateway'; baseUrl: string; env: 'production' | 'staging'; apiKey?: string };
```

`getGatewayBaseUrl(envOverride?)` centralises host selection: `ECO_API_URL` → env map. The CLI
`--env` flag reaches the config through a per-command override argument, not by mutating
`process.env`.

### 3.2 `EcoApiClient` (`src/eco-api/eco-api.client.ts`, `EcoApiModule`)

```ts
quote(req: V1QuoteRequest, opts?: { env? }): Promise<V1QuoteResponse>
intentStatus(params: { intentHash: string }, opts?: { env? }): Promise<V1StatusEntry[]>
```

- `POST {base}/v1/quotes` with `content-type: application/json` and `x-api-key` when configured.
- `GET {base}/v1/intents/status?intentHash=…`.
- Non-2xx: parse the body as `V1ProblemBody` (RFC 7807). Auth problems (401/403 or
  `code: invalid-api-key`) throw `RoutesCliError.apiError(problem, requestId)` with the hint "set
  ECO_API_KEY in .env" and stop the run; every other problem throws `EcoApiRequestError` carrying
  the problem so the publish flow can fall back. Bodies that are not a Problem fall back to the HTTP
  status text.
- Network failures throw `EcoApiRequestError` (a plain `Error` subclass, not `RoutesCliError`) so
  the publish flow's existing "quote failed → manual route" fallback keeps working.
- Debug mode logs the URL, header names, and timing — never header values.

### 3.3 Quote adapter (`src/quote/gateway-quote.adapter.ts`)

Request (`QuoteRequest` → `V1QuoteRequest`):

| v1 field | source |
|---|---|
| `swapType` | `'exact-in'` |
| `source.chainId/token/amount` | source chain id, reward token, reward amount |
| `destination.chainId/token/recipient` | destination chain id, route token, recipient |
| `funder`, `refundRecipient` | sender address (both) |
| `dappId` | `DAPP_ID` (default `eco-routes-cli`) |
| `options.visibility` | `'public'` |

Response (`V1QuoteResponse` → `QuoteResult`):

| `QuoteResult` field | v1 source |
|---|---|
| `encodedRoute` | `execution.encodedRoute` (required) |
| `prover` | `execution.intent.reward.prover` |
| `deadline` | `execution.intent.reward.deadline` |
| `destinationPortalAddress` | `execution.intent.route.portal` |
| `sourcePortal` | `execution.transaction.to` when `kind === 'evm'`; otherwise the source chain's configured portal |
| `destinationAmount` | `destination.amount` |
| `estimatedFulfillTimeSec` | Σ `steps[].estimatedDurationSec` |
| `intentExecutionType` | `'SELF_PUBLISH'` |
| `destinationChainId` | `destination.chainId` |

Errors: `execution` null → "quote carries no execution material"; `encodedRoute` null → "quote is
private; the CLI needs a public quote to self-publish". Both are `RoutesCliError` (quote-service
error code), so they surface instead of falling back.

`QuoteService.getQuote()` dispatches on `getQuoteEndpoint().type`; the solver-v2 and v3 branches
are unchanged.

### 3.4 Status (`src/status/`, `status.command.ts`)

- `--chain` becomes optional. Without it, `StatusService.getStatus` asks the gateway and maps the
  first `V1StatusEntry` whose `intentHashes` contains the hash (or the first entry) to
  `IntentStatus`: `fulfilled = status ∈ {'filled', 'settled'}` (eco-router maps the upstream
  `Fulfilled` sub-status to `filled`; `settled` is reserved for claimed/withdrawn),
  `fulfillmentTxHash = destinationTx?.txHash`, `timestamp = updatedAt`. The raw gateway `status`
  word is also carried on `IntentStatus.state` and printed, so `pending`, `refundable`,
  `refunded`, `expired`, `unknown` are visible.
- With `--chain`, today's on-chain Portal lookup runs exactly as before.
- `--watch` polls whichever path was selected.

### 3.5 CLI surface

- `publish --env <production|staging>` and `status --env <production|staging>`.
- Non-interactive error text for a rejected key names the variable to set.
- `config list` redaction extended to `api_key`.

## 4. Error handling

| Condition | Behaviour |
|---|---|
| Gateway unreachable / DNS / timeout | `NETWORK_ERROR` → publish falls back to manual route (existing path) |
| 401/403 or Problem `code: invalid-api-key` | `RoutesCliError` (`QUOTE_SERVICE_ERROR`, user error) naming `ECO_API_KEY`; no manual fallback |
| Any other 4xx/5xx Problem body | `EcoApiRequestError` carrying `code`, `title`, `detail`, `requestId`; publish falls back to manual route (as any quote failure does today) |
| Quote without execution / private | `QUOTE_SERVICE_ERROR`, no fallback |
| Unknown status word | printed verbatim, `fulfilled = false` |

## 5. Testing

- Unit (`tests/eco-api/`, `tests/quote/`, `tests/config/`, `tests/status/`): mocked `fetch`
  for the client (headers, Problem mapping, key hint, network error), adapter request/response
  mapping including the SVM source-portal branch and the two hard errors, env → host resolution
  and precedence, status word mapping.
- Integration (`tests/integration/publish-non-interactive.test.ts`): a gateway variant with an
  unroutable `ECO_API_URL` proving the manual-route fallback still works when nothing else is set.
- Live smoke (manual, recorded in the PR): `--dry-run` quotes against staging and production with
  `ECO_API_KEY` set; `status` for a known intent hash.

## 6. Docs

`README.md` configuration table, `.env.example` quote section, `CLAUDE.md` environment section,
and `.claude/skills/routes-cli/SKILL.md` (setup + recipe) describe `ECO_ENV`, `ECO_API_URL`,
`ECO_API_KEY`, `--env`, and the new resolution order.
