/**
 * EVM to EVM Intent Creation Example
 *
 * This script demonstrates how to create and publish cross-chain intents
 * using Eco Protocol's intent system. It showcases both a simple functional
 * approach and a more structured class-based approach.
 *
 * Key Concepts:
 * - Intent: A cross-chain transaction request
 * - Route: The execution path on the destination chain
 * - Reward: Incentive for solvers who fulfill the intent
 * - Portal: The contract that handles intent publishing
 *
 * Prerequisites:
 * - Set PRIVATE_KEY environment variable
 * - Have tokens approved for the portal contract
 * - Sufficient balance for rewards
 */

import * as dotenv from 'dotenv';
import {
  Address,
  Chain,
  ContractFunctionArgs,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  Hex,
  http,
  parseAbi,
  PublicClient,
  WalletClient,
} from 'viem';
import { Account, privateKeyToAccount } from 'viem/accounts';
import { base, optimism } from 'viem/chains';

dotenv.config();

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Portal contract ABI for intent publishing
 */
const portalAbi = parseAbi([
  'error InsufficientFunds(bytes32 intentHash)',
  'function publishAndFund(uint64 destination, bytes route, (uint64 deadline,address creator,address prover,uint256 nativeAmount,(address token, uint256 amount)[] tokens) reward,bool allowPartial) external returns (bytes32 intentHash, address vault)',
  'function fulfill(bytes32 intentHash, (bytes32 salt, uint64 deadline, address portal, uint256 nativeAmount, (address token, uint256 amount)[] tokens, (address target, bytes data, uint256 value)[] calls) route, bytes32 rewardHash, bytes32 claimant) external',
]);

export type Route = ContractFunctionArgs<typeof portalAbi, 'nonpayable', 'fulfill'>[1];
export type Reward = ContractFunctionArgs<typeof portalAbi, 'nonpayable', 'publishAndFund'>[2];

/**
 * Quote service response structure
 */
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
    fees: Array<{
      name: string;
      description: string;
      token: {
        address: Address;
        decimals: number;
        symbol: string;
      };
      amount: string;
    }>;
    deadline: number;
  };
  contracts: {
    intentSource: Address;
    prover: Address;
    inbox: Address;
  };
}

/**
 * Configuration for creating an intent
 */
interface IntentConfig {
  // Private key for signing transactions
  privateKey: Hex;

  // Chain configurations
  sourceChain: Chain;
  destinationChain: Chain;

  // Contract addresses
  sourcePortalAddress: Address;
  proverAddress: Address;

  // Token configurations
  sourceToken: Address;
  destinationToken: Address;

  // Transaction parameters
  rewardAmount: bigint;
  recipient: Address;

  // Optional configurations
  quoteServiceUrl?: string;
  routeDeadlineSeconds?: number;
  rewardDeadlineSeconds?: number;
}

/**
 * Quote request parameters
 */
interface QuoteRequest {
  source: number;
  sourceAmount: bigint;
  sourceToken: string;
  funder: string;
  destination: number;
  destinationToken: string;
  recipient: string;
}

// ============================================================================
// Pure Functions (No Global Dependencies)
// ============================================================================

/**
 * Creates a reward structure for the intent
 *
 * @param config - Complete configuration including deadlines and addresses
 * @param account - The account creating the intent
 * @returns Reward structure for the portal contract
 */
function createReward(config: IntentConfig, account: Account): Reward {
  const now = Math.floor(Date.now() / 1000);
  const deadline = config.rewardDeadlineSeconds || 7200; // Default 2 hours

  return {
    deadline: BigInt(now + deadline),
    creator: account.address,
    prover: config.proverAddress,
    nativeAmount: 0n,
    tokens: [
      {
        token: config.sourceToken,
        amount: config.rewardAmount,
      },
    ],
  };
}

/**
 * Fetches a quote from the quote service
 *
 * @param request - Quote request parameters
 * @param quoteServiceUrl - URL of the quote service
 * @returns Quote response with route information
 */
