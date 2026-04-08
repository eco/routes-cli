/**
 * Mock SVM client factory for unit/integration tests.
 * Returns a stub Solana Connection that avoids live RPC connections.
 */

import type { SvmClientFactory } from '@/blockchain/svm/svm-client-factory';

export const mockSolanaConnection = {
  getBalance: jest.fn().mockResolvedValue(0),
  getLatestBlockhash: jest.fn().mockResolvedValue({
    blockhash: 'mockblockhash',
    lastValidBlockHeight: 1000,
  }),
  sendRawTransaction: jest.fn().mockResolvedValue('mocktxsignature'),
  confirmTransaction: jest.fn().mockResolvedValue({ value: { err: null } }),
  getAccountInfo: jest.fn().mockResolvedValue(null),
} as unknown as ReturnType<SvmClientFactory['createConnection']>;

export const createMockSvmClientFactory = (): SvmClientFactory => ({
  createConnection: jest.fn().mockReturnValue(mockSolanaConnection),
});
