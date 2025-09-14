/**
 * Base Publisher Abstract Class
 *
 * Defines the common interface and structure for all blockchain publishers
 * in the Routes CLI system. Publishers are responsible for taking cross-chain
 * intents and publishing them to specific blockchain networks.
 *
 * Each concrete implementation (EVMPublisher, TVMPublisher, SVMPublisher) must
 * handle the blockchain-specific details while maintaining this common interface.
 *
 * @example
 * ```typescript
 * class CustomPublisher extends BasePublisher {
 *   async publish(intent: Intent, privateKey: string): Promise<PublishResult> {
 *     // Implementation specific to your blockchain
 *     return { success: true, transactionHash: '0x...' };
 *   }
 *
 *   // ... implement other abstract methods
 * }
 * ```
 */

import { Intent } from '../core/interfaces/intent';

/**
 * Result object returned by publisher operations.
 *
 * Contains the outcome of intent publishing with optional transaction details
 * and error information for debugging and user feedback.
 */
export interface PublishResult {
  /** Whether the publish operation was successful */
  success: boolean;
  /** Transaction hash on the blockchain (if successful) */
  transactionHash?: string;
  /** Computed intent hash for tracking purposes */
  intentHash?: string;
  /** Error message if the operation failed */
  error?: string;
  /** Vault or contract address created (if applicable) */
  vaultAddress?: string;
}

/**
 * Abstract base class for blockchain publishers.
 *
 * Provides common structure and interface for publishing cross-chain intents
 * to different blockchain networks. Each implementation handles the specific
 * blockchain protocol details while maintaining consistent behavior.
 */
export abstract class BasePublisher {
  protected rpcUrl: string;

  /**
   * Creates a new publisher instance.
   *
   * @param rpcUrl - RPC endpoint URL for blockchain communication
   */
  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Publishes an intent to the blockchain.
   *
   * Takes a cross-chain intent with UniversalAddresses and publishes it to the
   * specific blockchain network. Implementations must handle address denormalization,
   * transaction signing, and error handling appropriate for their blockchain type.
   *
   * @param intent - Intent object containing route and reward data with UniversalAddresses
   * @param privateKey - Private key for transaction signing (format depends on blockchain)
   * @returns Promise resolving to PublishResult with transaction details or error info
   * @throws {Error} When publishing fails due to network, validation, or other issues
   *
   * @example
   * ```typescript
   * const result = await publisher.publish(intent, privateKey);
   * if (result.success) {
   *   console.log(`Published: ${result.transactionHash}`);
   * } else {
   *   console.error(`Failed: ${result.error}`);
   * }
   * ```
   */
  abstract publish(intent: Intent, privateKey: string): Promise<PublishResult>;

  /**
   * Gets the native token balance of an address.
   *
   * Retrieves the balance of the blockchain's native token (ETH, TRX, SOL) for
   * a given address. Used for validation and user information display.
   *
   * @param address - Address to check balance for (in chain-native format)
   * @param chainId - Optional chain ID for chain-specific balance checks
   * @returns Promise resolving to balance in smallest unit (wei, sun, lamports)
   * @throws {Error} When balance query fails
   *
   * @example
   * ```typescript
   * const balance = await publisher.getBalance('0x742d35Cc...');
   * console.log(`Balance: ${balance} wei`);
   * ```
   */
  abstract getBalance(address: string, chainId?: bigint): Promise<bigint>;

  /**
   * Validates if the publisher can publish the given intent.
   *
   * Performs pre-flight checks to ensure the intent can be successfully published.
   * This may include balance checks, parameter validation, and blockchain-specific
   * requirements verification.
   *
   * @param intent - Intent to validate
   * @param senderAddress - Address that will send the transaction (in chain-native format)
   * @returns Promise resolving to validation result with optional error message
   *
   * @example
   * ```typescript
   * const validation = await publisher.validate(intent, senderAddress);
   * if (!validation.valid) {
   *   console.error(`Validation failed: ${validation.error}`);
   *   return;
   * }
   * // Proceed with publishing
   * ```
   */
  abstract validate(
    intent: Intent,
    senderAddress: string
  ): Promise<{ valid: boolean; error?: string }>;
}
