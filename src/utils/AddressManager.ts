import { VMType } from '../types/index.js';

export interface AddressFormat {
  vmType: VMType;
  validate(address: string): boolean;
  normalize(address: string): string;
  format(address: string): string;
  isValid(address: string): boolean;
}

class EVMAddressFormat implements AddressFormat {
  vmType: VMType = 'EVM';

  validate(address: string): boolean {
    // EVM addresses are 20 bytes, displayed as 0x + 40 hex chars
    return /^0x[a-fA-F0-9]{40}$/i.test(address);
  }

  normalize(address: string): string {
    // EVM addresses are case-insensitive, normalize to lowercase
    return address.toLowerCase();
  }

  format(address: string): string {
    // For demo purposes, just return lowercase
    // In a real implementation, would use EIP-55 checksum formatting
    return this.normalize(address);
  }

  isValid(address: string): boolean {
    return this.validate(address);
  }
}

class TVMAddressFormat implements AddressFormat {
  vmType: VMType = 'TVM';

  validate(address: string): boolean {
    // Tron addresses start with T and are Base58 encoded
    return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address);
  }

  normalize(address: string): string {
    // TVM addresses are case-sensitive
    return address;
  }

  format(address: string): string {
    // Return as-is, already in correct format
    return address;
  }

  isValid(address: string): boolean {
    try {
      // Basic validation - in a real implementation would verify Base58 checksum
      return this.validate(address);
    } catch {
      return false;
    }
  }
}

class SVMAddressFormat implements AddressFormat {
  vmType: VMType = 'SVM';

  validate(address: string): boolean {
    // Solana addresses are Base58 encoded public keys
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
  }

  normalize(address: string): string {
    // SVM addresses are case-sensitive
    return address;
  }

  format(address: string): string {
    // Return as-is
    return address;
  }

  isValid(address: string): boolean {
    try {
      // Basic validation - in a real implementation would use Solana's PublicKey validation
      return this.validate(address);
    } catch {
      return false;
    }
  }
}

export class AddressManager {
  private formats: Map<VMType, AddressFormat> = new Map([
    ['EVM', new EVMAddressFormat()],
    ['TVM', new TVMAddressFormat()],
    ['SVM', new SVMAddressFormat()],
  ]);

  validateAddress(address: string, vmType: VMType): boolean {
    const format = this.formats.get(vmType);
    if (!format) {
      throw new Error(`Unknown VM type: ${vmType}`);
    }
    return format.isValid(address);
  }

  formatAddress(address: string, vmType: VMType): string {
    const format = this.formats.get(vmType);
    if (!format) {
      throw new Error(`Unknown VM type: ${vmType}`);
    }
    return format.format(address);
  }

  normalizeAddress(address: string, vmType: VMType): string {
    const format = this.formats.get(vmType);
    if (!format) {
      throw new Error(`Unknown VM type: ${vmType}`);
    }
    return format.normalize(address);
  }

  detectVMType(address: string): VMType | null {
    for (const [vmType, format] of this.formats.entries()) {
      if (format.validate(address)) {
        return vmType;
      }
    }
    return null;
  }

  // Get zero address for a specific VM type
  getZeroAddress(vmType: VMType): string {
    switch (vmType) {
      case 'EVM':
        return '0x0000000000000000000000000000000000000000';
      case 'TVM':
        return 'T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'; // Tron zero address
      case 'SVM':
        return '11111111111111111111111111111111'; // Solana system program
      default:
        throw new Error(`Unknown VM type: ${vmType}`);
    }
  }

  // Check if address is zero address for the VM type
  isZeroAddress(address: string, vmType: VMType): boolean {
    const zeroAddress = this.getZeroAddress(vmType);
    return this.normalizeAddress(address, vmType) === this.normalizeAddress(zeroAddress, vmType);
  }

  // Format address for display (shortened version)
  formatForDisplay(address: string, vmType: VMType, length: number = 8): string {
    if (!this.validateAddress(address, vmType)) {
      return 'Invalid Address';
    }

    const formatted = this.formatAddress(address, vmType);

    if (formatted.length <= length * 2) {
      return formatted;
    }

    const halfLength = Math.floor(length / 2);
    return `${formatted.slice(0, halfLength)}...${formatted.slice(-halfLength)}`;
  }

  // Get address format information
  getAddressInfo(address: string): {
    address: string;
    vmType: VMType | null;
    isValid: boolean;
    formatted: string;
    normalized: string;
  } {
    const vmType = this.detectVMType(address);
    const isValid = vmType !== null;

    return {
      address,
      vmType,
      isValid,
      formatted: isValid ? this.formatAddress(address, vmType!) : address,
      normalized: isValid ? this.normalizeAddress(address, vmType!) : address,
    };
  }

  // Validate multiple addresses
  validateAddresses(addresses: { address: string; vmType: VMType }[]): {
    valid: boolean;
    results: Array<{
      address: string;
      vmType: VMType;
      isValid: boolean;
      error?: string;
    }>;
  } {
    const results = addresses.map(({ address, vmType }) => {
      try {
        const isValid = this.validateAddress(address, vmType);
        return {
          address,
          vmType,
          isValid,
          error: isValid ? undefined : `Invalid ${vmType} address format`,
        };
      } catch (error) {
        return {
          address,
          vmType,
          isValid: false,
          error: error instanceof Error ? error.message : 'Unknown validation error',
        };
      }
    });

    return {
      valid: results.every((result) => result.isValid),
      results,
    };
  }

  // Get supported VM types
  getSupportedVMTypes(): VMType[] {
    return Array.from(this.formats.keys());
  }

  // Get VM type description
  getVMTypeDescription(vmType: VMType): string {
    switch (vmType) {
      case 'EVM':
        return 'Ethereum Virtual Machine';
      case 'TVM':
        return 'Tron Virtual Machine';
      case 'SVM':
        return 'Solana Virtual Machine';
      default:
        return 'Unknown VM Type';
    }
  }

  // Get address format description
  getAddressFormatDescription(vmType: VMType): string {
    switch (vmType) {
      case 'EVM':
        return '0x + 40 hex characters (e.g., 0x742d35...3ed6)';
      case 'TVM':
        return 'T + 33 base58 characters (e.g., TR7NHq...Lj6t)';
      case 'SVM':
        return '32-44 base58 characters (e.g., EPjFW...Dt1v)';
      default:
        return 'Unknown format';
    }
  }

  // Convert addresses between formats if possible (limited cases)
  convertAddress(address: string, fromVM: VMType, toVM: VMType): string {
    if (fromVM === toVM) {
      return address;
    }

    // Most cross-VM conversions aren't directly possible
    // This method exists for potential future use cases or special conversions
    throw new Error(
      `Cannot convert address from ${fromVM} to ${toVM}: cross-VM address conversion not supported`
    );
  }
}
