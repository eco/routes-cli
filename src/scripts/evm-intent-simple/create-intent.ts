import {
  Address,
  ContractFunctionArgs,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  getAbiItem,
  Hex,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, optimism } from 'viem/chains';
import * as dotenv from 'dotenv';
import { randomBytes } from 'node:crypto';
import * as console from 'node:console';

dotenv.config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const SOURCE_PORTAL = '0x90F0c8aCC1E083Bcb4F487f84FC349ae8d5e28D7' as Address;
const DESTINATION_PORTAL = '0x90F0c8aCC1E083Bcb4F487f84FC349ae8d5e28D7' as Address;
const PROVER_ADDRESS = '0xde255Aab8e56a6Ae6913Df3a9Bbb6a9f22367f4C' as Address;

// Token addresses
const SOURCE_TOKEN = '0x0b2c639c533813f4aa9d7837caf62653d097ff85' as Address;
const DESTINATION_TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address;

// Amount to transfer and reward
const REWARD_AMOUNT = 100000n; // 0.01 USDC reward

const quoteUrl = 'https://solver-preprod.bend.eco';

// Initialize clients
const account = privateKeyToAccount(PRIVATE_KEY);

const source = optimism;
const destination = base;

const RECIPIENT = account.address;

const portalAbi = parseAbi([
  'error InsufficientFunds(bytes32 intentHash)',
  'function publishAndFund(uint64 destination, bytes route, (uint64 deadline,address creator,address prover,uint256 nativeAmount,(address token, uint256 amount)[] tokens) reward,bool allowPartial) external returns (bytes32 intentHash, address vault)',
  'function fulfill(bytes32 intentHash, (bytes32 salt, uint64 deadline, address portal, uint256 nativeAmount, (address token, uint256 amount)[] tokens, (address target, bytes data, uint256 value)[] calls) route, bytes32 rewardHash, bytes32 claimant) external',
]);

// Type Definitions

interface QuoteResponse {
  quoteResponse: {
    sourceChainID: number;
    destinationChainID: number;
    sourceToken: Address;
    destinationToken: Address;
    sourceAmount: string;
    destinationAmount: string;
    funder: Address;
    refundRecipient: Address;
    recipient: Address;
    fees: [
      {
        name: string;
        description: string;
        token: {
          address: Address;
          decimals: 18;
          symbol: string;
        };
        amount: string;
      },
    ];
    deadline: number;
  };
  contracts: {
    intentSource: Address;
    prover: Address;
    inbox: Address;
  };
}

export type Route = ContractFunctionArgs<typeof portalAbi, 'nonpayable', 'fulfill'>[1];
export type Reward = ContractFunctionArgs<typeof portalAbi, 'nonpayable', 'publishAndFund'>[2];

export const routeAbiItem = getAbiItem({
  abi: portalAbi,
  name: 'fulfill',
}).inputs[1];

const walletClient = createWalletClient({
  account,
  chain: source,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: source,
  transport: http(),
});

function createIntent(routeAmount: bigint) {
  // Generate random salt
  const salt = `0x${randomBytes(32).toString('hex')}` as Hex;

  // Set deadlines (1 hour for route, 24 hours for refund)
  const now = Math.floor(Date.now() / 1000);
  const routeDeadline = BigInt(now + 3600 * 2); // 2 hour
  const refundDeadline = routeDeadline;

  // Create ERC20 transfer call data
  const transferCallData = encodeFunctionData({
    abi: erc20Abi,
    functionName: 'transfer',
    args: [RECIPIENT, routeAmount], // Transfer to the user's address
  });

  // Create the route struct
  const route: Route = {
    salt,
    deadline: routeDeadline,
    portal: DESTINATION_PORTAL,
    nativeAmount: 0n,
    tokens: [
      {
        token: DESTINATION_TOKEN,
        amount: routeAmount,
      },
    ],
    calls: [
      {
        target: DESTINATION_TOKEN,
        data: transferCallData,
        value: 0n,
      },
    ],
  };

  // Encode the route
  const routeBytes = encodeAbiParameters([routeAbiItem], [route]);

  // Create the reward struct
  const reward: Reward = {
    deadline: refundDeadline,
    creator: account.address,
    prover: PROVER_ADDRESS,
    nativeAmount: 0n,
    tokens: [
      {
        token: SOURCE_TOKEN,
        amount: REWARD_AMOUNT,
      },
    ],
  };

  return { routeBytes, reward, salt };
}

async function publishIntent(routeBytes: Hex, reward: Reward) {
  const destinationId = BigInt(destination.id); // Base Sepolia chain ID

  console.log('Publishing intent to portal...');

  const hash = await walletClient.writeContract({
    address: SOURCE_PORTAL,
    abi: portalAbi,
    functionName: 'publishAndFund',
    args: [destinationId, routeBytes, reward, false],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Intent published!');
  console.log('Transaction hash:', hash);

  return hash;
}

async function approveTokens() {
  const hash = await walletClient.writeContract({
    address: SOURCE_TOKEN,
    abi: erc20Abi,
    functionName: 'approve',
    args: [SOURCE_PORTAL, REWARD_AMOUNT],
  });

  await publicClient.waitForTransactionReceipt({ hash });
}

async function getQuote() {
  const url = new URL('/api/v2/quote', quoteUrl);
  const request = {
    dAppID: 'dapp',
    quoteRequest: {
      sourceChainID: Number(source.id),
      sourceToken: SOURCE_TOKEN,
      destinationChainID: Number(destination.id),
      destinationToken: DESTINATION_TOKEN,
      sourceAmount: REWARD_AMOUNT.toString(),
      funder: RECIPIENT,
      refundRecipient: RECIPIENT,
      recipient: RECIPIENT,
    },
  };

  console.log(`Calling quoting service: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const result = await response.json();

  if (!response.ok) throw new Error(JSON.stringify(result));

  return result as QuoteResponse;
}

// Main execution
async function main() {
  try {
    console.log('Creating EVM to EVM intent...');
    console.log(`From: ${source.name}`);
    console.log(`To: ${destination.name}`);
    console.log(`Reward amount: ${REWARD_AMOUNT}`);
    console.log('');

    // Step 1: Get a quote
    const quote = await getQuote();

    // Step 1.1: Extract route amount
    const routeAmount = BigInt(quote.quoteResponse.destinationAmount);
    console.log(`Route amount: ${routeAmount.toString()}`);

    // Step 2: Approve reward token
    await approveTokens();

    // Step 3: Create intent
    const { routeBytes, reward, salt } = createIntent(routeAmount);
    console.log('Intent created with salt:', salt);

    // Step 4: Publish intent
    await publishIntent(routeBytes, reward);

    console.log('\n✅ Intent successfully created and published!');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
