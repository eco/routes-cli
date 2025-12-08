/**
 * SVM Scanner
 *
 * Scans for portal events on Solana chains using WebSocket subscription.
 * Currently supports: IntentFulfilled
 */

import { BorshCoder, EventParser } from '@coral-xyz/anchor';
import { Connection, Logs, PublicKey } from '@solana/web3.js';

import { arrayToHex } from '@/blockchain/svm/svm-buffer-utils';
import { getPortalIdl } from '@/commons/idls/portal.idl';
import { logger } from '@/utils/logger';

import { BaseScanner, ScanEventType, ScannerConfig, ScanResult } from './base-scanner';

/**
 * SVM implementation of the scanner.
 * Uses WebSocket subscription to listen for portal events in real-time.
 */
export class SvmScanner extends BaseScanner {
  private connection: Connection;
  private portalProgramId: PublicKey;
  private eventParser: EventParser;
  private subscriptionId: number | null = null;
  private scanStartTime: number = 0;

  constructor(config: ScannerConfig) {
    super(config);
    this.portalProgramId = new PublicKey(config.portalAddress);

    // Create connection with WebSocket support
    this.connection = new Connection(config.rpcUrl, {
      commitment: 'confirmed',
    });

    // Create event parser using BorshCoder with portal IDL
    const idl = getPortalIdl(config.portalAddress);
    this.eventParser = new EventParser(this.portalProgramId, new BorshCoder(idl));
  }

  /**
   * Scan for events using WebSocket subscription
   */
  async scan(eventType: ScanEventType): Promise<ScanResult> {
    this.scanStartTime = Date.now();
    this.stopped = false;
    const { timeoutMs, chainName, intentHash } = this.config;

    logger.info(`Starting ${eventType} scan on Solana for intent ${intentHash}`);

    const eventLabel = this.getEventLabel(eventType);

    return new Promise<ScanResult>(resolve => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        this.cleanup();
        logger.warn(
          `${eventLabel} not detected within ${Math.round(timeoutMs! / 1000 / 60)} minutes`
        );
        resolve({
          found: false,
          eventType,
          timedOut: true,
          elapsedMs: Date.now() - this.scanStartTime,
          error: `Timeout after ${Math.round(timeoutMs! / 1000 / 60)} minutes`,
        });
      }, timeoutMs!);

      // Handle manual stop
      const checkStopped = setInterval(() => {
        if (this.stopped) {
          clearInterval(checkStopped);
          clearTimeout(timeoutId);
          this.cleanup();
          logger.stopSpinner();
          resolve({
            found: false,
            eventType,
            error: 'Scanner stopped',
          });
        }
      }, 100);

      // Subscribe to portal program logs
      logger.spinner(`Watching for ${eventLabel} on ${chainName}...`);

      this.subscriptionId = this.connection.onLogs(
        this.portalProgramId,
        (logs: Logs) => {
          const result = this.handleProgramLogs(logs, eventType);
          if (result?.found) {
            clearInterval(checkStopped);
            clearTimeout(timeoutId);
            this.cleanup();
            logger.succeed(`${eventLabel} detected on ${chainName}!`);
            resolve(result);
          }
        },
        'confirmed'
      );
    });
  }

  /**
   * Handle incoming program logs
   */
  private handleProgramLogs(logs: Logs, eventType: ScanEventType): ScanResult | null {
    try {
      for (const event of this.eventParser.parseLogs(logs.logs)) {
        if (eventType === ScanEventType.FULFILLMENT && event.name === 'IntentFulfilled') {
          const eventIntentHash = this.extractIntentHash(event.data);

          if (eventIntentHash === this.config.intentHash) {
            const claimant = this.extractClaimant(event.data);
            const elapsedMs = Date.now() - this.scanStartTime;

            return {
              found: true,
              eventType,
              claimant,
              transactionHash: logs.signature,
              elapsedMs,
            };
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`Error parsing program logs: ${errorMessage}`);
    }

    return null;
  }

  /**
   * Clean up WebSocket subscription
   */
  private cleanup(): void {
    if (this.subscriptionId !== null) {
      this.connection.removeOnLogsListener(this.subscriptionId).catch(() => {
        // Ignore cleanup errors
      });
      this.subscriptionId = null;
    }
  }

  /**
   * Stop the scanner
   */
  stop(): void {
    this.stopped = true;
    this.cleanup();
  }

  /**
   * Extract intent hash from event data
   */
  private extractIntentHash(eventData: unknown): string {
    const data = eventData as Record<string, unknown>;
    const intentHashData = data.intentHash ?? data.intent_hash;

    if (Array.isArray(intentHashData)) {
      return arrayToHex(intentHashData as number[]);
    }

    // If it's a nested array (Bytes32 struct), extract the inner array
    if (intentHashData && Array.isArray((intentHashData as number[][])[0])) {
      return arrayToHex((intentHashData as number[][])[0]);
    }

    return String(intentHashData ?? '');
  }

  /**
   * Extract claimant from event data
   */
  private extractClaimant(eventData: unknown): string {
    const data = eventData as Record<string, unknown>;
    const claimantData = data.claimant;

    if (Array.isArray(claimantData)) {
      return arrayToHex(claimantData as number[]);
    }

    // If it's a nested array (Bytes32 struct), extract the inner array
    if (claimantData && Array.isArray((claimantData as number[][])[0])) {
      return arrayToHex((claimantData as number[][])[0]);
    }

    return String(claimantData ?? '');
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
}