async function fetchQuote(request: QuoteRequest, quoteServiceUrl: string): Promise<QuoteResponse> {
  const url = new URL('/api/v3/quotes/getQuote', quoteServiceUrl);

  const requestBody = {
    dAppID: 'dapp',
    quoteRequest: {
      sourceChainID: request.source,
      sourceAmount: request.sourceAmount.toString(),
      sourceToken: request.sourceToken,
      funder: request.funder,
      refundRecipient: request.funder,
      destinationChainID: request.destination,
      destinationToken: request.destinationToken,
      recipient: request.recipient,
    },
  };

  console.info(`📡 Fetching quote from: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const result = (await response.json()) as { data: QuoteResponse };

  if (!response.ok) {
    throw new Error(`Quote service error: ${JSON.stringify(result)}`);
  }

  return result.data;
}

/**
 * Approves token spending for the portal contract
 *
 * @param tokenAddress - Address of the token to approve
 * @param spender - Address that will spend the tokens (portal)
 * @param amount - Amount to approve
 * @param walletClient - Wallet client for sending transactions
 * @param publicClient - Public client for waiting for confirmations
 */
async function approveToken(
  tokenAddress: Address,
  spender: Address,
  amount: bigint,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<void> {
  console.info(`✅ Approving ${amount} tokens for ${spender}`);

  const hash = await walletClient.writeContract({
    address: tokenAddress,
    abi: erc20Abi,
    functionName: 'approve',
    args: [spender, amount],
    chain: walletClient.chain,
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.info(`   Approval confirmed: ${hash}`);
}

/**
 * Publishes an intent to the portal contract
 *
 * @param portal - Portal contract address
 * @param destinationChainId - Destination chain ID
 * @param routeBytes - Encoded route data
 * @param reward - Reward structure
 * @param walletClient - Wallet client for sending transactions
 * @param publicClient - Public client for waiting for confirmations
 * @returns Transaction hash
 */
async function publishIntent(
  portal: Address,
  destinationChainId: bigint,
  routeBytes: Hex,
  reward: Reward,
  walletClient: WalletClient,
  publicClient: PublicClient
): Promise<Hex> {
  console.info('📤 Publishing intent to portal...');

  const hash = await walletClient.writeContract({
    address: portal,
    abi: portalAbi,
    functionName: 'publishAndFund',
    args: [destinationChainId, routeBytes, reward, false],
    chain: walletClient.chain,
    account: walletClient.account!,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  console.info(`✨ Intent published successfully!`);
  console.info(`   Transaction: ${hash}`);

  return hash;
}

// ============================================================================
// Class-Based Approach (Encapsulated Logic)
// ============================================================================

/**
 * IntentCreator class encapsulates all logic for creating and publishing intents
 *
 * This approach provides:
 * - Better testability (can mock dependencies)
 * - Cleaner separation of concerns
 * - Reusable instance with configured clients
 * - No global variable access
 */
class IntentCreator {
  private account: Account;
  private walletClient: WalletClient;
  private publicClient: PublicClient;

  constructor(private config: IntentConfig) {
    // Validate configuration
    this.validateConfig();

    // Initialize account and clients
    this.account = privateKeyToAccount(config.privateKey);

    this.walletClient = createWalletClient({
      account: this.account,
      chain: config.sourceChain,
      transport: http(),
    });

    this.publicClient = createPublicClient({
      chain: config.sourceChain,
      transport: http(),
    });
  }

  /**
   * Validates the configuration
   */
  private validateConfig(): void {
    if (!this.config.privateKey) {
      throw new Error('Private key is required');
    }

    if (!this.config.sourceChain || !this.config.destinationChain) {
      throw new Error('Source and destination chains are required');
    }

    if (!this.config.sourcePortalAddress || !this.config.proverAddress) {
      throw new Error('Portal and prover addresses are required');
    }

    if (!this.config.sourceToken || !this.config.destinationToken) {
      throw new Error('Source and destination tokens are required');
    }

    if (!this.config.rewardAmount || this.config.rewardAmount <= 0n) {
      throw new Error('Valid reward amount is required');
    }
  }

  /**
   * Gets a quote for the intent
   */
  async getQuote(): Promise<QuoteResponse> {
    const quoteServiceUrl = this.config.quoteServiceUrl || 'https://quotes-preprod.eco.com';

    const request: QuoteRequest = {
      source: this.config.sourceChain.id,
      sourceAmount: this.config.rewardAmount,
      sourceToken: this.config.sourceToken,
      funder: this.config.recipient,
      destination: this.config.destinationChain.id,
      destinationToken: this.config.destinationToken,
      recipient: this.config.recipient,
    };

    return fetchQuote(request, quoteServiceUrl);
  }

  /**
   * Approves tokens for the portal
   */
  async approveTokens(): Promise<void> {
    await approveToken(
      this.config.sourceToken,
      this.config.sourcePortalAddress,
      this.config.rewardAmount,
      this.walletClient,
      this.publicClient
    );
  }

  /**
   * Creates and publishes an intent
   */
  async createAndPublish(): Promise<Hex> {
    console.log('🚀 Creating Intent');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.info(`📍 From: ${this.config.sourceChain.name}`);
    console.info(`📍 To: ${this.config.destinationChain.name}`);
    console.info(`💰 Reward: ${this.config.rewardAmount}`);
    console.info(`👤 Recipient: ${this.config.recipient}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Step 1: Get quote
    console.log('Step 1: Getting quote...');
    const { quoteResponse } = await this.getQuote();
    const { destinationAmount, encodedRoute } = quoteResponse;
    console.info(`   Destination amount: ${destinationAmount}`);
    console.log('');

    // Step 2: Approve tokens
    console.log('Step 2: Approving tokens...');
    await this.approveTokens();
    console.log('');

    // Step 3: Create reward
    console.log('Step 3: Creating reward structure...');
    const reward = createReward(this.config, this.account);
    console.info(`   Deadline: ${new Date(Number(reward.deadline) * 1000).toISOString()}`);
    console.log('');

    // Step 4: Publish intent
    console.log('Step 4: Publishing intent...');
    const txHash = await publishIntent(
      this.config.sourcePortalAddress,
      BigInt(this.config.destinationChain.id),
      encodedRoute,
      reward,
      this.walletClient,
      this.publicClient
    );
    console.log('');

    console.log('✅ Intent successfully created and published!');
    return txHash;
  }
}

