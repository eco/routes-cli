import { VMType } from '@/types';

export interface WalletInfo {
  address: string;
  vmType: VMType;
  isValid: boolean;
}

export class WalletManager {
  private privateKey: string;
  private walletAddresses: Map<VMType, string> = new Map();

  constructor(privateKey: string) {
    this.privateKey = privateKey;
    this.validateAndSetupWallets();
  }

  // Format address for display (shorten long addresses)
  static formatAddressForDisplay(address: string, vmType: VMType): string {
    if (address.length <= 20) return address;

    switch (vmType) {
      case 'EVM':
        // Show first 6 and last 4 characters for EVM addresses
        return `${address.slice(0, 6)}...${address.slice(-4)}`;
      case 'TVM':
        // Show first 4 and last 4 characters for Tron addresses
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
      case 'SVM':
        // Show first 4 and last 4 characters for Solana addresses
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
      default:
        return `${address.slice(0, 8)}...${address.slice(-4)}`;
    }
  }

  getAllWalletAddresses(): WalletInfo[] {
    const wallets: WalletInfo[] = [];

    for (const [vmType, address] of this.walletAddresses.entries()) {
      wallets.push({
        address,
        vmType,
        isValid: this.validateAddress(address, vmType),
      });
    }

    return wallets;
  }

  // Get formatted wallet info for display
  getWalletSummary(): {
    hasEVM: boolean;
    hasTVM: boolean;
    hasSVM: boolean;
    addresses: { [key in VMType]?: string };
    totalSupported: number;
  } {
    const addresses: { [key in VMType]?: string } = {};
    let totalSupported = 0;

    for (const vmType of ['EVM', 'TVM', 'SVM'] as VMType[]) {
      const address = this.walletAddresses.get(vmType);
      if (address && this.validateAddress(address, vmType)) {
        addresses[vmType] = address;
        totalSupported++;
      }
    }

    return {
      hasEVM: addresses.EVM !== undefined,
      hasTVM: addresses.TVM !== undefined,
      hasSVM: addresses.SVM !== undefined,
      addresses,
      totalSupported,
    };
  }

  private validateAndSetupWallets(): void {
    // Validate and derive addresses for each VM type
    try {
      // EVM wallet setup
      const evmAddress = this.deriveEVMAddress(this.privateKey);
      this.walletAddresses.set('EVM', evmAddress);
    } catch (error) {
      console.warn(
        'Failed to setup EVM wallet:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    try {
      // TVM wallet setup
      const tvmAddress = this.deriveTVMAddress(this.privateKey);
      this.walletAddresses.set('TVM', tvmAddress);
    } catch (error) {
      console.warn(
        'Failed to setup TVM wallet:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }

    try {
      // SVM wallet setup
      const svmAddress = this.deriveSVMAddress(this.privateKey);
      this.walletAddresses.set('SVM', svmAddress);
    } catch (error) {
      console.warn(
        'Failed to setup SVM wallet:',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  private deriveEVMAddress(privateKey: string): string {
    // In a real implementation, this would use viem's privateKeyToAccount
    // For demo purposes, create a mock address
    if (!privateKey.startsWith('0x') || privateKey.length !== 66) {
      throw new Error('Invalid EVM private key format');
    }

    // Mock address derivation - in reality would use proper cryptographic derivation
    const mockAddress = '0x' + this.simpleHash(privateKey).slice(-40);
    return mockAddress;
  }

  private deriveTVMAddress(privateKey: string): string {
    // In a real implementation, this would use TronWeb's address derivation
    // For demo purposes, create a mock address
    if (privateKey.length !== 64 && !privateKey.startsWith('0x')) {
      // Try to handle both formats
      const cleanKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      if (cleanKey.length !== 64) {
        throw new Error('Invalid TVM private key format');
      }
    }

    // Mock Tron address - starts with T and is 34 characters
    return 'T' + this.simpleHash(privateKey).slice(-33);
  }

  private deriveSVMAddress(privateKey: string): string {
    // In a real implementation, this would use @solana/web3.js Keypair.fromSecretKey
    // For demo purposes, create a mock address

    // SVM private keys are typically base58 encoded
    if (privateKey.length < 32) {
      throw new Error('Invalid SVM private key format');
    }

    // Mock Solana address - base58 encoded, typically 32-44 characters
    const mockAddress = this.simpleHash(privateKey).slice(-32) + '111111111';
    return mockAddress;
  }

  private simpleHash(input: string): string {
    // Simple hash function for demo purposes
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16).padStart(64, '0');
  }

  private validateAddress(address: string, vmType: VMType): boolean {
    switch (vmType) {
      case 'EVM':
        return /^0x[a-fA-F0-9]{40}$/.test(address);
      case 'TVM':
        return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
      case 'SVM':
        return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
      default:
        return false;
    }
  }
}
