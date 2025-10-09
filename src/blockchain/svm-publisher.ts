/**
 * SVM (Solana) Chain Publisher - Refactored for maintainability
 * Main publisher class that orchestrates Solana-specific intent publishing
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Hex } from 'viem';

import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { getChainById } from '@/config/chains';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { SVM_CONNECTION_CONFIG, SVM_ERROR_MESSAGES, SVM_LOG_MESSAGES } from './svm/svm-constants';
import { executeFunding, executePublish } from './svm/svm-transaction';
import { PublishContext, SvmError, SvmErrorType } from './svm/svm-types';
import { BasePublisher, PublishResult } from './base-publisher';

export class SvmPublisher extends BasePublisher {
  private connection: Connection;

  constructor(rpcUrl: string) {
    super(rpcUrl);
    this.connection = new Connection(rpcUrl, SVM_CONNECTION_CONFIG);
  }

  /**
   * Publishes an intent to the Solana blockchain
   * Simplified main method that delegates to helper functions
   */
  async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    privateKey: string,
    portalAddress?: UniversalAddress
  ): Promise<PublishResult> {
    try {
      // Parse private key and validate configuration
      const keypair = this.parsePrivateKey(privateKey);
      const portalProgramId = portalAddress
        ? new PublicKey(AddressNormalizer.denormalize(portalAddress, ChainType.SVM))
        : this.getPortalProgramId(source);

      // Calculate hashes
      const { intentHash, routeHash } = PortalHashUtils.getIntentHashFromReward(
        source,
        destination,
        encodedRoute as Hex,
        reward
      );

      // Log initial information
      this.logPublishInfo(portalProgramId, keypair, destination);

      // Create publish context for all operations
      const context: PublishContext = {
        source,
        destination,
        reward,
        encodedRoute,
        privateKey,
        intentHash,
        routeHash,
        keypair,
        portalProgramId,
      };

      // Execute funding if tokens are present
      const fundingResult = await this.fundIntent(context);
      if (!fundingResult.success) {
        return fundingResult;
      }

      // Execute publishing
      const publishResult = await executePublish(this.connection, context);

      if (publishResult.success) {
        logger.info(SVM_LOG_MESSAGES.INTENT_PUBLISHED(publishResult.transactionHash!));
      }

      return publishResult;
    } catch (error: any) {
      return this.handleError(error);
    }
  }

  /**
   * Funds an intent if reward tokens are present
   */
  private async fundIntent(context: PublishContext): Promise<PublishResult> {
    // Skip funding if no tokens in reward
    if (context.reward.tokens.length === 0) {
      return { success: true };
    }

    try {
      const fundingResult = await executeFunding(this.connection, context);

      if (!fundingResult.success) {
        logger.error(`Funding failed: ${fundingResult.error}`);
        return fundingResult;
      }

      logger.info(SVM_LOG_MESSAGES.FUNDING_SUCCESS(fundingResult.transactionHash!));
      return fundingResult;
    } catch (error: any) {
      if (error instanceof SvmError) {
        return {
          success: false,
          error: error.message,
        };
      }
      throw error;
    }
  }

  /**
   * Gets the native SOL balance for an address
   */
  async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }

  /**
   * Parses a private key in various formats (Base58, array, comma-separated)
   */
  private parsePrivateKey(privateKey: string): Keypair {
    try {
      // Array format: [1,2,3,...]
      if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        const bytes = JSON.parse(privateKey);
        return Keypair.fromSecretKey(new Uint8Array(bytes));
      }

      // Comma-separated format: 1,2,3,...
      if (privateKey.includes(',')) {
        const bytes = privateKey.split(',').map(b => parseInt(b.trim()));
        return Keypair.fromSecretKey(new Uint8Array(bytes));
      }

      // Base58 format (default)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bs58 = require('bs58');
      const bytes = bs58.decode(privateKey);
      return Keypair.fromSecretKey(bytes);
    } catch (error: any) {
      throw new SvmError(
        SvmErrorType.INVALID_CONFIG,
        SVM_ERROR_MESSAGES.INVALID_PRIVATE_KEY,
        error
      );
    }
  }

  /**
   * Gets the Portal program ID for a given chain
   */
  private getPortalProgramId(chainId: bigint): PublicKey {
    const chainConfig = getChainById(chainId);

    if (!chainConfig?.portalAddress) {
      throw new SvmError(
        SvmErrorType.INVALID_CONFIG,
        SVM_ERROR_MESSAGES.NO_PORTAL_ADDRESS(chainId)
      );
    }

    return new PublicKey(AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.SVM));
  }

  /**
   * Logs initial publishing information
   */
  private logPublishInfo(portalProgramId: PublicKey, keypair: Keypair, destination: bigint): void {
    logger.info(SVM_LOG_MESSAGES.PORTAL_PROGRAM(portalProgramId.toString()));
    logger.info(SVM_LOG_MESSAGES.CREATOR(keypair.publicKey.toString()));
    logger.info(SVM_LOG_MESSAGES.DESTINATION_CHAIN(destination));
  }

  /**
   * Handles errors with proper formatting and logging
   */
  private handleError(error: any): PublishResult {
    logger.stopSpinner();

    let errorMessage = error.message || 'Unknown error';

    // Add additional error context if available
    if (error.logs) {
      errorMessage += `\nLogs: ${error.logs.join('\n')}`;
    }
    if (error.err) {
      errorMessage += `\nError: ${JSON.stringify(error.err)}`;
    }
    if (error.details) {
      errorMessage += `\nDetails: ${JSON.stringify(error.details)}`;
    }

    logger.error(`Transaction failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
