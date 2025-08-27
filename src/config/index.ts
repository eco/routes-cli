import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { CLIConfig } from '../services/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default configuration file paths
const DEFAULT_CHAINS_CONFIG = resolve(__dirname, '../../config/chains.json');
const DEFAULT_TOKENS_CONFIG = resolve(__dirname, '../../config/tokens.json');

export async function loadConfig(): Promise<CLIConfig> {
  try {
    // Load chains configuration
    const chainsConfigPath = process.env.CHAIN_CONFIG_PATH || DEFAULT_CHAINS_CONFIG;
    const chainsData = readFileSync(chainsConfigPath, 'utf-8');
    const chainsConfig = JSON.parse(chainsData);

    // Load token registry path
    const tokenRegistryPath = process.env.TOKEN_REGISTRY_PATH || DEFAULT_TOKENS_CONFIG;

    // Create CLI configuration
    const config: CLIConfig = {
      version: chainsConfig.version || '1.0.0',
      defaultChain: process.env.DEFAULT_CHAIN || 'optimism',
      networks: chainsConfig.networks || [],
      tokenRegistry: tokenRegistryPath,
    };

    // Override RPC URLs from environment variables if available
    config.networks = config.networks.map((network) => ({
      ...network,
      rpcUrl: getEnvironmentRpcUrl(network.name) || network.rpcUrl,
      portalAddress: getEnvironmentPortalAddress(network.name) || network.portalAddress,
    }));

    return config;
  } catch (error) {
    throw new Error(
      `Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

function getEnvironmentRpcUrl(chainName: string): string | undefined {
  const envVar = `${chainName.toUpperCase()}_RPC_URL`;
  return process.env[envVar];
}

function getEnvironmentPortalAddress(chainName: string): string | undefined {
  const envVar = `PORTAL_ADDRESS_${chainName.toUpperCase()}`;
  return process.env[envVar];
}
