# Cross-Chain Intent Creation Scripts

This directory contains example scripts for creating and publishing cross-chain intents using the Eco Protocol. The scripts demonstrate transfers between different blockchain types: EVM chains (Ethereum, Optimism, Base), Solana (SVM), and Tron (TVM).

## Available Scripts

All scripts are located in the `scripts/` subdirectory:

### 1. `scripts/intent-creator-base.ts` - Base Module
Shared functionality and the `IntentCreator` class used by all chain-specific scripts.

### 2. `scripts/evm-evm-intent.ts` - EVM to EVM Transfers
Transfer tokens between EVM-compatible chains (Optimism, Base, Ethereum, etc.)

### 3. `scripts/evm-svm-intent.ts` - EVM to Solana Transfers
Transfer tokens from EVM chains to Solana blockchain.

### 4. `scripts/evm-tvm-intent.ts` - EVM to Tron Transfers
Transfer tokens from EVM chains to Tron blockchain.

## Prerequisites

Before running any script, you need:

1. **Node.js** (v18 or higher)
   - Download from https://nodejs.org/
   - Verify with: `node --version`

2. **Required Tokens:**
   - ETH/native token on source chain for gas fees
   - Tokens to transfer (USDC, USDT, etc.)

3. **Private Key:**
   - Your wallet's private key with funds on the source chain

## Installation

1. **Install dependencies from project root:**
   ```bash
   # From the project root directory
   pnpm install
   ```

2. **Set up environment variables:**
   Create a `.env` file in the project root:
   ```env
   # Required: Your EVM private key (with 0x prefix)
   PRIVATE_KEY=0x_your_private_key_here
   ```

   **⚠️ SECURITY WARNING:**
   - NEVER share your private key
   - NEVER commit `.env` to version control
   - Use a test wallet for initial testing

## Usage Examples

### EVM to EVM (Optimism → Base)

```bash
# Run from the evm-intent-simple directory
cd src/scripts/evm-intent-simple

# Execute the script (uses Optimism to Base USDC configuration)
pnpm exec ts-node scripts/evm-evm-intent.ts
```

To use a different configuration, edit the `INTENT_CONFIG` in the script.

### EVM to Solana

```bash
# Run from the evm-intent-simple directory
cd src/scripts/evm-intent-simple

# Execute the script (uses Optimism to Solana configuration)
pnpm exec ts-node scripts/evm-svm-intent.ts
```

Note: Edit the `recipient` field in `OPTIMISM_TO_SOLANA_CONFIG` with your Solana address.

### EVM to Tron

```bash
# Run from the evm-intent-simple directory
cd src/scripts/evm-intent-simple

# Execute the script (uses Optimism to Tron configuration)
pnpm exec ts-node scripts/evm-tvm-intent.ts
```

Note: Edit the `recipient` field in `OPTIMISM_TO_TRON_CONFIG` with your Tron address.

## Configuration Details

### Default Token Configurations

#### USDC
- **Optimism:** `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85`
- **Base:** `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- **Solana:** `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

#### USDT
- **Optimism:** `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58`
- **Base:** `0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2`
- **Ethereum:** `0xdAC17F958D2ee523a2206206994597C13D831ec7`
- **Tron:** `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`

### Portal Contracts
- **EVM Chains:** `0x2b7F87a98707e6D19504293F6680498731272D4f`
- **Prover:** `0x3E4a157079Bc846e9d2C71f297d529e0fcb4D44d`

### Chain IDs
- **Optimism:** 10
- **Base:** 8453
- **Ethereum:** 1
- **Solana Mainnet:** 1399811149
- **Solana Devnet:** 1399811150
- **Tron Mainnet:** 728126428
- **Tron Shasta:** 2494104990

## Address Formats

### Solana Addresses
- **Format:** Base58 encoded (32-44 characters)
- **Example:** `7rNRf9CW4jwzS52kXUDtf1pG1rUPfho7tFxgjy2J6cLe`
- **Validation:** Must be valid base58 string

### Tron Addresses
- **Base58 Format:** Starts with 'T', 34 characters
  - Example: `TQh8ig6rmuMqb5u8efU5LDvoott1oLzoqu`
- **Hex Format:** Starts with '41', 42 characters
  - Example: `41a614f803b6fd780986a42c78ec9c7f77e6ded13c`

## How It Works

1. **Configuration Setup:** Script loads configuration for source/destination chains and tokens
2. **Quote Request:** Fetches optimal routing from the quote service
3. **Token Approval:** Approves portal contract to spend reward tokens
4. **Intent Creation:** Builds intent structure with route and reward details
5. **Publishing:** Publishes intent to portal contract on source chain
6. **Fulfillment:** Solvers monitor and fulfill intents for rewards

