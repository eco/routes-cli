import * as dotenv from 'dotenv';
import {
  Address,
  ContractFunctionArgs,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  Hex,
  http,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, optimism } from 'viem/chains';

dotenv.config();

// Configuration
const PRIVATE_KEY = process.env.PRIVATE_KEY as Hex;
const SOURCE_PORTAL = '0x2b7F87a98707e6D19504293F6680498731272D4f' as Address;
const PROVER_ADDRESS = '0x3E4a157079Bc846e9d2C71f297d529e0fcb4D44d' as Address;

// Token addresses
const SOURCE_TOKEN = '0x0b2c639c533813f4aa9d7837caf62653d097ff85' as Address;
const DESTINATION_TOKEN = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as Address;

// Amount to transfer and reward
const REWARD_AMOUNT = 100000n; // 0.01 USDC reward

const quoteUrl = 'https://quotes-preprod.eco.com';

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
    encodedRoute: Hex;
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

const walletClient = createWalletClient({
  account,
  chain: source,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: source,
  transport: http(),
});

function buildReward(): Reward {
  const now = Math.floor(Date.now() / 1000);

  // Create the reward struct
  return {
    deadline: BigInt(now + 3600 * 2), // 2 hour,
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
}

async function publishIntent(routeBytes: Hex, reward: Reward) {
  const destinationId = BigInt(destination.id); // Base Sepolia chain ID

  console.info('Publishing intent to portal...');

  const hash = await walletClient.writeContract({
    address: SOURCE_PORTAL,
    abi: portalAbi,
    functionName: 'publishAndFund',
    args: [destinationId, routeBytes, reward, false],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.log('Intent published!');
  console.info(`Transaction hash: ${hash}`);

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

interface QuoteRequest {
  source: number;
  sourceAmount: bigint;
  sourceToken: string;
  funder: string;

  destination: number;
  destinationToken: string;
  recipient: string;
}

async function getQuote(requestOpts: QuoteRequest) {
  const url = new URL('/api/v3/quotes/getQuote', quoteUrl);
  const request = {
    dAppID: 'dapp',
    quoteRequest: {
      sourceChainID: Number(requestOpts.source),
      sourceAmount: requestOpts.sourceAmount.toString(),
      sourceToken: requestOpts.sourceToken,
      funder: requestOpts.funder,
      refundRecipient: requestOpts.funder,
      destinationChainID: Number(requestOpts.destination),
      destinationToken: requestOpts.destinationToken,
      recipient: requestOpts.recipient,
    },
  };

  console.info(`Calling quoting service: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  const result = (await response.json()) as { data: QuoteResponse };

  if (!response.ok) throw new Error(JSON.stringify(result));

  return result.data;
}

// Main execution
async function main() {
  try {
    console.log('Creating EVM to EVM intent');
    console.info(`From: ${source.name}`);
    console.info(`To: ${destination.name}`);
    console.info(`Reward amount: ${REWARD_AMOUNT}`);
    console.info('');

    // Step 1: Get a quote
    const { quoteResponse } = await getQuote({
      source: source.id,
      sourceAmount: REWARD_AMOUNT,
      sourceToken: SOURCE_TOKEN,
      funder: RECIPIENT,

      destination: destination.id,
      destinationToken: DESTINATION_TOKEN,
      recipient: RECIPIENT,
    });

    const { destinationAmount, encodedRoute } = quoteResponse;

    // Step 1.1: Extract route amount
    const routeAmount = BigInt(destinationAmount);
    console.info(`Route amount: ${routeAmount.toString()}`);

    // Step 2: Approve reward token
    await approveTokens();

    // Step 3: Create intent
    const reward = buildReward();

    // Step 4: Publish intent
    await publishIntent(encodedRoute, reward);

    console.log('Intent successfully created and published!');
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.DEBUG && error instanceof Error) {
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
