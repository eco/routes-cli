/**
 * Chain Type Detection Utility
 */

import { ChainType } from '../interfaces/intent';

// Chain ID to ChainType mapping
const CHAIN_MAPPINGS: Record<number, ChainType> = {
  // EVM chains
  1: ChainType.EVM,       // Ethereum Mainnet
  10: ChainType.EVM,      // Optimism
  56: ChainType.EVM,      // BNB Smart Chain
  137: ChainType.EVM,     // Polygon
  42161: ChainType.EVM,   // Arbitrum One
  43114: ChainType.EVM,   // Avalanche
  8453: ChainType.EVM,    // Base
  84532: ChainType.EVM,   // Base Sepolia
  11155420: ChainType.EVM, // Optimism Sepolia
  
  // TVM chains (Tron uses special IDs)
  1000000001: ChainType.TVM, // Tron Mainnet
  1000000002: ChainType.TVM, // Tron Shasta Testnet
  
  // SVM chains (Solana uses special IDs)
  999999999: ChainType.SVM,  // Solana Mainnet
  999999998: ChainType.SVM,  // Solana Devnet
};

export class ChainTypeDetector {
  /**
   * Detects the chain type from a chain ID
   */
  static detect(chainId: number | bigint): ChainType {
    const id = Number(chainId);
    
    const chainType = CHAIN_MAPPINGS[id];
    if (chainType) {
      return chainType;
    }
    
    // Default heuristics
    if (id > 1000000000 && id < 2000000000) {
      return ChainType.TVM; // Tron range
    }
    
    if (id > 999999000 && id < 1000000000) {
      return ChainType.SVM; // Solana range
    }
    
    // Default to EVM for standard chain IDs
    return ChainType.EVM;
  }
  
  /**
   * Get chain name from chain ID
   */
  static getChainName(chainId: number | bigint): string {
    const id = Number(chainId);
    
    const names: Record<number, string> = {
      1: 'Ethereum',
      10: 'Optimism',
      56: 'BNB Smart Chain',
      137: 'Polygon',
      42161: 'Arbitrum',
      43114: 'Avalanche',
      8453: 'Base',
      84532: 'Base Sepolia',
      11155420: 'Optimism Sepolia',
      1000000001: 'Tron',
      1000000002: 'Tron Shasta',
      999999999: 'Solana',
    };
    
    return names[id] || `Chain ${id}`;
  }
}