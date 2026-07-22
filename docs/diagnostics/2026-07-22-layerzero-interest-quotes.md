# LayerZero Interest Quote Matrix — 2026-07-22

## Outcome

Yellow production quoted **10 of 12** selected LayerZero-interest routes. The two
failures are both Plasma token-configuration gaps: USDe and sUSDe returned HTTP
400 because Yellow could not find their token configuration for chain `9745`.
Plasma USDT0 quoted successfully in the same run, so the result does not indicate
a general Plasma chain-support failure.

This was quote-only validation. The harness did not sign, fund, or publish any
intent; the report contains no intent or publish transaction hashes.

- Target: `https://solver-yellow.eco.com`
- Quote endpoint: `POST /api/v2/quote/reverse`
- Chain preflight: `GET /api/v1/blockchain/chains`
- Fixture: `config/matrix-pairs-layerzero-interest.json`
- Amount: approximately USD 10 of each source token
- Slippage: 50 bps
- Selected routes: 12
- Quoted: 10
- Quote failures: 2
- Median quote latency (all 12 attempts, nearest-rank): 574.15 ms
- p95 quote latency (all 12 attempts, nearest-rank): 1169.89 ms
- Run artifact:
  `results/matrix-2026-07-22T16-15-15-073Z/summary.json`

The fixture covers the three `Eco route` groups embedded in
`Eco x VT API - TopSwaps - TopSwaps.csv`, after excluding rank 2
`USDe -> mixed` and every route involving a chain absent from Yellow's live
supported-chain endpoint. Monad, Berachain, and Mantle were therefore excluded.

Before the run, the four required chains and 14 route token mappings were checked
against the live Yellow chain response and the LayerZero, LI.FI, and Jupiter token
registries. Ethereum (`1`), Arbitrum (`42161`), Plasma (`9745`), and Solana
(`1399811149`) were all present in Yellow's response.

## Route Results

| Case | CSV rank | Route | Path | Result | Latency | Quote ID / error |
| --- | ---: | --- | --- | --- | ---: | --- |
| LZ-01 | 1 | PYUSD Solana -> USDC Ethereum | source swap | QUOTED | 1169.89 ms | `b726d820-4648-467f-88ce-ee23fe771113` |
| LZ-03 | 3 | USDe Plasma -> USDC Ethereum | source swap | QUOTE_FAILED | 150.53 ms | HTTP 400: token config unavailable for `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` on chain `9745` |
| LZ-04 | 4 | PYUSD Ethereum -> USDC Solana | source swap | QUOTED | 1169.68 ms | `7c1f541a-6ed3-4567-b658-cb5bca5584fa` |
| LZ-05 | 5 | PYUSD Arbitrum -> USDC Ethereum | source swap | QUOTED | 1060.76 ms | `8e9d44d2-7868-4002-bdf5-5834acdca7d1` |
| LZ-06 | 6 | USDT0 Plasma -> USDC Ethereum | source swap | QUOTED | 419.11 ms | `549e58d3-536d-4d97-8664-db97f82f8ffe` |
| LZ-07 | 7 | USDC Solana -> ETH Ethereum | destination swap | QUOTED | 865.88 ms | `6ff4eb2e-4941-4191-90bb-83f85ec96324` |
| LZ-08 | 8 | sUSDe Plasma -> USDC Ethereum | source swap | QUOTE_FAILED | 275.73 ms | HTTP 400: token config unavailable for `0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2` on chain `9745` |
| LZ-09 | 9 | USDG Ethereum -> USDC Solana | source swap | QUOTED | 369.07 ms | `4e1c5545-b79f-4621-8d6d-8f300832059b` |
| LZ-11 | 11 | USDS Solana -> USDC Ethereum | source swap | QUOTED | 612.56 ms | `e2c41249-aaf4-4f7d-9ab8-6542c0fe9b24` |
| LZ-12 | 12 | USDG Solana -> USDC Ethereum | source swap | QUOTED | 569.95 ms | `25ff0710-d719-4363-a16b-f83909272c1f` |
| LZ-14 | 14 | USDe Solana -> USDC Ethereum | source swap | QUOTED | 574.15 ms | `31b85413-6b30-4aba-8703-c097086cd41d` |
| LZ-23 | 23 | USDC Arbitrum -> ETH Ethereum | destination swap | QUOTED | 787.24 ms | `c2d6a57e-8de9-4234-abf0-07f9222f0ac7` |

## Interpretation

The 10 successful quotes confirm Yellow currently has a priceable route for every
selected Ethereum, Arbitrum, and Solana case, plus Plasma USDT0. Solana USDe also
quotes, which further narrows the USDe failure to its Plasma deployment rather
than the asset family as a whole.

Both failures classify as unsupported source-token configuration: Yellow rejected
the requests before pricing because the specific Plasma token was absent from its
chain-9745 token config. They are not provider errors, unexpected response shapes,
destination execution-policy failures, or evidence that Plasma itself is
unsupported.

To reach 12/12 quote coverage, add or enable Yellow token configuration for Plasma
USDe and Plasma sUSDe at the addresses above, then rerun this same fixture. Once
quote coverage is accepted, the successful cases can be promoted to a separately
authorized publish/lifecycle run. This quote-only run does not prove settlement
health.
