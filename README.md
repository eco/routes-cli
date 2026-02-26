<p align="center">
  <img src="https://avatars.githubusercontent.com/u/29763335?s=96&v=4" alt="Eco Protocol" />
</p>

<h1 align="center">Routes CLI</h1>
<p align="center">Send assets across chains with a single command.</p>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg" alt="Node.js Version" /></a>
</p>

Routes CLI is a terminal tool for publishing **cross-chain intents** built on the [Eco Routes Protocol](https://github.com/eco/eco-routes/). You lock a reward on your source chain; competitive solvers race to deliver the result on your destination chain. Supports EVM (Ethereum, Base, Optimism, and more), and Solana.

---

## See It In Action

```
$ pnpm dev publish

? Select source chain:        Base
? Select destination chain:   Optimism

? Route token:   USDC
? Route amount:  100

? Reward token:  USDC
? Reward amount: 101

┌─────────────────────────────────────────────┐
│            Intent Summary                   │
├──────────────────┬──────────────────────────┤
│ Source chain     │ Base (8453)              │
│ Destination      │ Optimism (10)            │
│ Route            │ 100 USDC → Optimism      │
│ Reward           │ 101 USDC on Base         │
│ Route deadline   │ 2026-02-26 14:00 UTC     │
│ Reward deadline  │ 2026-02-26 15:00 UTC     │
└──────────────────┴──────────────────────────┘

? Confirm and publish intent? Yes

⠋ Publishing intent...
✔ Intent published — tx: 0xabc123...def456
```

---

## Quick Start

**1. Clone and install**

```bash
git clone https://github.com/eco/routes-cli.git
cd routes-cli
pnpm install
```

**2. Configure your private key**

```bash
cp .env.example .env
```

Open `.env` and fill in the key for the chain type you want to use:

```env
# Pick the one you need — you only need one to get started
EVM_PRIVATE_KEY=0x...   # Ethereum, Base, Optimism, Arbitrum, etc.
SVM_PRIVATE_KEY=...      # Solana
```

**3. Publish your first intent**

```bash
pnpm dev publish
```

Follow the prompts. Done.

---

## What Is an Intent?

An intent describes **what you want to happen on the destination chain** and **what reward you're offering** to whoever makes it happen. Solvers — independent actors monitoring the protocol — race to fulfill your intent and claim the reward. The faster the solver, the better the deal for everyone.

This is powered by the [Eco Routes Protocol](https://github.com/eco/eco-routes/). For the full picture of how intents are encoded, published, and proven, see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Command Reference

| Command | Description |
|---------|-------------|
| `pnpm dev publish` | Interactive intent publishing wizard |
| `pnpm dev publish --source <chain> --destination <chain>` | Skip chain selection prompts |
| `pnpm dev chains` | List all supported chains |
| `pnpm dev tokens` | List all configured tokens |

**`publish` flags:**

| Flag | Alias | Description | Example |
|------|-------|-------------|---------|
| `--source` | `-s` | Source chain name or ID | `ethereum`, `1` |
| `--destination` | `-d` | Destination chain name or ID | `optimism`, `10` |

**Private key formats:**

| Chain | Format | Example |
|-------|--------|---------|
| EVM | `0x` + 64 hex chars | `0xac09...ff80` |
| Tron | 64 hex chars, no `0x` | `ac09...ff80` |
| Solana | Base58 | `5Jd7F...` |
| Solana | JSON byte array | `[1,2,3,...]` |
| Solana | Comma-separated bytes | `1,2,3,...` |

---

## Configuration Reference

Copy `.env.example` to `.env`. All variables except the private keys are optional.

| Variable | Required | Description |
|----------|----------|-------------|
| `EVM_PRIVATE_KEY` | For EVM chains | EVM wallet private key (`0x…`) |
| `SVM_PRIVATE_KEY` | For Solana | Solana wallet key (base58, array, or bytes) |
| `EVM_RPC_URL` | No | Override RPC for all EVM chains |
| `SVM_RPC_URL` | No | Override Solana RPC (default: mainnet-beta) |
| `SOLVER_URL` | No | Use a custom solver endpoint for quotes |
| `QUOTES_PREPROD` | No | Force preprod quote service (set to `true`) |
| `PORTAL_ADDRESS_ETH` | No | Override Ethereum portal contract |
| `PORTAL_ADDRESS_BASE` | No | Override Base portal contract |
| `PORTAL_ADDRESS_OPTIMISM` | No | Override Optimism portal contract |
| `PORTAL_ADDRESS_SOLANA` | No | Override Solana portal contract |

See `.env.example` for the complete list of portal address overrides.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Private key error` | Check the format matches the chain type — see Private key formats above |
| `Chain not found` | Run `pnpm dev chains` to verify the exact chain name or ID |
| `Insufficient balance` | Ensure your wallet has the reward token plus gas on the source chain |
| `Quote unavailable` | Not all chain pairs have live routes yet — try a different pair |
| `RPC timeout` | Set a custom RPC endpoint via `EVM_RPC_URL` / `TVM_RPC_URL` / `SVM_RPC_URL` |

Enable verbose output for more detail:

```bash
DEBUG=* pnpm dev publish
```

---

## Going Deeper

- [ARCHITECTURE.md](./ARCHITECTURE.md) — How intents work, the Universal Address system, publisher internals
- [CONTRIBUTING.md](./CONTRIBUTING.md) — Dev setup, adding chains and tokens, PR process
- [GitHub Issues](https://github.com/eco/routes-cli/issues) — Bug reports and feature requests

---

## License

MIT © [Eco Protocol](https://eco.com)

Built with [viem](https://viem.sh/), and [@solana/web3.js](https://solana-labs.github.io/solana-web3.js/).
Powered by the [Eco Routes Protocol](https://github.com/eco/eco-routes/).

<p align="center">
  <img src="https://avatars.githubusercontent.com/u/29763335?s=96&v=4" alt="Eco Protocol" />
</p>
