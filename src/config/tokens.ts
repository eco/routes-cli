/**
 * Token Configuration
 */

import { ChainType } from '@/core/interfaces/intent';
import { SvmAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<string, UniversalAddress>; // chainId (as string) -> address
}

// Common token configurations
export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      '1': AddressNormalizer.normalize('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', ChainType.EVM), // Ethereum
      '10': AddressNormalizer.normalize(
        '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
        ChainType.EVM
      ), // Optimism
      '8453': AddressNormalizer.normalize(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        ChainType.EVM
      ), // Base
      '84532': AddressNormalizer.normalize(
        '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
        ChainType.EVM
      ), // Base Sepolia
      '11155420': AddressNormalizer.normalize(
        '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
        ChainType.EVM
      ), // Optimism Sepolia
      '9746': AddressNormalizer.normalize(
        '0x107d0b0428741b37331138040F793aF171682603',
        ChainType.EVM
      ), // Plasma Testnet
      '11155111': AddressNormalizer.normalize(
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        ChainType.EVM
      ), // Sepolia
      '1399811149': AddressNormalizer.normalizeSvm(
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as SvmAddress
      ),
      '1399811150': AddressNormalizer.normalizeSvm(
        '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' as SvmAddress
      ),
      // Add more as needed
    },
  },
  USDT: {
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    addresses: {
      '1': AddressNormalizer.normalize('0xdAC17F958D2ee523a2206206994597C13D831ec7', ChainType.EVM), // Ethereum
      '10': AddressNormalizer.normalize(
        '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
        ChainType.EVM
      ), // Optimism
      '8453': AddressNormalizer.normalize(
        '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
        ChainType.EVM
      ), // Base
      '728126428': AddressNormalizer.normalize('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', ChainType.TVM), // Tron
      '2494104990': AddressNormalizer.normalize(
        'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs',
        ChainType.TVM
      ), // Tron Shasta
      // Add more as needed
    },
  },
};

// Helper function to get token by symbol
export function getTokenBySymbol(symbol: string): TokenConfig | undefined {
  return TOKEN_CONFIGS[symbol.toUpperCase()];
}

// Helper function to get token address on a specific chain
export function getTokenAddress(symbol: string, chainId: bigint): UniversalAddress | undefined {
  const token = getTokenBySymbol(symbol);
  if (!token) return undefined;

  // Use chainId as string for lookup
  return token.addresses[chainId.toString()];
}

// Helper function to list all tokens
export function listTokens(): TokenConfig[] {
  return Object.values(TOKEN_CONFIGS);
}

// Helper function to add a custom token
export function addCustomToken(config: TokenConfig): void {
  TOKEN_CONFIGS[config.symbol.toUpperCase()] = config;
}
