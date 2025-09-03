/**
 * Token Configuration
 */

import { UniversalAddress } from "../core/types/universal-address";
import { AddressNormalizer } from "../core/utils/address-normalizer";
import { ChainType } from "../core/interfaces/intent";

export interface TokenConfig {
  symbol: string;
  name: string;
  decimals: number;
  addresses: Record<string, UniversalAddress>; // chainId (as string) -> address
}

// Common token configurations
export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    addresses: {
      "1": AddressNormalizer.normalize(
        "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        ChainType.EVM,
      ), // Ethereum
      "10": AddressNormalizer.normalize(
        "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85",
        ChainType.EVM,
      ), // Optimism
      "8453": AddressNormalizer.normalize(
        "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        ChainType.EVM,
      ), // Base
      "84532": AddressNormalizer.normalize(
        "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
        ChainType.EVM,
      ), // Base Sepolia
      "11155420": AddressNormalizer.normalize(
        "0x5fd84259d66Cd46123540766Be93DFE6D43130D7",
        ChainType.EVM,
      ), // Optimism Sepolia
      // Add more as needed
    },
  },
  USDT: {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    addresses: {
      "1": AddressNormalizer.normalize(
        "0xdAC17F958D2ee523a2206206994597C13D831ec7",
        ChainType.EVM,
      ), // Ethereum
      "728126428": AddressNormalizer.normalize(
        "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
        ChainType.TVM,
      ), // Tron
      "2494104990": AddressNormalizer.normalize(
        "TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs",
        ChainType.TVM,
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
export function getTokenAddress(
  symbol: string,
  chainId: bigint,
): UniversalAddress | undefined {
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
