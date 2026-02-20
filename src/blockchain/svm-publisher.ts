/**
 * SVM (Solana) Chain Publisher - Refactored for maintainability
 * Main publisher class that orchestrates Solana-specific intent publishing
 */

import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Hex } from 'viem';

import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { getChainById } from '@/config/chains';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { DefaultSvmClientFactory, SvmClientFactory } from './svm/solana-client';
import { PublishContext, SvmError, SvmErrorType } from './svm/svm-types';
import { executeFunding } from './svm/transaction-builder';
import { BasePublisher, PublishResult, ValidationResult } from './base-publisher';

export class SvmPublisher extends BasePublisher {
  private connection: Connection;

  constructor(rpcUrl: string, factory: SvmClientFactory = new DefaultSvmClientFactory()) {
    super(rpcUrl);
    this.connection = factory.createConnection(rpcUrl);
  }

  /**
   * Publishes an intent to the Solana blockchain
   * Simplified main method that delegates to helper functions
   */
  override async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    privateKey: string,
    portalAddress?: UniversalAddress,
    proverAddress?: UniversalAddress
  ): Promise<PublishResult> {
    return this.runSafely(async () => {
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
        proverAddress,
      };

      // Execute funding (tokens must be present)
      const fundingResult = await this.fundIntent(context);

      if (fundingResult.success) {
        logger.info(`Funding successful: ${fundingResult.transactionHash!}`);
      }

      return fundingResult;
    });
  }

  /**
   * Funds an intent if reward tokens are present
   */
  private async fundIntent(context: PublishContext): Promise<PublishResult> {
    // Funding requires tokens in reward
    if (context.reward.tokens.length === 0) {
      const errorMsg = 'Cannot fund intent: No reward tokens specified';
      logger.error(errorMsg);
      return {
        success: false,
        error: errorMsg,
      };
    }

    try {
      const fundingResult = await executeFunding(this.connection, context);

      if (!fundingResult.success) {
        logger.error(`Funding failed: ${fundingResult.error}`);
        return fundingResult;
      }

      logger.info(`Funding successful: ${fundingResult.transactionHash!}`);
      return fundingResult;
    } catch (error: unknown) {
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
  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
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
    } catch (error: unknown) {
      throw new SvmError(SvmErrorType.INVALID_CONFIG, 'Invalid private key format', error);
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
        `No Portal address configured for chain ${chainId}`
      );
    }

    return new PublicKey(AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.SVM));
  }

  /**
   * Logs initial publishing information
   */
  private logPublishInfo(portalProgramId: PublicKey, keypair: Keypair, destination: bigint): void {
    logger.info(`Using Portal Program: ${portalProgramId.toString()}`);
    logger.info(`Creator: ${keypair.publicKey.toString()}`);
    logger.info(`Destination Chain: ${destination}`);
  }

  override async validate(
    reward: Intent['reward'],
    senderAddress: string
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (reward.nativeAmount > 0n) {
      const balance = await this.getBalance(senderAddress);
      if (balance < reward.nativeAmount) {
        errors.push(
          `Insufficient SOL balance. Required: ${reward.nativeAmount} lamports, Available: ${balance}`
        );
      }
    }

    const walletPubkey = new PublicKey(senderAddress);
    for (const token of reward.tokens) {
      try {
        const tokenMint = new PublicKey(AddressNormalizer.denormalize(token.token, ChainType.SVM));
        const ata = getAssociatedTokenAddressSync(tokenMint, walletPubkey);
        const tokenAccount = await getAccount(this.connection, ata);
        if (tokenAccount.amount < token.amount) {
          errors.push(
            `Insufficient SPL token balance for ${tokenMint}. Required: ${token.amount}, Available: ${tokenAccount.amount}`
          );
        }
      } catch {
        errors.push(
          `Could not verify SPL token balance for ${AddressNormalizer.denormalize(token.token, ChainType.SVM)}`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Handles errors with Solana-specific context (logs, err, details).
   * Overrides the base handleError to add Solana program log output.
   */
  protected override handleError(error: unknown): PublishResult {
    logger.stopSpinner();

    let errorMessage = error instanceof Error ? error.message : String(error);

    // Add Solana-specific error context if available
    if (typeof error === 'object' && error !== null) {
      const solanaError = error as { logs?: string[]; err?: unknown; details?: unknown };
      if (solanaError.logs) {
        errorMessage += `\nLogs: ${solanaError.logs.join('\n')}`;
      }
      if (solanaError.err) {
        errorMessage += `\nError: ${JSON.stringify(solanaError.err)}`;
      }
      if (solanaError.details) {
        errorMessage += `\nDetails: ${JSON.stringify(solanaError.details)}`;
      }
    }

    logger.error(`Transaction failed: ${errorMessage}`);

    return {
      success: false,
      error: errorMessage,
    };
  }
}
