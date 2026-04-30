/**
 * SVM (Solana) Chain Publisher (NestJS injectable)
 */

import { Injectable } from '@nestjs/common';

import { getAccount, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { Hex } from 'viem';

import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { KeyHandle } from '@/shared/security';
import { ChainConfig, ChainType, Intent, UniversalAddress } from '@/shared/types';
import { logger } from '@/utils/logger';

import { BasePublisher, IntentStatus, PublishResult, ValidationResult } from '../base.publisher';
import { ChainRegistryService } from '../chain-registry.service';
import { ChainsService } from '../chains.service';

import { DefaultSvmClientFactory, SvmClientFactory } from './solana-client';
import { PublishContext, SvmError, SvmErrorType } from './svm-types';
import { executeFunding } from './transaction-builder';

@Injectable()
export class SvmPublisher extends BasePublisher {
  private connection: Connection;

  constructor(
    rpcUrl: string,
    registry: ChainRegistryService,
    private readonly chains: ChainsService,
    factory: SvmClientFactory = new DefaultSvmClientFactory()
  ) {
    super(rpcUrl, registry);
    this.connection = factory.createConnection(rpcUrl);
  }

  override async publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    keyHandle: KeyHandle,
    portalAddress?: UniversalAddress,
    proverAddress?: UniversalAddress
  ): Promise<PublishResult> {
    this.runPreflightChecks(source);
    return keyHandle.useAsync(async rawKey => {
      const keypair = this.parsePrivateKey(rawKey);
      return this.runSafely(async () => {
        const portalProgramId = portalAddress
          ? new PublicKey(AddressNormalizer.denormalize(portalAddress, ChainType.SVM))
          : this.getPortalProgramId(source);

        const { intentHash, routeHash } = PortalHashUtils.getIntentHashFromReward(
          source,
          destination,
          encodedRoute as Hex,
          reward
        );

        this.logPublishInfo(portalProgramId, keypair, destination);

        const context: PublishContext = {
          source,
          destination,
          reward,
          encodedRoute,
          intentHash,
          routeHash,
          keypair,
          portalProgramId,
          proverAddress,
        };

        const fundingResult = await this.fundIntent(context);

        if (fundingResult.success) {
          logger.info(`Funding successful: ${fundingResult.transactionHash!}`);
        }

        return fundingResult;
      });
    });
  }

  private async fundIntent(context: PublishContext): Promise<PublishResult> {
    // A reward must carry value: either SPL tokens or native lamports.
    if (context.reward.tokens.length === 0 && context.reward.nativeAmount === 0n) {
      const errorMsg = 'Cannot fund intent: reward has no SPL tokens and no native amount';
      logger.error(errorMsg);
      return { success: false, error: errorMsg };
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
        return { success: false, error: error.message };
      }
      throw error;
    }
  }

  override async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }

  override async validate(
    reward: Intent['reward'],
    senderAddress: string,
    _chainId: bigint
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

  protected override handleError(error: unknown): PublishResult {
    logger.stopSpinner();

    let errorMessage = error instanceof Error ? error.message : String(error);

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
    return { success: false, error: errorMessage };
  }

  private parsePrivateKey(privateKey: string): Keypair {
    try {
      if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
        const bytes = JSON.parse(privateKey);
        return Keypair.fromSecretKey(new Uint8Array(bytes));
      }

      if (privateKey.includes(',')) {
        const bytes = privateKey.split(',').map(b => parseInt(b.trim()));
        return Keypair.fromSecretKey(new Uint8Array(bytes));
      }

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bs58 = require('bs58');
      const bytes = bs58.decode(privateKey);
      return Keypair.fromSecretKey(bytes);
    } catch (error: unknown) {
      throw new SvmError(SvmErrorType.INVALID_CONFIG, 'Invalid private key format', error);
    }
  }

  override getStatus(
    _intentHash: string,
    _chain: ChainConfig,
    _portalAddress?: UniversalAddress
  ): Promise<IntentStatus> {
    return Promise.reject(new Error('getStatus not yet implemented for SVM'));
  }

  private getPortalProgramId(chainId: bigint): PublicKey {
    const chainConfig = this.chains.findChainById(chainId);

    if (!chainConfig?.portalAddress) {
      throw new SvmError(
        SvmErrorType.INVALID_CONFIG,
        `No Portal address configured for chain ${chainId}`
      );
    }

    return new PublicKey(AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.SVM));
  }

  private logPublishInfo(portalProgramId: PublicKey, keypair: Keypair, destination: bigint): void {
    logger.info(`Using Portal Program: ${portalProgramId.toString()}`);
    logger.info(`Creator: ${keypair.publicKey.toString()}`);
    logger.info(`Destination Chain: ${destination}`);
  }
}
