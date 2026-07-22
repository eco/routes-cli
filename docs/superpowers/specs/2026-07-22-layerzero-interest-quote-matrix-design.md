# LayerZero Interest Quote Matrix Design

**Date:** 2026-07-22  
**Status:** Approved  
**Source:** `../solver-v2-a2a/Eco x VT API - TopSwaps  - TopSwaps.csv`

## Goal

Create a quote-only production matrix for the three Eco-interest route groups in
the LayerZero TopSwaps CSV. The run should answer whether Yellow can currently
quote each requested source asset, source chain, destination chain, and target
asset combination without signing, publishing, or spending funds.

## Scope

Use the three `Eco route` summaries embedded in the CSV rather than every row in
the Top 50 table:

1. Deliver USDC on Ethereum from selected LayerZero assets on Solana, Plasma,
   and Arbitrum.
2. Deliver USDC on Solana from selected LayerZero assets on Ethereum.
3. Deliver native ETH on Ethereum from USDC on Solana and Arbitrum.

The matrix includes CSV ranks `1, 3, 4-9, 11, 12, 14, 23`, subject to the
normalizations below. Rank 2, `USDe -> mixed`, is explicitly excluded. Mantle,
Monad, Berachain, and every other chain absent from Yellow's live chain endpoint
are excluded.

## Authoritative Inputs

- Yellow chain and destination-token support:
  [`GET /api/v1/blockchain/chains`](https://solver-yellow.eco.com/api/v1/blockchain/chains)
- OFT deployment discovery:
  [LayerZero Token Discovery API](https://docs.layerzero.network/v2/tools/api/oft-examples)
- Tradable underlying token addresses used by Yellow's source-swap provider:
  [LI.FI token registry](https://li.quest/v1/tokens)
- Solana token verification where LayerZero metadata does not include the asset:
  [Jupiter token search API](https://lite-api.jup.ag/tokens/v2/search)

Token resolution fails closed. A route must not be emitted when an address or
decimal value cannot be resolved or when authoritative sources conflict.

## Route Matrix

All quote requests use approximately USD 10 of the source asset and `50` basis
points of slippage. The source assets in this matrix are dollar-denominated, so
the configured human amount is `10` for every row.

| ID | CSV rank | Source | Input | Destination | Output | Input decimals |
| --- | ---: | --- | --- | --- | --- | ---: |
| LZ-01 | 1 | Solana (`1399811149`) | PYUSD `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| LZ-03 | 3 | Plasma (`9745`) | USDe `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 18 |
| LZ-04 | 4 | Ethereum (`1`) | PYUSD `0x6c3ea9036406852006290770BEdFcAbA0e23A0e8` | Solana (`1399811149`) | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| LZ-05 | 5 | Arbitrum (`42161`) | PYUSD `0x46850aD61C2B7d64d08c9C754F45254596696984` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| LZ-06 | 6 | Plasma (`9745`) | USDT0 `0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| LZ-07 | 7 | Solana (`1399811149`) | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | Ethereum (`1`) | native ETH `0x0000000000000000000000000000000000000000` | 6 |
| LZ-08 | 8 | Plasma (`9745`) | sUSDe `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 18 |
| LZ-09 | 9 | Ethereum (`1`) | USDG `0xe343167631d89B6Ffc58B88d6b7fB0228795491D` | Solana (`1399811149`) | USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 |
| LZ-11 | 11 | Solana (`1399811149`) | USDS `USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| LZ-12 | 12 | Solana (`1399811149`) | USDG `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 6 |
| LZ-14 | 14 | Solana (`1399811149`) | USDe `DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT` | Ethereum (`1`) | USDC `0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48` | 9 |
| LZ-23 | 23 | Arbitrum (`42161`) | USDC `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | Ethereum (`1`) | native ETH `0x0000000000000000000000000000000000000000` | 6 |

### Normalizations

- CSV rank 6 calls the Plasma asset `USDT`; Yellow and LI.FI expose the deployed
  asset as `USDT0`, so the request uses USDT0 while retaining the CSV rank and
  original description in its provenance.
- CSV ranks 4 and 9 use `mixed` in the raw `swap_pair`, but the corresponding
  Eco-interest summary explicitly asks to deliver USDC on Solana. Their concrete
  destination is therefore Solana USDC.
- CSV rank 2 is not expanded into any destination assets.

## Runner Integration

Reuse the existing `MatrixService` quote-only path on `feat/matrix-run`:

1. Add Plasma mainnet (`9745`) as an EVM production chain in the CLI registry.
   Quote-only execution needs the chain family for actor selection but must not
   make a Plasma RPC request.
2. Add `config/matrix-pairs-layerzero-interest.json` containing the 12 rows and
   the existing public EVM/SVM quote actors.
3. Encode the CSV rank in each stable row ID and label. No generic CSV importer
   is needed for this one curated business-interest matrix.
4. Run sequentially with a one-second delay through:

   ```bash
   pnpm dev matrix --quote-only \
     --config config/matrix-pairs-layerzero-interest.json \
     --timeout 30 \
     --case-delay-sec 1
   ```

The settlement timeout is retained for command consistency but does not govern
or initiate settlement in quote-only mode.

## Safety Boundary

The run may perform HTTP GET requests for metadata validation and HTTP POST
requests for Yellow quotes. It must return before private-key lookup, publisher
creation, balance checks, approvals, signing, intent publication, or status
polling. The report must contain no API keys or private keys.

## Reporting and Failure Semantics

Each route produces one terminal row:

- `QUOTED`: Yellow returned a valid quote and required contract metadata.
- `QUOTE_FAILED`: Yellow returned a non-2xx response or an invalid response.
- Preflight failure: the fixture is not run when the live chain intersection or
  token provenance check fails.

The timestamped report under `results/matrix-<runId>/summary.json` must preserve
route ID, CSV rank through the ID/label, path class, source and destination,
HTTP status/body for failures, quote latency, quote ID, solver ID when present,
source portal, and prover. Settlement-only aggregate fields are not evidence of
quote failure; quote health is determined from the 12 row phases and
`quoteFailures`.

## Verification

Before the production probe:

1. Assert the live Yellow chain response still contains Ethereum, Arbitrum,
   Plasma, and Solana.
2. Assert the fixture contains exactly the 12 IDs in this design and no rank 2.
3. Assert every amount is `10`, every slippage value is `50`, and every address
   matches the resolved token provenance.
4. Run focused matrix, quote-service, and chain-registry tests.
5. Run TypeScript type-checking.

After the probe, assert all rows are terminal, count `QUOTED` versus
`QUOTE_FAILED`, and verify no row contains an intent hash or publish transaction
hash.

## Non-Goals

- Publishing or settling any route.
- Funding wallets with the CSV's source assets.
- Expanding every `mixed` output percentage into separate routes.
- Testing all 50 CSV rows.
- Adding unsupported Monad, Berachain, Mantle, Avalanche, BSC, Ink, MegaETH, or
  Hyperliquid routes.
- Building a general CSV ingestion framework.
