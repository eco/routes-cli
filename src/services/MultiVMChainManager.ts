import { ChainConfig, IntentInfo, TokenInfo, TokenTransferIntent } from '@/types';
import { PortalAdapter, VMAdapterFactory } from '@/adapters';
import { TokenRegistryManager } from './TokenRegistryManager.js';
import { MultiVMIntentBuilder } from './MultiVMIntentBuilder.js';
import { AddressManager } from '@/utils';

export interface CLIConfig {
  version: string;
  defaultChain: string;
  networks: ChainConfig[];
  tokenRegistry: string;
}

export class MultiVMChainManager {
  private adapters: Map<string, PortalAdapter> = new Map();
  private config: CLIConfig;
  private tokenRegistry: TokenRegistryManager;
  private addressManager: AddressManager;
  private intentBuilder: MultiVMIntentBuilder;

  constructor(config: CLIConfig, privateKey: string, tokenRegistryPath: string) {
    this.config = config;
    this.tokenRegistry = new TokenRegistryManager(tokenRegistryPath);
    this.addressManager = new AddressManager();
    this.intentBuilder = new MultiVMIntentBuilder(this.addressManager);

    // Initialize adapters for each chain based on VM type
    this.initializeAdapters(privateKey);
  }

  getAdapter(chainName: string): PortalAdapter {
    const adapter = this.adapters.get(chainName.toLowerCase());
    if (!adapter) {
      throw new Error(`Unknown chain or failed initialization: ${chainName}`);
    }
    return adapter;
  }

  getChainConfig(chainName: string): ChainConfig | undefined {
    return this.config.networks.find((n) => n.name.toLowerCase() === chainName.toLowerCase());
  }

  getSupportedChains(): ChainConfig[] {
    return this.config.networks;
  }

  // Get chains that are available (have working adapters)
  getAvailableChains(): ChainConfig[] {
    return this.config.networks.filter((network) => this.adapters.has(network.name.toLowerCase()));
  }

  async publishIntent(chainName: string, intent: TokenTransferIntent): Promise<string> {
    const adapter = this.getAdapter(chainName);
    return await adapter.publishIntent(intent);
  }

  async getIntentStatus(chainName: string, intentHash: string): Promise<boolean> {
    const adapter = this.getAdapter(chainName);
    return await adapter.getIntentStatus(intentHash);
  }

  calculateVaultAddress(chainName: string, intentHash: string): string {
    const adapter = this.getAdapter(chainName);
    return adapter.calculateVaultAddress(intentHash);
  }

  getTokensForChain(chainName: string): import('../types/index.js').TokenEntry[] {
    const chain = this.getChainConfig(chainName);
    if (!chain) return [];
    return this.tokenRegistry.getTokensByChain(chain.chainId);
  }

  async createCrossVMIntent(
    sourceChain: string,
    destinationChain: string,
    routeToken: TokenInfo,
    rewardToken: TokenInfo,
    recipient: string,
    deadlines: { route: number; refund: number }
  ): Promise<IntentInfo> {
    const source = this.getChainConfig(sourceChain);
    const dest = this.getChainConfig(destinationChain);

    if (!source || !dest) {
      throw new Error('Invalid source or destination chain');
    }

    // Validate recipient address for destination chain
    if (!this.addressManager.validateAddress(recipient, dest.vmType)) {
      throw new Error(`Invalid recipient address format for ${dest.vmType}`);
    }

    // Build the intent
    const intent = this.intentBuilder.buildTokenTransferIntent({
      sourceChain: source,
      destinationChain: dest,
      routeToken,
      rewardToken,
      recipient,
      deadlines,
    });

    // Calculate intent hash and vault address
    const intentHash = this.intentBuilder.calculateIntentHash(intent);
    const vaultAddress = this.calculateVaultAddress(sourceChain, intentHash);

    // Publish the intent on source chain
    const txHash = await this.publishIntent(sourceChain, intent);

    return {
      intentHash,
      vaultAddress,
      sourceChain: source.name,
      sourceVM: source.vmType,
      destinationChain: dest.name,
      destinationVM: dest.vmType,
      status: 'created',
      transactionHash: txHash,
      isCrossVM: source.vmType !== dest.vmType,
    };
  }

  // Get token registry manager for direct access
  getTokenRegistry(): TokenRegistryManager {
    return this.tokenRegistry;
  }

  // Get address manager for direct access
  getAddressManager(): AddressManager {
    return this.addressManager;
  }

  private initializeAdapters(privateKey: string): void {
    for (const network of this.config.networks) {
      try {
        const adapter = VMAdapterFactory.createAdapter(network, privateKey);
        this.adapters.set(network.name.toLowerCase(), adapter);
      } catch (error) {
        console.warn(
          `Failed to initialize ${network.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }
}
