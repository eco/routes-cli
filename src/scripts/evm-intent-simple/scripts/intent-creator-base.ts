/**
 * Base Intent Creator Module
 *
 * Shared functionality for creating cross-chain intents.
 * This module provides the core IntentCreator class and helper functions
 * that can be used across different chain combinations (EVM-EVM, EVM-SVM, EVM-TVM).
 */

import {
  Account,
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
import { privateKeyToAccount } from 'viem/accounts';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Portal contract ABI for intent publishing
 */
export const portalAbi = parseAbi([
  'error InsufficientFunds(bytes32 intentHash)',
  'function publishAndFund(uint64 destination, bytes route, (uint64 deadline,address creator,address prover,uint256 nativeAmount,(address token, uint256 amount)[] tokens) reward,bool allowPartial) external returns (bytes32 intentHash, address vault)',
  'function fulfill(bytes32 intentHash, (bytes32 salt, uint64 deadline, address portal, uint256 nativeAmount, (address token, uint256 amount)[] tokens, (address target, bytes data, uint256 value)[] calls) route, bytes32 rewardHash, bytes32 claimant) external',
]);

export type Route = ContractFunctionArgs<typeof portalAbi, 'nonpayable', 'fulfill'>[1];
export type Reward = ContractFunctionArgs<typeof portalAbi, 'nonpayable', 'publishAndFund'>[2];

/**
 * Quote service response structure
 */
export interface QuoteResponse {
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
    sourcePortal: Address;
    prover: Address;
    destinationPortal: Address;
  };
}

/**
 * Configuration for creating an intent
 */
export interface IntentConfig {
  // Private key for signing transactions
  privateKey: Hex;

  // Chain configurations
  sourceChain: Chain;
  destinationChain: Chain;
  destinationChainId?: bigint; // For non-EVM destination chains

  // Token configurations
  sourceToken: Address;
  destinationToken: Address | string; // string for non-EVM addresses

  // Transaction parameters
  rewardAmount: bigint;
  recipient: Address | string; // string for non-EVM addresses

  // Optional configurations
  quoteServiceUrl?: string;
  routeDeadlineSeconds?: number;
  rewardDeadlineSeconds?: number;
}

/**
 * Quote request parameters
 */
export interface QuoteRequest {
  source: number;
  sourceAmount: bigint;
  sourceToken: string;
  funder: string;
  destination: number;
  destinationToken: string;
  recipient: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates a reward structure for the intent
 */
export function createReward(
  config: IntentConfig,
  account: Account,
  proverAddress: Address
): Reward {
  const now = Math.floor(Date.now() / 1000);
  const deadline = config.rewardDeadlineSeconds || 7200; // Default 2 hours

  return {
    deadline: BigInt(now + deadline),
    creator: account.address,
    prover: proverAddress,
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
 */
export async function fetchQuote(
  request: QuoteRequest,
  quoteServiceUrl: string
): Promise<QuoteResponse> {
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
 */
export async function approveToken(
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
 */
export async function publishIntent(
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
// IntentCreator Class
// ============================================================================

/**
 * IntentCreator class encapsulates all logic for creating and publishing intents
 */
export class IntentCreator {
  protected account: Account;
  protected walletClient: WalletClient;
  protected publicClient: PublicClient;

  constructor(protected config: IntentConfig) {
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
   * Gets a quote for the intent
   */
  async getQuote(): Promise<QuoteResponse> {
    const quoteServiceUrl = this.config.quoteServiceUrl || 'https://quotes-preprod.eco.com';

    const request: QuoteRequest = {
      source: this.config.sourceChain.id,
      sourceAmount: this.config.rewardAmount,
      sourceToken: this.config.sourceToken,
      funder: this.walletClient.account!.address,
      destination: Number(this.getDestinationChainId()),
      destinationToken: this.config.destinationToken,
      recipient: this.config.recipient,
    };

    return fetchQuote(request, quoteServiceUrl);
  }

  /**
   * Approves tokens for the portal
   */
  async approveTokens(portalAddress: Address): Promise<void> {
    await approveToken(
      this.config.sourceToken,
      portalAddress,
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
    console.info(`📍 To Chain ID: ${this.getDestinationChainId()}`);
    console.info(`💰 Reward: ${this.config.rewardAmount}`);
    console.info(`👤 Recipient: ${this.config.recipient || this.account.address}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Step 1: Get quote
    console.log('Step 1: Getting quote...');
    const response = await this.getQuote();
    const { destinationAmount, encodedRoute } = response.quoteResponse;
    const { sourcePortal, prover } = response.contracts;
    console.info(`   Destination amount: ${destinationAmount}`);
    console.log('');

    if (!encodedRoute) {
      console.error('Encoded route not found in quote response');
      process.exit(1);
    }

    if (!sourcePortal || !prover) {
      console.error('Portal and/or Prover addresses not found in quote response');
      process.exit(1);
    }

    // Step 2: Approve tokens
    console.log('Step 2: Approving tokens...');
    await this.approveTokens(sourcePortal);
    console.log('');

    // Step 3: Create reward
    console.log('Step 3: Creating reward structure...');
    const reward = createReward(this.config, this.account, prover);
    console.info(`   Deadline: ${new Date(Number(reward.deadline) * 1000).toISOString()}`);
    console.log('');

    // Step 4: Publish intent
    console.log('Step 4: Publishing intent...');
    const txHash = await publishIntent(
      sourcePortal,
      this.getDestinationChainId(),
      encodedRoute,
      reward,
      this.walletClient,
      this.publicClient
    );
    console.log('');

    console.log('✅ Intent successfully created and published!');
    return txHash;
  }

  /**
   * Validates the configuration
   */
  protected validateConfig(): void {
    if (!this.config.privateKey) {
      throw new Error('Private key is required');
    }

    if (!this.config.sourceChain) {
      throw new Error('Source chain is required');
    }

    if (!this.config.sourceToken || !this.config.destinationToken) {
      throw new Error('Source and destination tokens are required');
    }

    if (!this.config.rewardAmount || this.config.rewardAmount <= 0n) {
      throw new Error('Valid reward amount is required');
    }
  }

  /**
   * Gets the destination chain ID
   */
  protected getDestinationChainId(): bigint {
    // Use custom destinationChainId if provided (for non-EVM chains)
    if (this.config.destinationChainId) {
      return this.config.destinationChainId;
    }
    // Otherwise use the chain's ID (for EVM chains)
    if (this.config.destinationChain) {
      return BigInt(this.config.destinationChain.id);
    }
    throw new Error('Destination chain ID not configured');
  }
}
