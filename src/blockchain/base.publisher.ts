import { Injectable } from '@nestjs/common';

import { RoutesCliError } from '@/shared/errors';
import { KeyHandle } from '@/shared/security';
import { Intent, UniversalAddress } from '@/shared/types';
import { logger } from '@/utils/logger';

import { ChainRegistryService } from './chain-registry.service';

export interface IntentStatus {
  fulfilled: boolean;
  solver?: string;
  fulfillmentTxHash?: string;
  blockNumber?: bigint;
  timestamp?: number;
}

export interface PublishResult {
  success: boolean;
  transactionHash?: string;
  intentHash?: string;
  error?: string;
  vaultAddress?: string;
  decodedData?: unknown;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export abstract class BasePublisher {
  constructor(
    protected readonly rpcUrl: string,
    protected readonly registry: ChainRegistryService,
  ) {}

  abstract publish(
    source: bigint,
    destination: bigint,
    reward: Intent['reward'],
    encodedRoute: string,
    keyHandle: KeyHandle,
    portalAddress?: UniversalAddress,
    proverAddress?: UniversalAddress,
  ): Promise<PublishResult>;

  abstract getBalance(address: string, chainId?: bigint): Promise<bigint>;

  abstract validate(reward: Intent['reward'], senderAddress: string): Promise<ValidationResult>;

  abstract getStatus(intentHash: string, chainId: bigint): Promise<IntentStatus>;

  protected handleError(error: unknown): PublishResult {
    const message = error instanceof Error ? error.message : String(error);
    logger.stopSpinner();
    return { success: false, error: message };
  }

  protected async runSafely(fn: () => Promise<PublishResult>): Promise<PublishResult> {
    try {
      return await fn();
    } catch (error: unknown) {
      return this.handleError(error);
    }
  }

  protected runPreflightChecks(sourceChainId: bigint): void {
    if (!this.registry.isRegistered(sourceChainId)) {
      throw RoutesCliError.unsupportedChain(sourceChainId);
    }
  }
}
