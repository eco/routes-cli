/**
 * EVM Scanner
 *
 * Scans for portal events (IntentFulfilled, IntentProven, IntentWithdrawn)
 * on EVM chains using viem's getLogs with polling.
 */

import { Address, Chain, createPublicClient, getAbiItem, Hex, http, PublicClient } from 'viem';
import * as chains from 'viem/chains';

import { portalAbi } from '@/commons/abis/portal.abi';
import { logger } from '@/utils/logger';

import { BaseScanner, ScanEventType, ScannerConfig, ScanResult } from './base-scanner';

// Extract events from portal ABI
const intentFulfilledEvent = getAbiItem({
  abi: portalAbi,
  name: 'IntentFulfilled',
});

const intentProvenEvent = getAbiItem({
  abi: portalAbi,
  name: 'IntentProven',
});

const intentWithdrawnEvent = getAbiItem({
  abi: portalAbi,
  name: 'IntentWithdrawn',
});

/**
 * EVM implementation of the scanner.
 * Uses viem to poll for portal events on EVM chains.
 */
export class EvmScanner extends BaseScanner {
  private client: PublicClient;
  private startBlock: bigint | null = null;
  private scanStartTime: number = 0;
  private currentEventType: ScanEventType = ScanEventType.FULFILLMENT;

  constructor(config: ScannerConfig) {
    super(config);
    const chain = this.getViemChain(config.chainId);
    this.client = createPublicClient({
      chain,
      transport: http(config.rpcUrl),
    });
  }

  /**
   * Scan for events until found or timeout
   */
  async scan(eventType: ScanEventType): Promise<ScanResult> {
    this.currentEventType = eventType;
    this.scanStartTime = Date.now();
    this.stopped = false;
    const { timeoutMs, pollIntervalMs, chainName } = this.config;

    // Get current block as starting point
    this.startBlock = await this.client.getBlockNumber();
    logger.info(`Starting ${eventType} scan from block ${this.startBlock}`);

    // First check if event already occurred
    const existingEvent = await this.checkForEvent(eventType);
    if (existingEvent.found) {
      return existingEvent;
    }

    const eventLabel = this.getEventLabel(eventType);
    logger.spinner(`Watching for ${eventLabel} on ${chainName}...`);

    while (!this.stopped) {
      const elapsed = Date.now() - this.scanStartTime;

      // Check timeout
      if (elapsed >= timeoutMs!) {
        logger.warn(
          `${eventLabel} not detected within ${Math.round(timeoutMs! / 1000 / 60)} minutes`
        );
        return {
          found: false,
          eventType,
          timedOut: true,
          elapsedMs: elapsed,
          error: `Timeout after ${Math.round(timeoutMs! / 1000 / 60)} minutes`,
        };
      }

      // Update spinner with elapsed time
      const elapsedSec = Math.round(elapsed / 1000);
      const remainingSec = Math.round((timeoutMs! - elapsed) / 1000);
      logger.updateSpinner(
        `Watching for ${eventLabel} on ${chainName}... (${elapsedSec}s elapsed, ${remainingSec}s remaining)`
      );

      // Wait for poll interval
      await this.sleep(pollIntervalMs!);

      // Check for event
      const result = await this.checkForEvent(eventType);
      if (result.found) {
        logger.succeed(`${eventLabel} detected on ${chainName}!`);
        return result;
      }
    }

    // Scanner was stopped manually
    logger.stopSpinner();
    return {
      found: false,
      eventType,
      error: 'Scanner stopped',
    };
  }

  /**
   * Check for the specified event type in recent blocks
   */
  private async checkForEvent(eventType: ScanEventType): Promise<ScanResult> {
    switch (eventType) {
      case ScanEventType.FULFILLMENT:
        return this.checkForFulfillment();
      case ScanEventType.PROVEN:
        return this.checkForProven();
      case ScanEventType.WITHDRAWAL:
        return this.checkForWithdrawal();
      default:
        return {
          found: false,
          eventType,
          error: `Unsupported event type: ${eventType}`,
        };
    }
  }

