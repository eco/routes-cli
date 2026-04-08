/**
 * Mock EVM client factory for unit/integration tests.
 * Returns stub PublicClient and WalletClient that avoid live RPC connections.
 */

import type { EvmClientFactory } from '@/blockchain/evm/evm-client-factory';

export const mockEvmPublicClient = {
  getBalance: jest.fn().mockResolvedValue(0n),
  readContract: jest.fn().mockResolvedValue(0n),
  waitForTransactionReceipt: jest.fn().mockResolvedValue({ status: 'success', logs: [] }),
} as unknown as ReturnType<EvmClientFactory['createPublicClient']>;

export const mockEvmWalletClient = {
  writeContract: jest.fn().mockResolvedValue('0xmockapprovetxhash'),
  sendTransaction: jest.fn().mockResolvedValue('0xmockpublishtxhash'),
} as unknown as ReturnType<EvmClientFactory['createWalletClient']>;

export const createMockEvmClientFactory = (): EvmClientFactory => ({
  createPublicClient: jest.fn().mockReturnValue(mockEvmPublicClient),
  createWalletClient: jest.fn().mockReturnValue(mockEvmWalletClient),
});
