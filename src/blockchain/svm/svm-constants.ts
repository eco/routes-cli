/**
 * SVM (Solana) Configuration Constants
 * Centralizes all configuration values and magic numbers for better maintainability
 */

import { Commitment, ConnectionConfig } from '@solana/web3.js';

/**
 * Connection configuration for Solana RPC
 */
export const SVM_CONNECTION_CONFIG: ConnectionConfig = {
  commitment: 'confirmed' as Commitment,
  disableRetryOnRateLimit: true,
  wsEndpoint: undefined,
  confirmTransactionInitialTimeout: 60000,
};

/**
 * Anchor provider configuration
 */
export const SVM_PROVIDER_CONFIG = {
  commitment: 'confirmed' as Commitment,
  preflightCommitment: 'confirmed' as Commitment,
  skipPreflight: false,
  maxRetries: 3,
};

/**
 * Transaction confirmation settings
 */
export const SVM_CONFIRMATION_CONFIG = {
  DEFAULT_COMMITMENT: 'confirmed' as Commitment,
  MAX_CONFIRMATION_RETRIES: 30,
  CONFIRMATION_POLLING_INTERVAL_MS: 1000,
  PREFLIGHT_COMMITMENT: 'confirmed' as Commitment,
  SKIP_PREFLIGHT: false,
  MAX_SEND_RETRIES: 3,
};

/**
 * PDA seeds for Solana program derived addresses
 */
export const SVM_PDA_SEEDS = {
  VAULT: 'vault',
};

/**
 * Error messages
 */
export const SVM_ERROR_MESSAGES = {
  NO_PORTAL_ADDRESS: (chainId: bigint) => `No Portal address configured for chain ${chainId}`,
  NO_REWARD_TOKENS: 'No reward tokens to fund',
  FUNDING_FAILED: 'Intent funding failed',
  PUBLISH_FAILED: 'Intent publishing failed',
  CONFIRMATION_TIMEOUT: (seconds: number) =>
    `Transaction confirmation timeout after ${seconds} seconds`,
  INVALID_PRIVATE_KEY: 'Invalid private key format',
  INSUFFICIENT_BALANCE: 'Insufficient balance for transaction',
  TOKEN_ACCOUNT_CREATION_FAILED: 'Failed to create token account',
};

/**
 * Logging messages
 */
export const SVM_LOG_MESSAGES = {
  PORTAL_PROGRAM: (address: string) => `Using Portal Program: ${address}`,
  CREATOR: (address: string) => `Creator: ${address}`,
  DESTINATION_CHAIN: (chainId: bigint) => `Destination Chain: ${chainId}`,
  VAULT_PDA: (address: string) => `Vault PDA: ${address}`,
  SETUP_ANCHOR: 'Setting up Anchor program...',
  BUILD_PUBLISH_TX: 'Building publish transaction...',
  BUILD_FUNDING_TX: 'Building funding transaction...',
  PUBLISHING_INTENT: 'Publishing intent to Solana network...',
  FUNDING_INTENT: 'Funding intent on Solana network...',
  SENDING_TX: 'Sending transaction...',
  TX_SIGNATURE: (signature: string) => `Transaction signature: ${signature}`,
  TX_CONFIRMED: (status: string) => `Transaction confirmed with ${status} commitment`,
  INTENT_PUBLISHED: (signature: string) => `Intent published! Transaction signature: ${signature}`,
  INTENT_FUNDED: (signature: string) => `Intent funding transaction signature: ${signature}`,
  CREATE_TOKEN_ACCOUNT: 'Creating funder token account...',
  TOKEN_ACCOUNT_CREATED: (signature: string) => `Created funder token account: ${signature}`,
  FUNDING_SUCCESS: (hash: string) => `Funding successful: ${hash}`,
  PUBLISH_SUCCESS: 'Transaction confirmed - Intent is published!',
  FUNDING_CONFIRMED: 'Intent funded and confirmed!',
};
