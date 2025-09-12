/**
 * Base Publisher Abstract Class
 */

import { Intent } from '../core/interfaces/intent';

export interface PublishResult {
  success: boolean;
  transactionHash?: string;
  intentHash?: string;
  error?: string;
  vaultAddress?: string;
}

export abstract class BasePublisher {
  protected rpcUrl: string;

  constructor(rpcUrl: string) {
    this.rpcUrl = rpcUrl;
  }

  /**
   * Publishes an intent to the blockchain
   */
  abstract publish(intent: Intent, privateKey: string): Promise<PublishResult>;

  /**
   * Gets the balance of an address
   * @param address The address to check
   * @param chainId Optional chain ID for chain-specific balance checks
   */
  abstract getBalance(address: string, chainId?: bigint): Promise<bigint>;

  /**
   * Validates if the publisher can publish the intent
   */
  abstract validate(
    intent: Intent,
    senderAddress: string
  ): Promise<{ valid: boolean; error?: string }>;
}
