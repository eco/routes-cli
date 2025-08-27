import { ChainConfig } from '@/types';
import { PortalAdapter } from './PortalAdapter.js';
import { EVMAdapter } from './EVMAdapter.js';
import { TVMAdapter } from './TVMAdapter.js';
import { SVMAdapter } from './SVMAdapter.js';

export class VMAdapterFactory {
  static createAdapter(chain: ChainConfig, privateKey: string): PortalAdapter {
    switch (chain.vmType) {
      case 'EVM':
        return new EVMAdapter(chain, privateKey);
      case 'TVM':
        return new TVMAdapter(chain, privateKey);
      case 'SVM':
        return new SVMAdapter(chain, privateKey);
      default:
        throw new Error(`Unsupported VM type: ${chain.vmType}`);
    }
  }

  static getSupportedVMTypes(): string[] {
    return ['EVM', 'TVM', 'SVM'];
  }

  static validateVMType(vmType: string): boolean {
    return this.getSupportedVMTypes().includes(vmType);
  }

  static getVMDescription(vmType: string): string {
    switch (vmType) {
      case 'EVM':
        return 'Ethereum Virtual Machine (Ethereum, Optimism, Base, Arbitrum, etc.)';
      case 'TVM':
        return 'Tron Virtual Machine (Tron Network)';
      case 'SVM':
        return 'Solana Virtual Machine (Solana Network)';
      default:
        return 'Unknown VM type';
    }
  }
}
