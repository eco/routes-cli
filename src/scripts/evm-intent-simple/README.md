# EVM to EVM Intent Creation - Integration Example

This script demonstrates how to create and publish cross-chain intents using the Eco Protocol. It transfers USDC from Optimism to Base.

## Prerequisites

Before running this script, you need:

1. **A computer with internet connection**
2. **A crypto wallet with:**
   - Some ETH on Optimism for gas fees (at least 0.01 ETH)
   - Some USDC on Optimism for rewards (at least 0.1 USDC)
3. **Basic ability to use Terminal/Command Prompt**

## Step-by-Step Setup Guide

### Step 1: Install Required Software

1. **Install Node.js** (if not already installed)
   - Go to https://nodejs.org/
   - Download the "LTS" version for your operating system
   - Run the installer and follow the prompts
   - To verify installation, open Terminal/Command Prompt and type:
     ```bash
     node --version
     ```
     You should see a version number like `v20.11.0`

### Step 2: Download and Prepare the Script

1. **Get the script files**
   - Download or copy these files to a folder on your computer:
     - `create-intent.ts` (the main script)
     - `package.json` (dependencies list)
     - This `README.md` file

2. **Open Terminal/Command Prompt**
   - **On Mac:** Press `Cmd + Space`, type "Terminal", press Enter
   - **On Windows:** Press `Windows + R`, type "cmd", press Enter
   - **On Linux:** Press `Ctrl + Alt + T`

3. **Navigate to the script folder**
   ```bash
   cd path/to/your/folder
   ```
   Replace `path/to/your/folder` with the actual path where you saved the files

### Step 3: Install Dependencies

In the Terminal/Command Prompt, run:
```bash
npm install
```
Wait for the installation to complete (this may take 1-2 minutes).

### Step 4: Set Up Your Private Key

1. **Create a configuration file**
   - In the same folder, create a new file called `.env` (note the dot at the beginning)
   - You can create this file using any text editor

2. **Add your private key**
   - Open the `.env` file in a text editor
   - Add this line:
     ```
     PRIVATE_KEY=0x_your_private_key_here
     ```
   - Replace `0x_your_private_key_here` with your actual private key

   **⚠️ SECURITY WARNING:**
   - NEVER share your private key with anyone
   - NEVER commit this `.env` file to GitHub or any public repository
   - Keep this file secure and private

3. **How to get your private key** (if you don't know it):
   - **MetaMask:** Settings → Security & Privacy → Reveal Secret Recovery Phrase → Enter password → Copy private key
   - **Other wallets:** Look for "Export Private Key" in security settings
   - Your private key will look like: `0x1234567890abcdef...` (64 characters after 0x)

### Step 5: Get Required Tokens

Before running the script, ensure your wallet has:

1. **ETH on Optimism** (for gas fees)
   - You need at least 0.01 ETH
   - Buy ETH on an exchange and withdraw to Optimism, or
   - Bridge ETH from Ethereum to Optimism using: https://app.optimism.io/bridge

2. **USDC on Optimism** (for rewards)
   - You need at least 0.1 USDC
   - The script uses 0.01 USDC as reward by default
   - USDC contract on Optimism: `0x0b2c639c533813f4aa9d7837caf62653d097ff85`

### Step 6: Run the Script

1. **Execute the script**
   ```bash
   npm start
   ```

2. **What to expect:**
   - The script will show progress messages:
     ```
     Creating EVM to EVM intent...
     From: OP Mainnet
     To: Base
     Reward amount: 100000
     
     Calling quoting service...
     Route amount: [calculated amount]
     Intent created with salt: 0x...
     Publishing intent to portal...
     Intent published!
     Transaction hash: 0x...
     
     ✅ Intent successfully created and published!
     ```

3. **If successful:**
   - You'll see a transaction hash
   - The intent is now published and can be fulfilled by solvers
   - Your USDC reward is locked until the intent is completed

### Step 7: Verify Your Transaction

1. Copy the transaction hash from the output
2. Go to https://optimistic.etherscan.io/
3. Paste the transaction hash in the search box
4. You can see your transaction details and confirmation

## Troubleshooting

### Common Issues and Solutions

1. **"Cannot find module" error**
   - Run `npm install` again
   - Make sure you're in the correct folder

2. **"Invalid private key" error**
   - Check that your private key starts with `0x`
   - Ensure it's exactly 66 characters long (including 0x)
   - Make sure there are no spaces or line breaks

3. **"Insufficient funds" error**
   - Check your wallet has enough ETH for gas
   - Check your wallet has enough USDC for the reward
   - Make sure you're checking on the Optimism network

4. **"ECONNREFUSED" or network errors**
   - Check your internet connection
   - Try again in a few minutes (RPC might be temporarily down)

5. **Transaction fails or reverts**
   - Make sure you have approved the USDC spending
   - Check that you have sufficient balance
   - Try reducing the reward amount in the script

## Configuration Details

The script is configured to:
- **Source Network:** Optimism (Chain ID: 10)
- **Destination Network:** Base (Chain ID: 8453)
- **Transfer Token:** USDC
- **Default Reward:** 0.01 USDC (100000 in token units, 6 decimals)

### Key Addresses
- **Portal Contract:** `0x90F0c8aCC1E083Bcb4F487f84FC349ae8d5e28D7` (same on both chains)
- **USDC on Optimism:** `0x0b2c639c533813f4aa9d7837caf62653d097ff85`
- **USDC on Base:** `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`

## How It Works

1. **Quote Request:** The script first requests a quote from the solver service to determine optimal routing
2. **Token Approval:** Approves the portal contract to spend your USDC reward
3. **Intent Creation:** Creates an intent structure with:
   - Route details (what to do on destination chain)
   - Reward details (payment for the solver)
4. **Publishing:** Publishes the intent to the portal contract on Optimism
5. **Fulfillment:** Solvers monitor for intents and fulfill them for the reward

## Key Functions

### `getQuote()`
Requests a quote from the solver service to determine the optimal route amount.

### `approveTokens()`
Approves the portal contract to spend USDC for rewards.

### `createIntent()`
Builds the intent structure with:
- Random salt
- Route details (destination chain, tokens, calls)
- Reward details (tokens for the solver)

### `publishIntent()`
Publishes the intent to the portal contract using `publishAndFund`.

## Security Notes

- **Private Key Safety:** Never share your private key or commit it to version control
- **Test First:** Consider testing with small amounts first
- **Verify Addresses:** Always verify contract addresses before sending transactions
- **Use Dedicated Wallets:** Consider using a separate wallet for testing integrations

## Support

If you encounter issues:
1. Double-check all steps above
2. Ensure your wallet is properly funded
3. Verify you're connected to the correct network
4. Check transaction status on Etherscan

## Next Steps

Once comfortable with this example, you can:
- Modify amounts and tokens
- Change source and destination chains
- Integrate this flow into your own application
- Add error handling and retry logic for production use