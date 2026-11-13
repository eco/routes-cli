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
  decodeFunctionData,
  DecodeFunctionDataReturnType,
  erc20Abi,
  Hex,
  http,
  isAddress,
  isAddressEqual,
  isHex,
  parseAbi,
  PublicClient,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { isPublicRpcEndpoint } from '../../../blockchain/public-rpc-policy';

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
 * A quoted intent from the keyless eco-quotes v4 endpoint
 * (`POST {quoteServiceUrl}/v4/quotes`). The reward is the exact structure the
 * quote priced, so publishing it verbatim reproduces the quoted intent hash.
 */
export interface QuotedIntent {
  quoteId: string;
  portal: Address;
  destinationChainId: bigint;
  routeBytes: Hex;
  reward: Reward;
  destinationAmount: string;
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
 * Fetches a quote from the keyless eco-quotes v4 endpoint
 * (`POST {quoteServiceUrl}/v4/quotes`) and validates it against the request.
 * The returned reward is the exact one the quote priced; publish it verbatim
 * so the on-chain intent hash matches the quoted one.
 *
 * eco-quotes v3 retires on 2026-12-01; v4 is keyless and speaks the same
 * request/response contract as the Eco API gateway's `/v1/quotes`.
 */
export async function fetchQuote(
  request: QuoteRequest,
  quoteServiceUrl: string
): Promise<QuotedIntent> {
  const url = new URL('/v4/quotes', quoteServiceUrl);

  const requestBody = {
    type: 'exact-in',
    source: {
      chainId: request.source,
      token: request.sourceToken,
      amount: request.sourceAmount.toString(),
      funder: request.funder,
    },
    destination: {
      chainId: request.destination,
      token: request.destinationToken,
      recipient: request.recipient,
    },
    refundRecipient: request.funder,
    dappId: 'eco-routes-cli-example',
    intentExecutionTypes: ['SELF_PUBLISH'],
  };

  console.info(`📡 Fetching quote from: ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const text = await response.text();
  if (!response.ok) {
    // v4 answers RFC 7807 problem+json; 410 means the endpoint is retired.
    throw new Error(
      `Quote service error (HTTP ${response.status}) from ${url.toString()}: ${text.slice(0, 500)}`
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid quote response from ${url.toString()}: body is not JSON (${text.slice(0, 200)})`
    );
  }
  return parseQuotedIntent(body, request, url.toString());
}

/**
 * Validates an eco-quotes v4 response at the boundary and maps it to a
 * `QuotedIntent`. Explicit typeof / `in` checks only — the example scripts
 * have no zod dependency.
 */
