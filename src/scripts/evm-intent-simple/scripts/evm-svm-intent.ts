/**
 * EVM to SVM (Solana) Intent Creation Script
 *
 * This script demonstrates creating cross-chain intents from EVM chains
 * to Solana blockchain.
 *
 * Example configurations:
 * - Optimism → Solana (USDC transfer)
 * - Base → Solana (USDC transfer)
 * - Ethereum → Solana (USDT transfer)
 *
 * Note: Solana addresses should be provided in base58 format
 */

import * as dotenv from 'dotenv';
import { Hex } from 'viem';
import { optimism } from 'viem/chains';

import { IntentConfig, IntentCreator } from './intent-creator-base';

dotenv.config();

// ============================================================================
// Solana Chain Configuration
// ============================================================================

const SOLANA_CHAIN_ID = 1399811149n; // Solana mainnet chain ID

// ============================================================================
// Configuration Examples
// ============================================================================

/**
 * Optimism to Solana USDC Transfer Configuration
 */
export const OPTIMISM_TO_SOLANA_CONFIG: IntentConfig = {
  // Private key from environment
  privateKey: process.env.PRIVATE_KEY as Hex,

  // Chain configurations
  sourceChain: optimism,
  destinationChain: optimism, // We use a dummy chain object, actual chain ID is set below
  destinationChainId: SOLANA_CHAIN_ID, // Override with Solana chain ID

  // Portal and prover addresses on Optimism
  sourcePortalAddress: '0x2b7F87a98707e6D19504293F6680498731272D4f',
  proverAddress: '0x3E4a157079Bc846e9d2C71f297d529e0fcb4D44d', // HyperProver

  // Token addresses
  sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC on Optimism
  destinationToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana (base58)

  // Transaction parameters
  rewardAmount: 10000n, // 0.01 USDC (6 decimals)
  recipient: '5nChimm7uJNx3JWPxZqH3xuunqL2dvHB4F4uQJHSYTPQ', // Set Solana recipient address (base58) or leave empty for default

  // Optional configurations
  quoteServiceUrl: 'https://quotes-preprod.eco.com',
  routeDeadlineSeconds: 7200, // 2 hours
  rewardDeadlineSeconds: 7200, // 2 hours
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates a Solana address (basic check for base58 format)
 */
function isValidSolanaAddress(address: string): boolean {
  // Basic validation: check if it's a base58 string with correct length
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
  return base58Regex.test(address);
}

/**
 * Creates an EVM to Solana intent with the specified configuration
 */
async function createEvmToSolanaIntent(config: IntentConfig): Promise<void> {
  try {
    // Validate environment
    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    // Validate Solana recipient address if provided
    if (config.recipient && typeof config.recipient === 'string') {
      if (!isValidSolanaAddress(config.recipient)) {
        throw new Error(`Invalid Solana recipient address: ${config.recipient}`);
      }
    }

    // Set default recipient if not provided
    if (!config.recipient) {
      // For demo purposes, use a placeholder Solana address
      // In production, this should be the user's actual Solana wallet address
      console.log('⚠️  Warning: No recipient address provided. Please set a valid Solana address.');
      console.log('   Example: 7rNRf9CW4jwzS52kXUDtf1pG1rUPfho7tFxgjy2J6cLe');
      process.exit(1);
    }

    // Create intent creator instance
    const creator = new IntentCreator(config);

    // Display configuration
    console.log('🔄 EVM to Solana Intent Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Source Chain: ${config.sourceChain.name} (${config.sourceChain.id})`);
    console.log(`Destination: Solana (${config.destinationChainId})`);
    console.log(`Source Token: ${config.sourceToken}`);
    console.log(`Destination Token: ${config.destinationToken}`);
    console.log(`Reward Amount: ${config.rewardAmount}`);
    console.log(`Solana Recipient: ${config.recipient}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Create and publish the intent
    const txHash = await creator.createAndPublish();

    console.log('');
    console.log('📝 Transaction Details:');
    console.log(`   Hash: ${txHash}`);
    console.log(`   Explorer: ${getExplorerUrl(config.sourceChain, txHash)}`);
    console.log('');
    console.log('🔗 Track on Solana:');
    console.log(`   Once fulfilled, check: https://solscan.io/account/${config.recipient}`);
  } catch (error) {
    console.error(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.DEBUG && error instanceof Error) {
      console.error(`Stack: ${error.stack}`);
    }
    process.exit(1);
  }
}

/**
 * Gets the block explorer URL for a transaction
 */
function getExplorerUrl(chain: any, txHash: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    8453: 'https://basescan.org/tx/',
    42161: 'https://arbiscan.io/tx/',
  };

  const baseUrl = explorers[chain.id] || 'https://etherscan.io/tx/';
  return `${baseUrl}${txHash}`;
}

// ============================================================================
// Main Execution
// ============================================================================

async function main() {
  console.log('🚀 EVM to Solana Intent Creator');
  console.log('');

  // Execute intent creation
  await createEvmToSolanaIntent(OPTIMISM_TO_SOLANA_CONFIG);
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export configurations for external use
export { createEvmToSolanaIntent, isValidSolanaAddress };