## Customizing Configurations

Each script contains pre-configured setups that you can modify directly in the file:

- **evm-evm-intent.ts**: Edit `INTENT_CONFIG` for Optimism to Base transfers
- **evm-svm-intent.ts**: Edit `OPTIMISM_TO_SOLANA_CONFIG` for Solana transfers
- **evm-tvm-intent.ts**: Edit `OPTIMISM_TO_TRON_CONFIG` for Tron transfers

```typescript
// Example: Modify the configuration in evm-evm-intent.ts
export const INTENT_CONFIG: IntentConfig = {
  privateKey: process.env.PRIVATE_KEY as Hex,
  sourceChain: optimism,
  destinationChain: base,
  sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC on Optimism
  destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
  rewardAmount: 1000000n, // Change to 1 USDC (6 decimals)
  recipient: '0xYourRecipientAddress', // Add specific recipient
  quoteServiceUrl: 'https://quotes.eco.com',
  routeDeadlineSeconds: 3600, // Change to 1 hour
  rewardDeadlineSeconds: 3600, // Change to 1 hour
};
```

## Creating Your Own Configuration

```typescript
import { IntentConfig, IntentCreator } from './intent-creator-base';

const myConfig: IntentConfig = {
  privateKey: process.env.PRIVATE_KEY as Hex,
  sourceChain: optimism,
  destinationChain: base,
  destinationChainId: 8453n, // For non-EVM, override chain ID
  sourcePortalAddress: '0x2b7F87a98707e6D19504293F6680498731272D4f',
  proverAddress: '0x3E4a157079Bc846e9d2C71f297d529e0fcb4D44d',
  sourceToken: '0xYourTokenAddress',
  destinationToken: '0xDestinationTokenAddress',
  rewardAmount: 100000n,
  recipient: '0xRecipientAddress',
};

const creator = new IntentCreator(myConfig);
await creator.createAndPublish();
```

## Troubleshooting

### Common Issues

1. **"Invalid private key" error**
   - Ensure private key starts with `0x`
   - Must be exactly 66 characters (including 0x)

2. **"Insufficient funds" error**
   - Check wallet has enough native token for gas
   - Check wallet has enough tokens for reward
   - Verify you're on the correct network

3. **"Invalid recipient address" error**
   - Solana: Must be valid base58 address
   - Tron: Must be valid base58 (T...) or hex (41...) address
   - EVM: Must be valid checksummed address

4. **Network errors**
   - Check internet connection
   - Try again (RPC might be temporarily down)
   - Consider using custom RPC endpoints

5. **Transaction fails**
   - Ensure token approval succeeded
   - Check token balances
   - Verify portal contract addresses

## Expected Output

Successful execution shows:
```
🚀 Creating Intent
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 From: Optimism
📍 To: Base (or Solana/Tron)
💰 Reward: 100000
👤 Recipient: 0x... (or Solana/Tron address)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Step 1: Getting quote...
📡 Fetching quote from: https://quotes.eco.com
   Destination amount: 99500

Step 2: Approving tokens...
✅ Approving 100000 tokens for 0x2b7F87a98707e6D19504293F6680498731272D4f
   Approval confirmed: 0x...

Step 3: Creating reward structure...
   Deadline: 2024-01-01T12:00:00.000Z

Step 4: Publishing intent...
📤 Publishing intent to portal...
✨ Intent published successfully!
   Transaction: 0x...

✅ Intent successfully created and published!

📝 Transaction Details:
   Hash: 0x...
   Explorer: https://optimistic.etherscan.io/tx/0x...
```

## Security Notes

- **Test First:** Use testnet tokens and small amounts initially
- **Verify Addresses:** Double-check all contract addresses
- **Private Key Safety:** Never expose or share private keys
- **Use Test Wallets:** Consider dedicated wallets for testing

## Advanced Usage

### Using as a Module

```typescript
import {
  IntentCreator,
  createReward,
  fetchQuote,
  approveToken,
  publishIntent
} from './intent-creator-base';

// Use individual functions or the IntentCreator class
```

### Batch Operations

Create multiple intents programmatically:
```typescript
const configs = [config1, config2, config3];
for (const config of configs) {
  const creator = new IntentCreator(config);
  await creator.createAndPublish();
}
```

## Support

For issues or questions:
1. Check this README thoroughly
2. Verify all prerequisites are met
3. Review example configurations
4. Check transaction status on block explorers

## Next Steps

After running these examples:
- Integrate into your application
- Add error handling and retry logic
- Implement monitoring for intent fulfillment
- Create custom configurations for your use case