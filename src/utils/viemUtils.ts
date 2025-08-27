import {
  Address,
  Chain,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  getAddress,
  Hash,
  http,
  isAddress,
  keccak256,
  parseUnits,
  PublicClient,
  toHex,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Viem utility class
export class ViemUtils {
  // Create public client for reading blockchain data
  static createPublicClient(rpcUrl: string, chainConfig?: Partial<Chain>): PublicClient {
    const defaultChain = {
      id: 1,
      name: 'Unknown Chain',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    };

    const chain = chainConfig ? { ...defaultChain, ...chainConfig } : defaultChain;

    return createPublicClient({
      chain,
      transport: http(rpcUrl),
    });
  }

  // Create wallet client for sending transactions
  static createWalletClient(
    rpcUrl: string,
    privateKey: string,
    chainConfig?: Partial<Chain>
  ): WalletClient {
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    const defaultChain = {
      id: 1,
      name: 'Unknown Chain',
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    };

    const chain = chainConfig ? { ...defaultChain, ...chainConfig } : defaultChain;

    return createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });
  }

  // Address utilities
  static isValidAddress(address: string): boolean {
    return isAddress(address);
  }

  static checksumAddress(address: string): Address {
    if (!isAddress(address)) {
      throw new Error('Invalid Ethereum address');
    }
    return getAddress(address);
  }

  static normalizeAddress(address: string): string {
    return address.toLowerCase();
  }

  // Token amount utilities
  static parseTokenAmount(amount: string, decimals: number): bigint {
    return parseUnits(amount, decimals);
  }

  static formatTokenAmount(amount: bigint, decimals: number): string {
    return formatUnits(amount, decimals);
  }

  // Hashing utilities
  static keccak256(data: string): Hash {
    return keccak256(toHex(data));
  }

  static hashString(data: string): Hash {
    return keccak256(toHex(data));
  }

  // Encoding utilities
  static encodeTransferCall(to: Address, amount: bigint): Hash {
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, amount],
    });
  }

  static encodeApproveCall(spender: Address, amount: bigint): Hash {
    return encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [spender, amount],
    });
  }
}

// Export commonly used functions
export const {
  createPublicClient: createViemPublicClient,
  createWalletClient: createViemWalletClient,
  isValidAddress,
  checksumAddress,
  normalizeAddress,
  parseTokenAmount,
  formatTokenAmount,
  keccak256: viemKeccak256,
  hashString,
  encodeTransferCall,
  encodeApproveCall,
} = ViemUtils;

export default ViemUtils;
