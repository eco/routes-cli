/**
 * SVM (Solana) Type Definitions
 * Provides type safety and clear interfaces for Solana-specific operations
 */

import { BN } from '@coral-xyz/anchor';
import { Commitment, Keypair, PublicKey } from '@solana/web3.js';
import { Hex } from 'viem';

import { Intent } from '@/core/interfaces/intent';

/**
 * Solana-specific portal reward format
 */
export interface SolanaPortalReward {
  deadline: BN;
  creator: PublicKey;
  prover: PublicKey;
  nativeAmount: BN;
  tokens: Array<{
    token: PublicKey;
    amount: BN;
  }>;
}

/**
 * Token transfer account configuration
 */
export interface TokenTransferAccount {
  pubkey: PublicKey;
  isWritable: boolean;
  isSigner: boolean;
}

/**
 * Fund instruction arguments for Solana
 */
export interface FundInstructionArgs {
  destination: BN;
  route_hash: number[];
  reward: SolanaPortalReward;
  allow_partial: boolean;
}

/**
 * Transaction confirmation result
 */
export interface ConfirmationResult {
  confirmed: boolean;
  status?: string;
  error?: string;
}

/**
 * Private key parsing result
 */
export interface ParsedPrivateKey {
  keypair: Keypair;
  format: 'base58' | 'array' | 'comma-separated';
}

/**
 * Intent publishing context
 */
export interface PublishContext {
  source: bigint;
  destination: bigint;
  reward: Intent['reward'];
  encodedRoute: string;
  privateKey: string;
  intentHash: string;
  routeHash: Hex;
  keypair: Keypair;
  portalProgramId: PublicKey;
}

/**
 * Token account creation result
 */
export interface TokenAccountResult {
  success: boolean;
  accountAddress?: PublicKey;
  signature?: string;
  error?: string;
}

/**
 * Anchor program setup result
 */
export interface AnchorSetupResult {
  program: any; // Program type from Anchor
  provider: any; // AnchorProvider type
}

/**
 * Transaction building result
 */
export interface TransactionBuildResult {
  transaction: any; // Transaction type from Solana
  signers: Keypair[];
}

/**
 * Custom error types for better error handling
 */
export enum SvmErrorType {
  INVALID_CONFIG = 'INVALID_CONFIG',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONFIRMATION_TIMEOUT = 'CONFIRMATION_TIMEOUT',
  TOKEN_ACCOUNT_ERROR = 'TOKEN_ACCOUNT_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
}

/**
 * Custom error class for SVM operations
 */
export class SvmError extends Error {
  constructor(
    public readonly type: SvmErrorType,
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'SvmError';
  }
}

/**
 * Transaction send options
 */
export interface TransactionSendOptions {
  skipPreflight?: boolean;
  preflightCommitment?: Commitment;
  maxRetries?: number;
}

/**
 * Decoded event from transaction logs
 */
export interface DecodedEvent {
  name: string;
  data: any;
}

/**
 * Decoded IntentPublished event data
 */
export interface DecodedIntentPublished {
  intentHash: string;
  destination: string;
  route: string;
  reward: {
    deadline: string;
    creator: string;
    prover: string;
    nativeAmount: string;
    tokens: Array<{
      token: string;
      amount: string;
    }>;
  };
}

/**
 * Enhanced transaction result with decoded data
 */
export interface TransactionResultWithDecoding {
  signature: string;
  decodedEvents?: DecodedEvent[];
  intentPublished?: DecodedIntentPublished;
}
