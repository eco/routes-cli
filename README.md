# Routes CLI - Intent Publisher

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)

A powerful command-line interface for creating and publishing cross-chain intents on EVM, TVM (Tron), and SVM (Solana) blockchains. Built by Eco Protocol for seamless multi-chain interactions.

## 🌟 Key Features

- **🌍 Multi-chain Support**: Seamlessly publish intents across EVM, Tron (TVM), and Solana (SVM) chains
- **💸 Quote Integration**: Real-time route quotes for optimal pricing and path finding
- **🎯 Interactive Wizards**: Intuitive step-by-step guides for intent creation and publishing
- **🔐 Secure Key Management**: Environment-based private key storage with multi-format support
- **📊 Rich CLI Experience**: Beautiful tables, spinners, and colored output for better UX
- **⚡ Smart Defaults**: Automatic deadline calculation and intelligent configuration
- **🔌 Extensible Architecture**: Easy integration of new chains and tokens
- **📦 Standalone Operation**: Zero external service dependencies

## 📋 Prerequisites

- Node.js >= 18.0.0
- pnpm (recommended) or npm
- Private keys for the chains you want to use

## 📦 Installation

### Clone and Build

```bash
git clone https://github.com/eco/routes-cli.git
cd routes-cli
pnpm install
pnpm build
```

### Global Installation (Optional)

```bash
pnpm link
# Now you can use 'eco-routes-cli' globally
```

## Configuration

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Add your private keys to `.env`:
```env
# Private keys for each chain type
EVM_PRIVATE_KEY=0x...
TVM_PRIVATE_KEY=...
SVM_PRIVATE_KEY=...

# Optional: Custom RPC endpoints
EVM_RPC_URL=https://eth-mainnet.g.alchemy.com/v2/...
TVM_RPC_URL=https://api.trongrid.io
SVM_RPC_URL=https://api.mainnet-beta.solana.com

# Optional: Portal contract addresses
PORTAL_ADDRESS_ETH=0x...
PORTAL_ADDRESS_OPTIMISM=0x...
PORTAL_ADDRESS_TRON=T...
PORTAL_ADDRESS_SOLANA=...
```

## 🚀 Quick Start

1. **Set up your environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your private keys
   ```

2. **Publish your first intent:**
   ```bash
   pnpm dev publish
   # Follow the interactive prompts
   ```

3. **View available chains:**
   ```bash
   pnpm dev chains
   ```

## 📖 Usage Guide

### 🎯 Interactive Publishing (Recommended)

The simplest and most user-friendly way to publish intents:

```bash
pnpm dev publish
```

#### Publishing Flow

1. **🔗 Chain Selection**
   - Select source chain (where rewards come from)
   - Select destination chain (where route executes)
   - Automatic quote fetching for optimal routing

2. **💰 Token Configuration**
   - **Route Token**: Choose destination chain token (native or ERC20/TRC20/SPL)
   - **Route Amount**: Specify amount to transfer on destination
   - **Reward Token**: Choose source chain token for prover reward
   - **Reward Amount**: Specify reward amount for proof submission

3. **⚙️ Automatic Configuration**
   - Creator address derived from your wallet
   - Prover address from chain configuration
   - Portal address from destination chain
   - Smart deadline calculation:
     - Route deadline: 2 hours from now
     - Reward deadline: 3 hours from now

4. **✅ Review & Confirm**
   - Display complete intent details
   - Show estimated gas costs
   - Confirm before blockchain submission

### 🔄 Semi-Interactive Publishing

Specify chains via command line, configure tokens interactively:

```bash
# Mainnet examples
pnpm dev publish --source ethereum --destination optimism
pnpm dev publish --source tron --destination base
pnpm dev publish --source solana --destination ethereum

