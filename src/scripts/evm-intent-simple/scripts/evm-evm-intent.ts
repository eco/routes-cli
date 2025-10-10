/**
 * EVM to EVM Intent Creation Script
 *
 * This script demonstrates creating cross-chain intents between EVM chains
 * (Ethereum, Optimism, Base, Arbitrum, etc.)
 *
 * Example configurations:
 * - Optimism → Base (USDC transfer)
 * - Base → Optimism (USDC transfer)
 * - Ethereum → Optimism (USDT transfer)
 */

import * as dotenv from 'dotenv';
import { Hex } from 'viem';
import { base, optimism } from 'viem/chains';

import { IntentConfig, IntentCreator } from './intent-creator-base';

dotenv.config();

// ============================================================================
// Configuration Examples
// ============================================================================

/**
 * Optimism to Base USDC Transfer Configuration
 */
export const INTENT_CONFIG: IntentConfig = {
  // Private key from environment
  privateKey: process.env.PRIVATE_KEY as Hex,

  // Chain configurations
  sourceChain: optimism,
  destinationChain: base,

  // Token addresses
  sourceToken: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC on Optimism
  destinationToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base

  // Transaction parameters
  rewardAmount: 100000n, // 0.1 USDC (6 decimals)
  recipient: '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471', // Will be set to sender address if empty

  // Optional configurations
  quoteServiceUrl: 'https://quotes.eco.com',
  routeDeadlineSeconds: 7200, // 2 hours
  rewardDeadlineSeconds: 7200, // 2 hours
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Creates an EVM to EVM intent with the specified configuration
 */
async function createEvmToEvmIntent(config: IntentConfig): Promise<void> {
  try {
    // Validate environment
    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    // Create intent creator instance
    const creator = new IntentCreator(config);

    // Display configuration
    console.log('🔄 EVM to EVM Intent Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Source Chain: ${config.sourceChain.name} (${config.sourceChain.id})`);
    console.log(
      `Destination Chain: ${config.destinationChain.name} (${config.destinationChain.id})`
    );
    console.log(`Source Token: ${config.sourceToken}`);
    console.log(`Destination Token: ${config.destinationToken}`);
    console.log(`Reward Amount: ${config.rewardAmount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Create and publish the intent
    const txHash = await creator.createAndPublish();

    console.log('');
    console.log('📝 Transaction Details:');
    console.log(`   Hash: ${txHash}`);
    console.log(`   Explorer: ${getExplorerUrl(config.sourceChain, txHash)}`);
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
  // Execute intent creation
  await createEvmToEvmIntent(INTENT_CONFIG);
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export configurations for external use
export { createEvmToEvmIntent };
