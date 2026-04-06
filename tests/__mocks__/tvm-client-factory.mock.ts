/**
 * Mock TVM client factory for unit/integration tests.
 * Returns a stub TronWeb instance that avoids live RPC connections.
 */

import type { TvmClientFactory } from '@/blockchain/tvm/tvm-client-factory';

export const mockTronWeb = {
  setPrivateKey: jest.fn(),
  address: {
    fromPrivateKey: jest.fn().mockReturnValue('TMockTronAddress123456789012345678'),
  },
  trx: {
    getBalance: jest.fn().mockResolvedValue(0),
    getTransactionInfo: jest.fn().mockResolvedValue(null),
  },
  contract: jest.fn().mockReturnValue({
    approve: jest.fn().mockReturnValue({ send: jest.fn().mockResolvedValue('mockapprovaltxid') }),
    balanceOf: jest.fn().mockReturnValue({ call: jest.fn().mockResolvedValue(0n) }),
    publishAndFund: jest.fn().mockReturnValue({
      send: jest.fn().mockResolvedValue('mockpublishtxid'),
    }),
  }),
} as unknown as ReturnType<TvmClientFactory['createClient']>;

export const createMockTvmClientFactory = (): TvmClientFactory => ({
  createClient: jest.fn().mockReturnValue(mockTronWeb),
});
