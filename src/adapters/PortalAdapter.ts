import { TokenTransferIntent } from '../types/index.js';

export abstract class PortalAdapter {
  abstract publishIntent(intent: TokenTransferIntent): Promise<string>;
  abstract getIntentStatus(intentHash: string): Promise<boolean>;
  abstract calculateVaultAddress(intentHash: string): string;
  abstract validateAddress(address: string): boolean;
  abstract getBalance(tokenAddress: string, walletAddress: string): Promise<bigint>;
  abstract estimateGas(intent: TokenTransferIntent): Promise<bigint>;
}