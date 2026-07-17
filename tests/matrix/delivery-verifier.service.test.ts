import { Connection, Keypair, PublicKey } from '@solana/web3.js';

import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { DeliveryVerifierService } from '@/matrix/delivery-verifier.service';
import { ChainConfig, ChainType } from '@/shared/types';

const RECIPIENT = Keypair.fromSeed(new Uint8Array(32).fill(3)).publicKey;
const OTHER = Keypair.fromSeed(new Uint8Array(32).fill(4)).publicKey;
const SVM_NATIVE = '11111111111111111111111111111111';
const PORTAL = new PublicKey('8H7qa6zZ1qpTxdSXRh6H619G5a99KJafKzDrkdgWb8mX');

const solanaChain: ChainConfig = {
  id: 1399811149n,
  name: 'Solana',
  env: 'production',
  type: ChainType.SVM,
  rpcUrl: 'https://solana.invalid',
  portalAddress: AddressNormalizer.normalizeSvm(PORTAL),
  nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
};

function svmTransaction(): {
  meta: {
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: never[];
    postTokenBalances: never[];
    loadedAddresses: { writable: never[]; readonly: never[] };
  };
  transaction: { message: { getAccountKeys: jest.Mock } };
} {
  const accountKeys = [OTHER, RECIPIENT];
  return {
    meta: {
      preBalances: [10_000_000, 5_000_000],
      postBalances: [9_995_000, 13_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
      loadedAddresses: { writable: [], readonly: [] },
    },
    transaction: {
      message: {
        getAccountKeys: jest.fn().mockReturnValue({
          length: accountKeys.length,
          get: (index: number) => accountKeys[index],
        }),
      },
    },
  };
}

describe('DeliveryVerifierService SVM destination', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('verifies the exact native SOL increase received by the configured recipient', async () => {
    jest.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(svmTransaction() as never);
    const service = new DeliveryVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(solanaChain, 'svm-fulfillment', SVM_NATIVE, RECIPIENT.toBase58())
    ).resolves.toEqual({
      deliveredAmount: 8_000_000n,
      recipient: RECIPIENT.toBase58(),
    });
  });

  it('rejects fulfillment transactions that do not credit the recipient', async () => {
    const tx = svmTransaction();
    tx.meta.postBalances[1] = tx.meta.preBalances[1];
    jest.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(tx as never);
    const service = new DeliveryVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(solanaChain, 'svm-fulfillment', SVM_NATIVE, RECIPIENT.toBase58())
    ).resolves.toEqual({
      error: `recipient ${RECIPIENT.toBase58()} native balance did not increase`,
    });
  });
});
