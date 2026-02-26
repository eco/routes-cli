/**
 * Token Configuration
 */

import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { EvmAddress, SvmAddress, TronAddress, UniversalAddress } from '@/shared/types';

/** Describes a cross-chain token and its deployed contract addresses. */
export interface TokenConfig {
  /** Ticker symbol, e.g. `"USDC"`, `"USDT"`. */
  symbol: string;
  /** Human-readable name, e.g. `"USD Coin"`. */
  name: string;
  /**
   * Number of decimal places for the smallest unit.
   * Used to convert between human-readable amounts and on-chain integers
   * (e.g. `6` for USDC: `1 USDC = 1_000_000` base units).
   */
  decimals: number;
  /**
   * Map of chain ID (as decimal string) to Universal-format token address.
   *
   * String keys are required because `bigint` cannot be a JavaScript object key.
   * Lookup pattern: `token.addresses[chainId.toString()]`
   *
   * @example `{ "8453": "0x000...abc", "1": "0x000...def" }`
   */
  addresses: Record<string, UniversalAddress>;
}

// Common token configurations
export const TOKEN_CONFIGS: Record<string, TokenConfig> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      '1': AddressNormalizer.normalizeEvm(
        '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' as EvmAddress
      ), // Ethereum
      '10': AddressNormalizer.normalizeEvm(
        '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as EvmAddress
      ), // Optimism
      '8453': AddressNormalizer.normalizeEvm(
        '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as EvmAddress
      ), // Base
      '137': AddressNormalizer.normalizeEvm(
        '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359' as EvmAddress
      ), // Polygon
      '999': AddressNormalizer.normalizeEvm(
        '0xb88339CB7199b77E23DB6E890353E22632Ba630f' as EvmAddress
      ), // Hyperevm
      '2020': AddressNormalizer.normalizeEvm(
        '0x0b7007c13325c48911f73a2dad5fa5dcbf808adc' as EvmAddress
      ), // Runin
      '42161': AddressNormalizer.normalizeEvm(
        '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as EvmAddress
      ), // Arbitrum
      '146': AddressNormalizer.normalizeEvm(
        '0x29219dd400f2bf60e5a23d13be72b486d4038894' as EvmAddress
      ), // Sonic
      '84532': AddressNormalizer.normalizeEvm(
        '0x036cbd53842c5426634e7929541ec2318f3dcf7e' as EvmAddress
      ), // Base Sepolia
      '11155420': AddressNormalizer.normalizeEvm(
        '0x5fd84259d66Cd46123540766Be93DFE6D43130D7' as EvmAddress
      ), // Optimism Sepolia
      '9746': AddressNormalizer.normalizeEvm(
        '0x107d0b0428741b37331138040F793aF171682603' as EvmAddress
      ), // Plasma Testnet
      '11155111': AddressNormalizer.normalizeEvm(
        '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as EvmAddress
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
      '1': AddressNormalizer.normalizeEvm(
        '0xdAC17F958D2ee523a2206206994597C13D831ec7' as EvmAddress
      ), // Ethereum
      '10': AddressNormalizer.normalizeEvm(
        '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58' as EvmAddress
      ), // Optimism
      '999': AddressNormalizer.normalizeEvm(
        '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb' as EvmAddress
      ), // Hyperevm
      '8453': AddressNormalizer.normalizeEvm(
        '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' as EvmAddress
      ), // Base
      '728126428': AddressNormalizer.normalizeTvm(
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' as TronAddress
      ), // Tron
      '2494104990': AddressNormalizer.normalizeTvm(
        'TG3XXyExBkPp9nzdajDZsozEu4BkaSJozs' as TronAddress
      ), // Tron Shasta
      '1399811149': AddressNormalizer.normalizeSvm(
        'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' as SvmAddress
      ),
      // Add more as needed
    },
  },
  bUSDC: {
    symbol: 'bUSDC',
    name: 'Binance USDC',
    decimals: 18,
    addresses: {
      '56': AddressNormalizer.normalizeEvm(
        '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d' as EvmAddress
      ), // BNB Smart Chain
    },
  },
  bUSDT: {
    symbol: 'bUSDT',
    name: 'Binance USDT',
    decimals: 18,
    addresses: {
      '56': AddressNormalizer.normalizeEvm(
        '0x55d398326f99059fF775485246999027B3197955' as EvmAddress
      ), // BNB Smart Chain
    },
  },
  ETH: {
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
    addresses: {
      // ETH-native chains → zero address (no contract; native currency sentinel)
      '1': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Ethereum
      '10': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Optimism
      '8453': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Base
      '42161': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Arbitrum
      // ETH testnets → zero address
      '11155111': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Sepolia
      '84532': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Base Sepolia
      '11155420': AddressNormalizer.normalizeEvm(
        '0x0000000000000000000000000000000000000000' as EvmAddress
      ), // Optimism Sepolia
    },
  },
  WETH: {
    symbol: 'WETH',
    name: 'Wrap Ether',
    decimals: 18,
    addresses: {
      // ETH-native chains → zero address (no contract; native currency sentinel)
      '1': AddressNormalizer.normalizeEvm(
        '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2' as EvmAddress
      ), // Ethereum
      '8453': AddressNormalizer.normalizeEvm(
        '0x4200000000000000000000000000000000000006' as EvmAddress
      ), // Base
      '2020': AddressNormalizer.normalizeEvm(
        '0xc99a6a985ed2cac1ef41640596c5a5f9f4e19ef5' as EvmAddress
      ), // Ronin WETH
    },
  },
};