// ============================================================================
// Example Usage
// ============================================================================

/**
 * Simple function-based example
 *
 * This approach is straightforward but requires passing all dependencies
 * to each function call.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function simpleExample() {
  // Configuration
  const config: IntentConfig = {
    privateKey: process.env.PRIVATE_KEY as Hex,
    sourceChain: optimism,
    destinationChain: base,
    sourcePortalAddress: '0x2b7F87a98707e6D19504293F6680498731272D4f',
    proverAddress: '0x3E4a157079Bc846e9d2C71f297d529e0fcb4D44d',
    sourceToken: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', // USDC on Optimism
    destinationToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', // USDC on Base
    rewardAmount: 100000n, // 0.1 USDC (6 decimals)
    recipient: '0x0000000000000000000000000000000000000000', // Set your recipient
  };

  // Initialize account and clients
  const account = privateKeyToAccount(config.privateKey);
  config.recipient = account.address; // Use sender as recipient

  const walletClient = createWalletClient({
    account,
    chain: config.sourceChain,
    transport: http(),
  });

  const publicClient = createPublicClient({
    chain: config.sourceChain,
    transport: http(),
  });

  // Execute steps
  const quote = await fetchQuote(
    {
      source: config.sourceChain.id,
      sourceAmount: config.rewardAmount,
      sourceToken: config.sourceToken,
      funder: config.recipient,
      destination: config.destinationChain.id,
      destinationToken: config.destinationToken,
      recipient: config.recipient,
    },
    'https://quotes-preprod.eco.com'
  );

  await approveToken(
    config.sourceToken,
    config.sourcePortalAddress,
    config.rewardAmount,
    walletClient,
    publicClient
  );

  const reward = createReward(config, account);

  await publishIntent(
    config.sourcePortalAddress,
    BigInt(config.destinationChain.id),
    quote.quoteResponse.encodedRoute,
    reward,
    walletClient,
    publicClient
  );
}

/**
 * Class-based example
 *
 * This approach encapsulates all logic and provides a cleaner API.
 */
async function classBasedExample() {
  const config: IntentConfig = {
    privateKey: process.env.PRIVATE_KEY as Hex,
    sourceChain: optimism,
    destinationChain: base,
    sourcePortalAddress: '0x2b7F87a98707e6D19504293F6680498731272D4f',
    proverAddress: '0x3E4a157079Bc846e9d2C71f297d529e0fcb4D44d',
    sourceToken: '0x0b2c639c533813f4aa9d7837caf62653d097ff85',
    destinationToken: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    rewardAmount: 100000n,
    recipient: privateKeyToAccount(process.env.PRIVATE_KEY as Hex).address,
  };

  const creator = new IntentCreator(config);
  await creator.createAndPublish();
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  try {
    // Validate environment
    if (!process.env.PRIVATE_KEY) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    // Use the class-based approach by default
    await classBasedExample();

    // Uncomment to use the simple approach instead:
    // await simpleExample();
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
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

// Export for use as a module
export { approveToken, createReward, fetchQuote, IntentConfig, IntentCreator, publishIntent };
