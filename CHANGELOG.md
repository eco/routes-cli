# Changelog

All notable changes to this project will be documented in this file.

This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) and uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. The changelog is managed with [Changesets](https://github.com/changesets/changesets).

---

## 1.0.0 (initial release)

### Features

- **Multi-chain intent publishing** — publish cross-chain intents on EVM, TVM (Tron), and SVM (Solana) with a single unified CLI.
- **Universal Address System** — 32-byte chain-agnostic address format enabling consistent cross-chain address handling internally; chain-native formats displayed to users.
- **Interactive publishing flow** — guided prompts for chain selection, token configuration, quote fetching, and deadline calculation.
- **Multi-format private key support** — EVM (0x-prefixed hex), TVM (hex without 0x), SVM (base58, byte array, or comma-separated).
- **Quote integration** — real-time route quotes for optimal intent pricing and path finding.
- **Intent refund system** — locally tracked intents (via `~/.routes-cli/intents.json`) with refund eligibility checking.
- **Rich CLI experience** — colored output, progress spinners (ora), formatted tables (cli-table3), and interactive prompts (inquirer).

### Supported Chains

- Ethereum Mainnet (EVM)
- Base Mainnet (EVM)
- Optimism (EVM)
- Arbitrum One (EVM)
- Tron Mainnet (TVM)
- Solana Mainnet (SVM)

### Architecture Highlights

- Publisher abstraction (`BasePublisher`) with concrete implementations for EVM, TVM, and SVM.
- Typed error hierarchy (`RoutesCliError`) with machine-readable error codes.
- Runtime environment validation with Zod.
- Dependency injection in all publisher classes for testability.
- Chain plugin registry for self-registering chain handlers.
