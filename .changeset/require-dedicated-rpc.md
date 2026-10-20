---
"eco-routes-cli": minor
---

Require explicitly configured RPC endpoints for on-chain operations instead of
silently using public chain defaults, including Ronin. Remove implicit Solana and
Tron secondary endpoints and reject known public catalog hosts. Set
`EVM_RPC_URL_<CHAIN_ID>`, `TVM_RPC_URL` or `SVM_RPC_URL` before publishing; offline
dry-runs and API quotes continue to work without RPC configuration.
