# Eco Portal CLI

A comprehensive CLI tool for creating cross-chain token transfer intents using the Eco Protocol. Supports multiple blockchain Virtual Machines (VMs) including EVM, TVM (Tron), and SVM (Solana).

## Features

- 🌉 **Cross-Chain Transfers**: Create intents between any supported chains
- 🔗 **Multi-VM Support**: EVM, TVM, and SVM compatibility
- 🪙 **Token Registry**: Curated list of supported tokens across chains
- 💰 **Interactive CLI**: User-friendly prompts and confirmation flows
- 📊 **Status Tracking**: Check intent fulfillment across chains
- 🏦 **Vault Management**: Fund and manage intent vaults

## Supported Chains

### EVM Chains
- Optimism
- Base
- Arbitrum
- And more...

### TVM Chains
- Tron Network

### SVM Chains
- Solana

## Installation

```bash
npm install -g eco-portal-cli
```

Or run directly with npx:

```bash
npx eco-portal-cli --help
```

## Setup

### Environment Variables

Create a `.env` file or set environment variables:

```bash
# Private key (supports all VM types)
PRIVATE_KEY=0x...

# Optional: VM-specific private keys
EVM_PRIVATE_KEY=0x...
TVM_PRIVATE_KEY=...
SVM_PRIVATE_KEY=...

# Optional: Custom RPC URLs
OPTIMISM_RPC_URL=https://mainnet.optimism.io
BASE_RPC_URL=https://mainnet.base.org
ARBITRUM_RPC_URL=https://arb1.arbitrum.io/rpc
TRON_RPC_URL=https://api.trongrid.io
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# Optional: Custom portal addresses
PORTAL_ADDRESS_OPTIMISM=0x...
PORTAL_ADDRESS_BASE=0x...
PORTAL_ADDRESS_TRON=T...
PORTAL_ADDRESS_SOLANA=...

# Optional: Configuration paths
TOKEN_REGISTRY_PATH=./config/tokens.json
CHAIN_CONFIG_PATH=./config/chains.json
LOG_LEVEL=info
```

## Usage

### Interactive Intent Creation

Create a cross-chain transfer intent with interactive prompts:

```bash
eco-portal create
```

### Non-interactive Intent Creation

Create an intent with command-line options:

```bash
eco-portal create \
  --source-chain optimism \
  --destination-chain base \
  --route-token USDC \
  --route-amount 100 \
  --reward-token USDT \
  --reward-amount 5 \
  --recipient 0x742d35Cc0007C2bD1094b07Fb1A7e3d3edF0a3ed \
  --route-deadline 24 \
  --refund-deadline 48
```

### Check Intent Status

Check if an intent has been fulfilled:

```bash
eco-portal status --hash 0x9876...5432
```

Check status on specific chain:

```bash
eco-portal status --hash 0x9876...5432 --chain optimism
```

### Fund Intent Vault

Fund the vault with reward tokens:

```bash
eco-portal fund --hash 0x9876...5432 --amount 5 --token USDT
```

### List Available Tokens

List all tokens:

```bash
eco-portal list-tokens
```

List tokens for specific chain:

```bash
eco-portal list-tokens --chain optimism
```

List tokens by VM type:

```bash
eco-portal list-tokens --vm EVM
```

### List Supported Chains

List all chains:

```bash
eco-portal list-chains
```

List with health check:

```bash
eco-portal list-chains --health
```

### Configuration Management

Show current configuration:

```bash
eco-portal config --show
```

Validate configuration:

```bash
eco-portal config --validate
```

### Wallet Information

Show wallet addresses:

```bash
eco-portal wallet --info
```

## Cross-VM Transfer Examples

### EVM to TVM Transfer

```bash
eco-portal create \
  --source-chain optimism \
  --destination-chain tron \
  --route-token USDT \
  --route-amount 100 \
  --reward-token USDC \
  --reward-amount 5
```

### TVM to SVM Transfer

```bash
eco-portal create \
  --source-chain tron \
  --destination-chain solana \
  --route-token USDC \
  --route-amount 50 \
  --reward-token USDT \
  --reward-amount 2
```

## Command Reference

| Command | Description |
|---------|-------------|
| `create` | Create a new cross-chain token transfer intent |
| `status` | Check intent fulfillment status |
| `fund` | Fund an intent vault with reward tokens |
| `list-tokens` | List available tokens (filterable by chain/VM) |
| `list-chains` | List supported chains with health status |
| `config` | Manage CLI configuration |
| `wallet` | Show wallet information for all VMs |

## Global Options

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Enable verbose logging |
| `--debug` | Enable debug logging |
| `--json` | Output in JSON format (where applicable) |
| `-h, --help` | Show help information |

## Address Formats

The CLI automatically handles different address formats for each VM:

- **EVM**: `0x742d35Cc0007C2bD1094b07Fb1A7e3d3edF0a3ed`
- **TVM**: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`
- **SVM**: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

## Error Handling

The CLI provides clear error messages and validation:

- Address format validation for each VM type
- Token amount validation with decimal precision
- Chain availability checking
- Private key format validation
- Transaction simulation before execution

## Development

### Build from Source

```bash
git clone <repository>
cd eco-portal-cli
npm install
npm run build
npm link
```

### Development Mode

```bash
npm run dev
```

### Testing

```bash
npm test
npm run test:watch
```

### Linting

```bash
npm run lint
npm run lint:fix
```

## Configuration Files

### Token Registry (`config/tokens.json`)

Contains the list of supported tokens across all chains:

```json
{
  "version": "1.0.0",
  "lastUpdated": "2025-08-26T00:00:00Z",
  "tokens": [
    {
      "symbol": "USDC",
      "name": "USD Coin",
      "chainId": 10,
      "chainName": "Optimism",
      "vmType": "EVM",
      "address": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
      "decimals": 6,
      "tags": ["stablecoin"],
      "verified": true
    }
  ]
}
```

### Chain Configuration (`config/chains.json`)

Contains chain configurations for all supported networks:

```json
{
  "version": "1.0.0",
  "networks": [
    {
      "chainId": 10,
      "name": "Optimism",
      "vmType": "EVM",
      "rpcUrl": "https://mainnet.optimism.io",
      "portalAddress": "0x...",
      "nativeCurrency": {
        "name": "Ether",
        "symbol": "ETH",
        "decimals": 18
      }
    }
  ]
}
```

## Security

- Private keys are only used locally and never transmitted
- All addresses are validated for their respective VM types
- Transaction simulation before execution where possible
- Cross-VM transfer warnings and confirmations

## Troubleshooting

### Common Issues

1. **"Private key required"**
   - Set the `PRIVATE_KEY` environment variable
   - Ensure the key format matches your target VM type

2. **"No chains available"**
   - Check your private key format
   - Verify RPC URLs are accessible
   - Check portal contract addresses

3. **"Invalid address format"**
   - Ensure addresses match the target chain's VM type
   - EVM addresses start with `0x`
   - Tron addresses start with `T`
   - Solana addresses are Base58 encoded

4. **"Token not found in registry"**
   - Use `list-tokens --chain <name>` to see available tokens
   - Check if the token is supported on the target chain

### Debug Mode

Enable debug logging for detailed information:

```bash
eco-portal create --debug
```

## License

MIT

## Contributing

Contributions are welcome! Please read the contributing guidelines and submit pull requests.

## Support

For support and questions:
- Check the documentation
- Review error messages carefully
- Enable debug mode for detailed logs
- Report issues on the project repository