  /**
   * Check for IntentFulfilled events
   */
  private async checkForFulfillment(): Promise<ScanResult> {
    const eventType = ScanEventType.FULFILLMENT;
    try {
      const currentBlock = await this.client.getBlockNumber();
      const { intentHash, portalAddress } = this.config;

      const logs = await this.client.getLogs({
        address: portalAddress as Address,
        event: intentFulfilledEvent,
        args: {
          intentHash: intentHash as Hex,
        },
        fromBlock: this.startBlock ?? currentBlock - 1000n,
        toBlock: currentBlock,
      });

      if (logs.length > 0) {
        const log = logs[0];
        const elapsedMs = Date.now() - this.scanStartTime;
        return {
          found: true,
          eventType,
          claimant: log.args.claimant as string,
          transactionHash: log.transactionHash,
          elapsedMs,
        };
      }

      return { found: false, eventType };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Error checking for fulfillment: ${errorMessage}`);
      return { found: false, eventType };
    }
  }

  /**
   * Check for IntentProven events
   */
  private async checkForProven(): Promise<ScanResult> {
    const eventType = ScanEventType.PROVEN;
    try {
      const currentBlock = await this.client.getBlockNumber();
      const { intentHash, portalAddress } = this.config;

      const logs = await this.client.getLogs({
        address: portalAddress as Address,
        event: intentProvenEvent,
        args: {
          intentHash: intentHash as Hex,
        },
        fromBlock: this.startBlock ?? currentBlock - 1000n,
        toBlock: currentBlock,
      });

      if (logs.length > 0) {
        const log = logs[0];
        const elapsedMs = Date.now() - this.scanStartTime;
        return {
          found: true,
          eventType,
          claimant: log.args.claimant as string,
          transactionHash: log.transactionHash,
          elapsedMs,
        };
      }

      return { found: false, eventType };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Error checking for proof: ${errorMessage}`);
      return { found: false, eventType };
    }
  }

  /**
   * Check for IntentWithdrawn events
   * Note: intentHash is not indexed in this event, so we filter in memory
   */
  private async checkForWithdrawal(): Promise<ScanResult> {
    const eventType = ScanEventType.WITHDRAWAL;
    try {
      const currentBlock = await this.client.getBlockNumber();
      const { intentHash, portalAddress } = this.config;

      const logs = await this.client.getLogs({
        address: portalAddress as Address,
        event: intentWithdrawnEvent,
        fromBlock: this.startBlock ?? currentBlock - 1000n,
        toBlock: currentBlock,
      });

      // Filter by intentHash in memory since it's not indexed
      const matchingLog = logs.find(
        log => log.args.intentHash?.toLowerCase() === intentHash.toLowerCase()
      );

      if (matchingLog) {
        const elapsedMs = Date.now() - this.scanStartTime;
        return {
          found: true,
          eventType,
          claimant: matchingLog.args.claimant as string,
          transactionHash: matchingLog.transactionHash,
          elapsedMs,
        };
      }

      return { found: false, eventType };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Error checking for withdrawal: ${errorMessage}`);
      return { found: false, eventType };
    }
  }

  /**
   * Get human-readable label for event type
   */
  private getEventLabel(eventType: ScanEventType): string {
    switch (eventType) {
      case ScanEventType.FULFILLMENT:
        return 'fulfillment';
      case ScanEventType.PROVEN:
        return 'proof';
      case ScanEventType.WITHDRAWAL:
        return 'withdrawal';
      default:
        return 'event';
    }
  }

  /**
   * Get viem chain configuration by chain ID
   */
  private getViemChain(chainId: bigint): Chain {
    const id = Number(chainId);
    const viemChain = Object.values(chains).find((chain: Chain) => chain.id === id);

    if (!viemChain) {
      // Return a minimal chain config for unsupported chains
      return {
        id,
        name: `Chain ${id}`,
        nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
        rpcUrls: {
          default: { http: [this.config.rpcUrl] },
        },
      } as Chain;
    }

    return viemChain;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
