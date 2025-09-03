# Intent Publisher CLI

A standalone CLI tool for creating and publishing intents to EVM, TVM (Tron), and SVM (Solana) blockchains.

## Features

- 🚀 **Multi-chain Support**: Publish intents to EVM, Tron, and Solana chains
- 🎨 **Interactive Publishing**: Step-by-step wizard for publishing intents with automatic configuration
- 📦 **Interactive Creation**: Advanced intent builder for complex scenarios
- 🔐 **Secure**: Private keys stored in environment variables
- 🛠️ **Extensible**: Easy to add new chains and tokens
- ⏰ **Smart Defaults**: Automatic deadline calculation (2h route, 3h reward)
- 📦 **Standalone**: Independent Node.js project, no NestJS dependencies

## Installation

```bash
cd cli
pnpm install
pnpm build
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

# Portal contract addresses
PORTAL_ADDRESS_ETH=0x...
PORTAL_ADDRESS_OPTIMISM=0x...
PORTAL_ADDRESS_TRON=T...
PORTAL_ADDRESS_SOLANA=...
```

## Usage

### Interactive Intent Creation

Create an intent using the interactive wizard:

```bash
pnpm dev create
# or after building:
node dist/index.js create
```

The wizard will guide you through:
- Selecting source and destination chains
- Setting creator and prover addresses
- Configuring token transfers
- Adding contract calls
- Setting deadlines

### Interactive Publishing (Recommended)

The easiest way to publish an intent - just run:

```bash
pnpm dev publish
# or after building:
node dist/index.js publish
```

The CLI will guide you through:
1. **Chain Selection**: Choose source and destination chains
2. **Token Configuration**: 
   - Select route token (destination chain) - native or specific token
   - Enter route amount
   - Select reward token (source chain) - native or specific token
   - Enter reward amount
3. **Automatic Setup**:
   - Creator address is derived from your wallet
   - Prover address is taken from chain configuration
   - Portal address is taken from destination chain configuration
   - Route deadline: 2 hours from now
   - Reward deadline: 3 hours from now
4. **Confirmation**: Review and confirm before publishing

### Semi-Interactive Publishing

Provide chains, get prompted for tokens:

```bash
pnpm dev publish --source ethereum --destination optimism

# Using testnets
pnpm dev publish --source base-sepolia --destination optimism-sepolia
pnpm dev publish --source tron-shasta --destination base-sepolia
```

### Direct Publishing (JSON)

For automation, provide complete intent JSON:

```bash
pnpm dev publish \
  --source ethereum \
  --destination optimism \
  --intent '{"route": {...}, "reward": {...}}'
```

### Command Options
- `-s, --source <chain>`: Source chain (name or ID)
- `-d, --destination <chain>`: Destination chain (name or ID)
- `-i, --intent <json>`: Intent JSON data (skips interactive mode)
- `-k, --private-key <key>`: Override environment private key
- `-r, --rpc <url>`: Override RPC URL
- `--dry-run`: Validate without publishing

### List Supported Chains

```bash
pnpm dev chains
```

Shows all supported chains with their IDs, types, and native currencies.

### List Configured Tokens

```bash
pnpm dev tokens
```

Shows all pre-configured tokens with their addresses on different chains.

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

## Supported Chains

### EVM Chains
The CLI supports all EVM chains that are defined in the `viem/chains` package. Popular supported chains include:
- Ethereum (ID: 1)
- Optimism (ID: 10)
- Base (ID: 8453)
- Arbitrum One (ID: 42161)
- Polygon (ID: 137)
- BNB Smart Chain (ID: 56)
- Avalanche (ID: 43114)

**Note**: When using an EVM chain, it must exist in viem's chain definitions. The CLI will throw an error if you try to use an unsupported chain ID.

### TVM Chains
- Tron (ID: 1000000001)

### SVM Chains
- Solana (ID: 999999999)

## Adding New Chains

### For EVM Chains
EVM chains must be supported by viem. To add a new EVM chain:
1. Verify the chain exists in `viem/chains`
2. Add the configuration to `src/config/chains.ts`

If your chain doesn't exist in viem, you'll need to either:
- Contribute the chain definition to the viem project
- Use a different chain that is supported

### For TVM/SVM Chains
Edit `src/config/chains.ts`:

```typescript
export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  // ... existing chains
  
  mychain: {
    id: 12345n,
    name: 'MyChain',
    type: ChainType.EVM,
    rpcUrl: 'https://rpc.mychain.com',
    portalAddress: toUniversalAddress('0x...'),
    proverAddress: toUniversalAddress('0x...'),
    nativeCurrency: {
      name: 'MyToken',
      symbol: 'MTK',
      decimals: 18,
    },
  },
};
```

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

## Development

### Build the project
```bash
pnpm build
```

### Run in development mode
```bash
pnpm dev <command>
```

### Run compiled version
```bash
node dist/index.js <command>
```

## Architecture

The CLI uses several key concepts from the solver:

- **UniversalAddress**: Chain-agnostic 32-byte address representation
- **PortalEncoder**: Encodes intent data for different chain types
- **AddressNormalizer**: Converts between chain-native and universal addresses
- **IntentBuilder**: Builder pattern for constructing intents

## Private Key Formats

### EVM
- Hex format: `0x1234...` (64 hex characters)

### Tron
- Hex format: `1234...` (64 hex characters, no 0x prefix)

### Solana
- Base58 format: `5Jd7F...`
- Array format: `[1,2,3,...]`
- Comma-separated: `1,2,3,...`

## Error Handling

The CLI provides detailed error messages for common issues:
- Invalid addresses
- Insufficient balances
- Missing configuration
- Network errors

## Security

- Never commit your `.env` file
- Keep private keys secure
- Use hardware wallets in production
- Validate all inputs before publishing

## License

MIT