# Testnet examples
pnpm dev publish --source base-sepolia --destination optimism-sepolia
pnpm dev publish --source tron-shasta --destination base-sepolia
```

### ⚙️ Command Options

| Option | Alias | Description | Example |
|--------|-------|-------------|----------|
| `--source` | `-s` | Source chain name or ID | `ethereum`, `1` |
| `--destination` | `-d` | Destination chain name or ID | `optimism`, `10` |
| `--verbose` | `-v` | Show detailed output | |

### 📊 Information Commands

#### List Supported Chains
```bash
pnpm dev chains
# Output: Formatted table with chain names, IDs, types, and native currencies
```

#### List Configured Tokens
```bash
pnpm dev tokens
# Output: Table showing token symbols, names, decimals, and chain availability
```

## Intent Structure

An intent consists of two main parts:

### Route
- `salt`: Random 32-byte hex value
- `deadline`: Unix timestamp for route expiration
- `portal`: Portal contract address on destination chain
- `nativeAmount`: Native token amount to transfer
- `tokens`: Array of token transfers
- `calls`: Array of contract calls to execute

### Reward
- `deadline`: Unix timestamp for reward claim deadline
- `creator`: Address that created the intent
- `prover`: Prover contract address
- `nativeAmount`: Native token reward amount
- `tokens`: Array of token rewards

## 🔧 Customization & Extension

## Adding New Tokens

Edit `src/config/tokens.ts`:

```typescript
export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  // ... existing tokens
  
  MYTOKEN: {
    symbol: 'MTK',
    name: 'My Token',
    decimals: 18,
    addresses: {
      ethereum: AddressNormalizer.normalize('0x...', ChainType.EVM),
      optimism: AddressNormalizer.normalize('0x...', ChainType.EVM),
    },
  },
};
```

## 🛠️ Development

### Available Scripts

| Script | Description |
|--------|-------------|
| `pnpm build` | Compile TypeScript to JavaScript |
| `pnpm dev <command>` | Run in development mode with ts-node |
| `pnpm start <command>` | Run compiled version |
| `pnpm clean` | Remove build artifacts |

### Project Structure

```
routes-cli/
├── src/
│   ├── blockchain/       # Chain-specific implementations
│   ├── builders/         # Intent builder patterns
│   ├── commands/         # CLI command implementations
│   ├── config/           # Chain and token configurations
│   ├── core/            # Core types and utilities
│   ├── scripts/         # Standalone scripts
│   └── utils/           # Helper utilities
├── dist/                # Compiled output
├── .env.example         # Environment template
└── package.json         # Project dependencies
```

## 🏗️ Architecture

### Core Concepts

- **UniversalAddress**: Chain-agnostic 32-byte address representation enabling cross-chain compatibility
- **PortalEncoder**: Specialized encoder for intent data across different blockchain types
- **AddressNormalizer**: Bidirectional converter between chain-native and universal address formats
- **IntentBuilder**: Fluent builder pattern for constructing complex intents programmatically
- **ChainTypeDetector**: Automatic chain type detection from configuration
- **Quote System**: Integration with routing protocols for optimal path finding

### Design Principles

1. **Chain Abstraction**: Uniform interface across different blockchain types
2. **Type Safety**: Full TypeScript support with strict typing
3. **Modularity**: Pluggable architecture for easy extension
4. **User Experience**: Interactive wizards with rich CLI feedback

## 🔑 Private Key Formats

| Chain Type | Format | Example |
|------------|--------|----------|
| **EVM** | Hex with prefix | `0x1234...` (64 hex chars) |
| **Tron** | Hex without prefix | `1234...` (64 hex chars) |
| **Solana** | Base58 | `5Jd7F...` |
| | Byte array | `[1,2,3,...]` |
| | Comma-separated | `1,2,3,...` |

## 🚨 Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `Invalid address format` | Check address matches chain type requirements |
| `Insufficient balance` | Ensure wallet has enough tokens and gas |
| `Chain not found` | Verify chain name/ID in supported list |
| `RPC timeout` | Check network connection or use custom RPC |
| `Private key error` | Verify key format matches chain type |
| `Quote unavailable` | Check source/destination pair compatibility |

### Debug Mode

```bash
# Enable verbose logging
export DEBUG=eco-routes-cli:*
pnpm dev publish --verbose
```

## 🔒 Security Best Practices

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Use environment variables** - Don't hardcode private keys
3. **Hardware wallets recommended** - For production environments
4. **Validate before publishing** - Use `--dry-run` flag
5. **Audit intent details** - Review all parameters before confirmation
6. **Secure RPC endpoints** - Use authenticated endpoints when possible
7. **Rotate keys regularly** - Especially for automated systems

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🙏 Acknowledgments

- Built with [Viem](https://viem.sh/) for EVM interactions
- [TronWeb](https://tronweb.network/) for Tron support
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/) for Solana integration
- [Commander.js](https://github.com/tj/commander.js/) for CLI framework
- [Inquirer.js](https://github.com/SBoudrias/Inquirer.js/) for interactive prompts

## 📞 Support

- **Documentation**: [Full API Reference](https://docs.eco.org/routes-cli)
- **Issues**: [GitHub Issues](https://github.com/eco-protocol/routes-cli/issues)

---

<p align="center">
  Made with ❤️ by <a href="https://eco.com">Eco Protocol</a>
</p>