import { readFileSync } from 'fs';
import { resolve } from 'path';
import { TokenEntry, TokenRegistry, VMType } from '@/types';

export class TokenRegistryManager {
  private registry: TokenRegistry;
  private registryPath: string;

  constructor(registryPath: string) {
    this.registryPath = resolve(registryPath);
    this.registry = this.loadRegistry();
  }

  // Get all tokens for a specific chain
  getTokensByChain(chainIdentifier: string | number): TokenEntry[] {
    return this.registry.tokens.filter(
      (token) =>
        token.chainId === chainIdentifier ||
        token.chainName.toLowerCase() === String(chainIdentifier).toLowerCase()
    );
  }

  // Get all tokens of a specific type (e.g., all USDC across chains)
  getTokensBySymbol(symbol: string): TokenEntry[] {
    return this.registry.tokens.filter(
      (token) => token.symbol.toUpperCase() === symbol.toUpperCase()
    );
  }

  // Get tokens by VM type
  getTokensByVM(vmType: VMType): TokenEntry[] {
    return this.registry.tokens.filter((token) => token.vmType === vmType);
  }

  // Get unique chains
  getSupportedChains(): Array<{ chainId: string | number; chainName: string; vmType: VMType }> {
    const chains = new Map();
    this.registry.tokens.forEach((token) => {
      const key = `${token.chainId}-${token.vmType}`;
      if (!chains.has(key)) {
        chains.set(key, {
          chainId: token.chainId,
          chainName: token.chainName,
          vmType: token.vmType,
        });
      }
    });
    return Array.from(chains.values());
  }

  // Get registry metadata
  getRegistryInfo(): {
    version: string;
    lastUpdated: string;
    tokenCount: number;
    chainCount: number;
  } {
    return {
      version: this.registry.version,
      lastUpdated: this.registry.lastUpdated,
      tokenCount: this.registry.tokens.length,
      chainCount: this.getSupportedChains().length,
    };
  }

  private loadRegistry(): TokenRegistry {
    try {
      const data = readFileSync(this.registryPath, 'utf-8');
      const registry = JSON.parse(data) as TokenRegistry;
      this.validateRegistry(registry);
      return registry;
    } catch (error) {
      throw new Error(
        `Failed to load token registry from ${this.registryPath}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private validateRegistry(registry: TokenRegistry): void {
    if (!registry.version || !registry.lastUpdated || !Array.isArray(registry.tokens)) {
      throw new Error('Invalid token registry format');
    }

    // Validate each token entry
    for (const token of registry.tokens) {
      this.validateTokenEntry(token);
    }
  }

  private validateTokenEntry(token: TokenEntry): void {
    const requiredFields = [
      'symbol',
      'name',
      'chainId',
      'chainName',
      'vmType',
      'address',
      'decimals',
    ];

    for (const field of requiredFields) {
      if (
        !(field in token) ||
        token[field as keyof TokenEntry] === undefined ||
        token[field as keyof TokenEntry] === null
      ) {
        throw new Error(
          `Invalid token entry: missing ${field} for ${token.symbol || 'unknown token'}`
        );
      }
    }

    // Validate VM type
    if (!['EVM', 'TVM', 'SVM'].includes(token.vmType)) {
      throw new Error(`Invalid VM type: ${token.vmType} for token ${token.symbol}`);
    }

    // Validate decimals
    if (typeof token.decimals !== 'number' || token.decimals < 0 || token.decimals > 30) {
      throw new Error(`Invalid decimals: ${token.decimals} for token ${token.symbol}`);
    }
  }
}
