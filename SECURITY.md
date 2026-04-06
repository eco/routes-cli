# Security Policy

## Supported Versions

The following versions of eco-routes-cli receive security patches:

| Version | Supported          |
|---------|--------------------|
| 1.x     | ✅ Active support  |
| < 1.0   | ❌ End of life     |

Security fixes are released as patch versions (e.g. `1.0.1`) and announced via
[GitHub Releases](https://github.com/eco-protocol/routes-cli/releases).

---

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

### Option A — GitHub Security Advisory (preferred)

Use GitHub's private disclosure flow:

1. Go to the repository on GitHub
2. Click **Security** → **Advisories** → **Report a vulnerability**
3. Fill in the vulnerability details (description, affected versions, reproduction steps)
4. Submit — the maintainers will respond within **5 business days**

### Option B — Email

Send a report to the Eco Protocol security team:

```
security@eco.org
```

Include:
- A description of the vulnerability
- Steps to reproduce
- Potential impact assessment
- Any suggested mitigations

You will receive an acknowledgement within **2 business days**.

### What to expect

- We will confirm receipt and begin investigation within 5 business days
- We aim to release a patch within 30 days for critical vulnerabilities
- You will be credited in the release notes unless you prefer otherwise
- We do not offer a bug bounty program at this time

---

## Security Model

### Private Key Handling

eco-routes-cli requires private keys to sign blockchain transactions. Here is exactly how
keys are handled at each stage:

1. **Load** — Private keys are read from environment variables (`EVM_PRIVATE_KEY`, etc.)
   into process memory when the CLI starts. They are never written to disk by the application.

2. **Pass** — The key string is passed as a function argument to the relevant publisher
   (`EvmPublisher`, `TvmPublisher`, or `SvmPublisher`). It is not stored in any global or
   class-level field between calls.

3. **Sign** — The key is handed to the chain-specific library (`viem`, `TronWeb`, or
   `@solana/web3.js`) to sign the transaction. For TVM, the key is loaded into the `TronWeb`
   instance immediately before signing and cleared from the instance immediately after (via a
   `finally` block calling `this.tronWeb.setPrivateKey('')`).

4. **Discard** — After signing, the function scope ends and the string is eligible for garbage
   collection. No copy is retained.

**Important limitations:** JavaScript strings are immutable — the runtime may retain a copy in
memory until the garbage collector runs. For high-security deployments, run the CLI in a
dedicated process and terminate it immediately after use.

### What is never persisted

- Private keys are **never** written to `~/.routes-cli/` or any other disk location
- The local intent store (`~/.routes-cli/intents.json`) records intent metadata only
  (hashes, chain IDs, reward amounts) — never private keys or wallet addresses derived from them
- Log output never includes private key material

### RPC Endpoints

The CLI connects to RPC endpoints to submit transactions. By default:

- **EVM**: Public RPC (configurable via `EVM_RPC_URL`)
- **TVM**: `https://api.trongrid.io` (configurable via `TVM_RPC_URL`)
- **SVM**: `https://api.mainnet-beta.solana.com` (configurable via `SVM_RPC_URL`)

Use a private RPC endpoint (`EVM_RPC_URL`, etc.) if you are concerned about transaction
metadata leaking to public node operators.

---

## Private Key Format Reference

### EVM Chains (Ethereum, Optimism, Base, Arbitrum, etc.)

```
Format:  0x followed by exactly 64 hexadecimal characters
Example: 0xabc123...def456  (0x + 64 hex chars = 66 chars total)
Regex:   ^0x[a-fA-F0-9]{64}$
```

Set in `.env`:
```bash
EVM_PRIVATE_KEY=0x<your-64-hex-chars-here>
```

### TVM (Tron)

```
Format:  Exactly 64 hexadecimal characters — NO 0x prefix
Example: abc123...def456  (64 hex chars, no prefix)
Regex:   ^[a-fA-F0-9]{64}$
```

Set in `.env`:
```bash
TVM_PRIVATE_KEY=<your-64-hex-chars-here>
```

Note: This is the raw private key, not the WIF-encoded format used by some Tron wallets.

### SVM (Solana)

Solana private keys can be provided in any of three formats:

**Base58 encoded keypair** (58 characters, standard export from Phantom / Solflare):
```bash
SVM_PRIVATE_KEY=5Kb8kLf9zgWQnogidDA76MzPL6TsZZY36hWXMssSzNydYXYB...
```

**Byte array** (JSON array of 64 numbers, standard format from `solana-keygen`):
```bash
SVM_PRIVATE_KEY=[12,34,56,...,255]   # 64 comma-separated numbers inside brackets
```

**Comma-separated bytes** (same as array, without brackets):
```bash
SVM_PRIVATE_KEY=12,34,56,...,255     # 64 comma-separated numbers
```

---

## Best Practices for Users

### Use dedicated keys

Never use a personal wallet key with this CLI. Create a dedicated wallet that holds only
the tokens needed for publishing:

```bash
# EVM: create a fresh key with cast
cast wallet new

# Solana: create a fresh keypair
solana-keygen new --outfile ~/.config/solana/routes-cli.json
```

### Keep .env out of version control

Confirm your `.env` file is ignored before committing:

```bash
git check-ignore -v .env   # should print: .gitignore:N:.env
```

If it is not ignored, add it:
```bash
echo '.env' >> .gitignore
```

### Use a hardware wallet for large amounts

For production use with significant token amounts, consider a hardware wallet integration.
The CLI currently accepts software keys only — hardware wallet support is on the roadmap.

### Rotate keys after any suspected exposure

If you believe a key has been exposed (e.g., accidentally committed, shown in a log):

1. Move all tokens off the compromised wallet immediately
2. Generate a new key
3. Update your `.env` with the new key
4. If the key was in git history, follow the instructions in [TASK-001](IMPROVEMENT_PLAN.md)
   to rewrite history and notify collaborators to re-clone

### Keep dependencies up to date

Run `pnpm audit` regularly to check for known vulnerabilities in dependencies:

```bash
pnpm audit --audit-level=high
```

The CI pipeline runs `pnpm audit` on every push to `main` and on a daily schedule via
`.github/workflows/security.yml`.