/**
 * Looks up a token configuration by ticker symbol (case-sensitive).
 *
 * @param symbol - Ticker symbol, e.g. `"USDC"`.
 * @returns The matching {@link TokenConfig}, or `undefined` if not found.
 *
 * @example
 * ```ts
 * const usdc = getTokenBySymbol('USDC');
 * // usdc?.decimals === 6
 * ```
 */
export function getTokenBySymbol(symbol: string): TokenConfig | undefined {
  return TOKEN_CONFIGS[symbol];
}

/**
 * Returns the Universal-format address of a token on a specific chain.
 *
 * @param symbol - Ticker symbol, e.g. `"USDC"`.
 * @param chainId - The target chain ID.
 * @returns The Universal-format token address, or `undefined` if the token
 *   does not have a deployment on the given chain.
 *
 * @example
 * ```ts
 * const addr = getTokenAddress('USDC', 8453n); // Base mainnet USDC
 * ```
 */
export function getTokenAddress(symbol: string, chainId: bigint): UniversalAddress | undefined {
  const token = getTokenBySymbol(symbol);
  if (!token) return undefined;

  // Use chainId as string for lookup
  return token.addresses[chainId.toString()];
}

/**
 * Returns all token configurations registered in {@link TOKEN_CONFIGS}.
 *
 * @returns An array of every {@link TokenConfig}.
 *
 * @example
 * ```ts
 * listTokens().forEach(t => console.log(t.symbol));
 * ```
 */
export function listTokens(): TokenConfig[] {
  return Object.values(TOKEN_CONFIGS);
}

/**
 * Registers a custom token in the global {@link TOKEN_CONFIGS} map.
 *
 * The symbol is normalised to uppercase before insertion, so `"usdc"` and
 * `"USDC"` resolve to the same key.
 *
 * @param config - The token configuration to register.
 *
 * @example
 * ```ts
 * addCustomToken({ symbol: 'MYTOKEN', name: 'My Token', decimals: 18, addresses: {} });
 * ```
 */
export function addCustomToken(config: TokenConfig): void {
  TOKEN_CONFIGS[config.symbol.toUpperCase()] = config;
}

// Re-export TOKENS as alias for backward compatibility with plan references
export const TOKENS = TOKEN_CONFIGS;