function parseQuotedIntent(body: unknown, request: QuoteRequest, url: string): QuotedIntent {
  const invalid = (reason: string): Error =>
    new Error(`Invalid quote response from ${url}: ${reason}`);

  if (typeof body !== 'object' || body === null) throw invalid('body is not an object');

  if (!('id' in body) || typeof body.id !== 'string' || body.id.length === 0) {
    throw invalid('id is not a non-empty string');
  }
  const quoteId: string = body.id;

  if (
    !('expiresAt' in body) ||
    typeof body.expiresAt !== 'number' ||
    !Number.isSafeInteger(body.expiresAt)
  ) {
    throw invalid('expiresAt is not an integer timestamp');
  }
  const expiresAt: number = body.expiresAt;
  if (expiresAt * 1000 <= Date.now()) {
    throw invalid(
      `quote ${quoteId} already expired at ${new Date(expiresAt * 1000).toISOString()}`
    );
  }

  if (
    !('destination' in body) ||
    typeof body.destination !== 'object' ||
    body.destination === null
  ) {
    throw invalid('destination is missing or not an object');
  }
  const destinationField: object = body.destination;
  if (!('chainId' in destinationField) || destinationField.chainId !== request.destination) {
    throw invalid(`the quote does not settle on the requested chain ${request.destination}`);
  }
  if (!('amountOut' in destinationField) || typeof destinationField.amountOut !== 'string') {
    throw invalid('destination.amountOut is not a string');
  }
  const destinationAmount: string = destinationField.amountOut;

  if (!('execution' in body)) throw invalid('execution is missing');
  if (body.execution === null || body.execution === undefined) {
    throw invalid('execution is null; the quote cannot be self-published');
  }
  if (typeof body.execution !== 'object') throw invalid('execution is not an object');
  const execution: object = body.execution;

  if (!('transaction' in execution)) throw invalid('execution.transaction is missing');
  const transaction: unknown = execution.transaction;
  if (typeof transaction !== 'object' || transaction === null) {
    throw invalid('execution.transaction is not an object');
  }
  if (!('type' in transaction) || transaction.type !== 'evm') {
    throw invalid(
      `execution.transaction.type is ${
        'type' in transaction ? String(transaction.type) : 'missing'
      }; these EVM-sourced examples only self-publish evm transactions`
    );
  }
  if (!('to' in transaction) || typeof transaction.to !== 'string' || !isAddress(transaction.to)) {
    throw invalid('execution.transaction.to is not an EVM address');
  }
  const portal: Address = transaction.to;
  if (
    !('data' in transaction) ||
    typeof transaction.data !== 'string' ||
    !isHex(transaction.data)
  ) {
    throw invalid('execution.transaction.data is not hex calldata');
  }
  const calldata: Hex = transaction.data;

  let decoded: DecodeFunctionDataReturnType<typeof portalAbi>;
  try {
    decoded = decodeFunctionData({ abi: portalAbi, data: calldata });
  } catch {
    throw invalid('the funding transaction is not a recognised Portal call');
  }
  if (decoded.functionName !== 'publishAndFund') {
    throw invalid(
      `the funding transaction calls Portal.${decoded.functionName}; expected publishAndFund`
    );
  }
  // A multi-step quote may first execute on the source chain; publish that first hop unchanged.
  const [destinationChainId, routeBytes, reward, allowPartial] = decoded.args;
  if (allowPartial || reward.nativeAmount !== 0n) {
    throw invalid('these ERC-20 examples require full funding without a native-token reward');
  }

  if (!isAddress(request.funder) || !isAddressEqual(reward.creator, request.funder)) {
    throw invalid(
      `the quoted reward names creator ${reward.creator}, not the funding account ${request.funder}`
    );
  }

  const token = reward.tokens.at(0);
  if (
    reward.tokens.length !== 1 ||
    token === undefined ||
    !isAddress(request.sourceToken) ||
    !isAddressEqual(token.token, request.sourceToken) ||
    token.amount !== request.sourceAmount
  ) {
    throw invalid(
      `the quoted reward does not pay exactly one token entry matching the request ` +
        `(${request.sourceToken}, ${request.sourceAmount.toString()}); got ${reward.tokens.length} entries`
    );
  }

  return {
    quoteId,
    portal,
    destinationChainId,
    routeBytes,
    reward,
    destinationAmount,
  };
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

    const rpcUrl = this.getRpcUrl();

    // Initialize account and clients
    this.account = privateKeyToAccount(config.privateKey);

    this.walletClient = createWalletClient({
      account: this.account,
      chain: config.sourceChain,
      transport: http(rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: config.sourceChain,
      transport: http(rpcUrl),
    });
  }

  private getRpcUrl(): string {
    const chain = this.config.sourceChain;
    const variable = `EVM_RPC_URL_${chain.id}`;
    const url = process.env[variable]?.trim() || process.env.EVM_RPC_URL?.trim();
    if (!url) {
      throw new Error(`No RPC configured for ${chain.name}. Set ${variable}.`);
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
    } catch {
      throw new Error(`Invalid RPC endpoint for ${chain.name}.`);
    }
    if (isPublicRpcEndpoint(parsed)) {
      throw new Error(`Public RPC endpoints are not permitted for ${chain.name}.`);
    }
    return url;
  }

  /**
   * Gets a quote for the intent
   */
  async getQuote(): Promise<QuotedIntent> {
    const quoteServiceUrl = this.config.quoteServiceUrl || 'https://quotes.eco.com';

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
    const quote = await this.getQuote();
    console.info(`   Quote ID: ${quote.quoteId}`);
    console.info(`   Destination amount: ${quote.destinationAmount}`);
    console.info(
      `   Reward deadline: ${new Date(Number(quote.reward.deadline) * 1000).toISOString()}`
    );
    console.log('');

    // Step 2: Approve tokens for the portal the quote pays into
    console.log('Step 2: Approving tokens...');
    await this.approveTokens(quote.portal);
    console.log('');

    // Step 3: Publish intent with the quoted reward verbatim, so the published
    // intent hash matches the quote the solver priced.
    console.log('Step 3: Publishing intent...');
    const txHash = await publishIntent(
      quote.portal,
      quote.destinationChainId,
      quote.routeBytes,
      quote.reward,
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
