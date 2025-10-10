/**
 * EVM to TVM (Tron) Intent Creation Script
 *
 * This script demonstrates creating cross-chain intents from EVM chains
 * to Tron blockchain.
 *
 * Example configurations:
 * - Optimism → Tron (USDT transfer)
 * - Base → Tron (USDT transfer)
 * - Ethereum → Tron (USDT transfer)
 *
 * Note: Tron addresses can be provided in either format:
 * - Base58: TRxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 * - Hex: 41xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
 */

import * as dotenv from 'dotenv';
import { Hex } from 'viem';
import { optimism } from 'viem/chains';

import { IntentConfig, IntentCreator } from './intent-creator-base';

dotenv.config();

// ============================================================================
// Tron Chain Configuration
// ============================================================================

const TRON_MAINNET_CHAIN_ID = 728126428n; // Tron mainnet chain ID

// ============================================================================
// Configuration Examples
// ============================================================================

/**
 * Optimism to Tron USDT Transfer Configuration
 */
export const OPTIMISM_TO_TRON_CONFIG: IntentConfig = {
  // Private key from environment
  privateKey: process.env.PRIVATE_KEY as Hex,

  // Chain configurations
  sourceChain: optimism,
  destinationChain: optimism, // We use a dummy chain object, actual chain ID is set below
  destinationChainId: TRON_MAINNET_CHAIN_ID, // Override with Tron chain ID

  // Token addresses
  sourceToken: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // USDT on Optimism
  destinationToken: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on Tron (base58)

  // Transaction parameters
  rewardAmount: 100000n, // 0.1 USDT (6 decimals)
  recipient: '', // Set Tron recipient address (base58 or hex) or leave empty for default

  // Optional configurations
  quoteServiceUrl: 'https://quotes.eco.com',
  routeDeadlineSeconds: 7200, // 2 hours
  rewardDeadlineSeconds: 7200, // 2 hours
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validates a Tron address (base58 format starting with T)
 */
function isValidTronBase58Address(address: string): boolean {
  // Tron addresses in base58 format start with 'T' and are 34 characters long
  return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
}

/**
 * Validates a Tron address (hex format starting with 41)
 */
function isValidTronHexAddress(address: string): boolean {
  // Tron addresses in hex format start with '41' and are 42 characters long
  return /^41[0-9a-fA-F]{40}$/.test(address);
}

/**
 * Validates a Tron address (either base58 or hex format)
 */
function isValidTronAddress(address: string): boolean {
  return isValidTronBase58Address(address) || isValidTronHexAddress(address);
}

/**
 * Creates an EVM to Tron intent with the specified configuration
 */
async function createEvmToTronIntent(config: IntentConfig): Promise<void> {
  try {
    // Validate environment
    if (!config.privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required');
    }

    // Validate Tron recipient address if provided
    if (config.recipient && typeof config.recipient === 'string') {
      if (!isValidTronAddress(config.recipient)) {
        throw new Error(`Invalid Tron recipient address: ${config.recipient}`);
      }
    }

    // Set default recipient if not provided
    if (!config.recipient) {
      // For demo purposes, use a placeholder Tron address
      // In production, this should be the user's actual Tron wallet address
      console.log('⚠️  Warning: No recipient address provided. Please set a valid Tron address.');
      console.log('   Example (Base58): TQh8ig6rmuMqb5u8efU5LDvoott1oLzoqu');
      console.log('   Example (Hex): 41a614f803b6fd780986a42c78ec9c7f77e6ded13c');
      process.exit(1);
    }

    // Create intent creator instance
    const creator = new IntentCreator(config);

    // Display configuration
    console.log('🔄 EVM to Tron Intent Configuration');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Source Chain: ${config.sourceChain.name} (${config.sourceChain.id})`);
    console.log(`Destination: Tron (${config.destinationChainId})`);
    console.log(`Source Token: ${config.sourceToken}`);
    console.log(`Destination Token: ${config.destinationToken}`);
    console.log(`Reward Amount: ${config.rewardAmount}`);
    console.log(`Tron Recipient: ${config.recipient}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');

    // Create and publish the intent
    const txHash = await creator.createAndPublish();

    console.log('');
    console.log('📝 Transaction Details:');
    console.log(`   Hash: ${txHash}`);
    console.log(`   Explorer: ${getExplorerUrl(config.sourceChain, txHash)}`);
    console.log('');
    console.log('🔗 Track on Tron:');
    const tronExplorer = 'https://tronscan.org/#/address/';
    console.log(`   Once fulfilled, check: ${tronExplorer}${config.recipient}`);
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
  console.log('🚀 EVM to Tron Intent Creator');
  console.log('');

  // Execute intent creation
  await createEvmToTronIntent(OPTIMISM_TO_TRON_CONFIG);
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export configurations for external use
export {
  createEvmToTronIntent,
  isValidTronAddress,
  isValidTronBase58Address,
  isValidTronHexAddress,
};
