/**
 * Base Scanner
 *
 * Abstract base class and interfaces for scanning blockchain events
 * (fulfillments, proofs, withdrawals) on destination/source chains.
 */

import { ChainType } from '@/core/interfaces/intent';

/**
 * Types of events that can be scanned
 */
export enum ScanEventType {
  /** Intent fulfilled on destination chain */
  FULFILLMENT = 'fulfillment',
  /** Intent proven on source chain */
  PROVEN = 'proven',
  /** Reward withdrawn on source chain */
  WITHDRAWAL = 'withdrawal',
}

/**
 * Result of a scan operation
 */
export interface ScanResult {
  /** Whether the event was found */
  found: boolean;
  /** Type of event scanned for */
  eventType: ScanEventType;
  /** Claimant address - the solver/filler who fulfilled the intent and can claim the reward */
  claimant?: string;
  /** Transaction hash where the event was found */
  transactionHash?: string;
  /** Error message if scan failed */
  error?: string;
  /** Whether the scan timed out */
  timedOut?: boolean;
  /** Time elapsed from start of scanning to event detection (in milliseconds) */
  elapsedMs?: number;
}

/**
 * Configuration for the scanner
 */
export interface ScannerConfig {
  /** The intent hash to watch for */
  intentHash: string;
  /** Portal contract address */
  portalAddress: string;
  /** RPC URL for the chain */
  rpcUrl: string;
  /** Chain ID */
  chainId: bigint;
  /** Chain type (EVM, SVM, etc.) */
  chainType: ChainType;
  /** Chain name for display purposes */
  chainName: string;
  /** Timeout in milliseconds (default: 5 minutes) */
  timeoutMs?: number;
  /** Poll interval in milliseconds (default: 5 seconds) */
  pollIntervalMs?: number;
}

/** Default timeout: 5 minutes */
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Default poll interval: 5 seconds */
export const DEFAULT_POLL_INTERVAL_MS = 5 * 1000;

/**
 * Abstract base class for blockchain event scanners.
 *
 * Implementations should handle chain-specific event listening/polling
 * to detect when specific events occur (fulfillment, proof, withdrawal).
 */
export abstract class BaseScanner {
  protected config: ScannerConfig;
  protected stopped = false;

  constructor(config: ScannerConfig) {
    this.config = {
      ...config,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    };
  }

  /**
   * Scan for a specific event type.
   * Returns when the event is detected or timeout is reached.
   */
  abstract scan(eventType: ScanEventType): Promise<ScanResult>;

  /**
   * Stop the scanner (for cleanup on user interrupt)
   */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Get the scanner configuration
   */
  getConfig(): ScannerConfig {
    return this.config;
  }
}
