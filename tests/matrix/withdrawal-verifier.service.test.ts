import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import {
  createPublicClient,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
} from 'viem';

import { calculateVaultPDA } from '@/blockchain/svm/pda-manager';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { portalAbi } from '@/commons/abis/portal.abi';
import { WithdrawalVerifierService } from '@/matrix/withdrawal-verifier.service';
import { ChainConfig, ChainType, EvmAddress } from '@/shared/types';

jest.mock('viem', () => {
  const actual = jest.requireActual<typeof import('viem')>('viem');
  return { ...actual, createPublicClient: jest.fn() };
});

const INTENT_HASH = `0x${'11'.repeat(32)}` as const;
const OTHER_INTENT_HASH = `0x${'22'.repeat(32)}` as const;
const SETTLEMENT_TX = `0x${'33'.repeat(32)}` as const;
const PUBLISH_TX = `0x${'44'.repeat(32)}` as const;
const PORTAL = '0x00000000000000000000000000000000000000a1' as EvmAddress;
const CLAIMANT = '0x00000000000000000000000000000000000000b2' as EvmAddress;
const CREATOR = '0x00000000000000000000000000000000000000c3' as EvmAddress;
const PROVER = '0x00000000000000000000000000000000000000d4' as EvmAddress;
const VAULT = '0x00000000000000000000000000000000000000e5' as EvmAddress;
const EVM_NATIVE = '0x0000000000000000000000000000000000000000';
const ERC20_REWARD = '0x00000000000000000000000000000000000000f6' as EvmAddress;
const SVM_NATIVE = '11111111111111111111111111111111';
const SVM_PORTAL = new PublicKey('8H7qa6zZ1qpTxdSXRh6H619G5a99KJafKzDrkdgWb8mX');
const SVM_CLAIMANT = Keypair.fromSeed(new Uint8Array(32).fill(9)).publicKey;
const SVM_VAULT = calculateVaultPDA(INTENT_HASH, SVM_PORTAL);

const publishAbi = parseAbi([
  'function publishAndFund(uint64 destination, bytes route, (uint64 deadline, address creator, address prover, uint256 nativeAmount, (address token, uint256 amount)[] tokens) reward, bool allowPartial) payable returns (bytes32 intentHash, address vault)',
]);

const reward = {
  deadline: 2_000_000_000n,
  creator: CREATOR,
  prover: PROVER,
  nativeAmount: 600_000_000_000_000n,
  tokens: [],
};

const publishInput = encodeFunctionData({
  abi: publishAbi,
  functionName: 'publishAndFund',
  args: [8453n, '0x1234', reward, false],
});

const baseChain: ChainConfig = {
  id: 8453n,
  name: 'Base',
  env: 'production',
  type: ChainType.EVM,
  rpcUrl: 'https://base.invalid',
  portalAddress: AddressNormalizer.normalizeEvm(PORTAL),
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

const solanaChain: ChainConfig = {
  id: 1399811149n,
  name: 'Solana',
  env: 'production',
  type: ChainType.SVM,
  rpcUrl: 'https://solana.invalid',
  portalAddress: AddressNormalizer.normalizeSvm(SVM_PORTAL),
  nativeCurrency: { name: 'Solana', symbol: 'SOL', decimals: 9 },
};

type MockViemClient = Record<string, jest.Mock>;

interface SvmTransactionFixture {
  meta: {
    preBalances: number[];
    postBalances: number[];
    preTokenBalances: never[];
    postTokenBalances: never[];
    loadedAddresses: { writable: never[]; readonly: never[] };
    logMessages: string[];
  };
  transaction: { message: { getAccountKeys: jest.Mock } };
}

function withdrawnLog(intentHash = INTENT_HASH): Record<string, unknown> {
  return {
    address: PORTAL,
    data: encodeAbiParameters([{ type: 'bytes32' }], [intentHash]),
    topics: encodeEventTopics({
      abi: portalAbi,
      eventName: 'IntentWithdrawn',
      args: { claimant: CLAIMANT },
    }),
  };
}

function makeClient(overrides: Record<string, unknown> = {}): MockViemClient {
  return {
    getTransactionReceipt: jest.fn().mockResolvedValue({
      blockNumber: 100n,
      logs: [withdrawnLog()],
    }),
    getTransaction: jest.fn().mockResolvedValue({ input: publishInput, to: PORTAL }),
    readContract: jest.fn().mockResolvedValue(VAULT),
    getBalance: jest.fn().mockResolvedValueOnce(600_000_000_000_000n).mockResolvedValueOnce(0n),
    ...overrides,
  } as MockViemClient;
}

function svmWithdrawnLogs(intentHash = INTENT_HASH): string[] {
  const eventBytes = Buffer.concat([
    Buffer.from([28, 22, 16, 41, 101, 254, 123, 228]),
    Buffer.from(intentHash.slice(2), 'hex'),
    SVM_CLAIMANT.toBuffer(),
  ]);
  return [
    `Program ${SVM_PORTAL.toBase58()} invoke [1]`,
    `Program data: ${eventBytes.toString('base64')}`,
    `Program ${SVM_PORTAL.toBase58()} success`,
  ];
}

function svmTransaction(overrides: Record<string, unknown> = {}): SvmTransactionFixture {
  const accountKeys = [SVM_VAULT, SVM_CLAIMANT];
  return {
    meta: {
      preBalances: [8_000_000, 0],
      postBalances: [0, 8_000_000],
      preTokenBalances: [],
      postTokenBalances: [],
      loadedAddresses: { writable: [], readonly: [] },
      logMessages: svmWithdrawnLogs(),
    },
    transaction: {
      message: {
        getAccountKeys: jest.fn().mockReturnValue({
          length: accountKeys.length,
          get: (index: number) => accountKeys[index],
        }),
      },
    },
    ...overrides,
  } as SvmTransactionFixture;
}

describe('WithdrawalVerifierService EVM native rewards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies the matching withdrawal claimant and exact intent-vault debit', async () => {
    const client = makeClient();
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    const facts = await service.verify(
      baseChain,
      INTENT_HASH,
      SETTLEMENT_TX,
      EVM_NATIVE,
      PUBLISH_TX
    );

    expect(facts).toEqual({
      withdrawnAmount: 600_000_000_000_000n,
      claimant: CLAIMANT,
    });
    expect(client.getBalance).toHaveBeenNthCalledWith(1, {
      address: VAULT,
      blockNumber: 99n,
    });
    expect(client.getBalance).toHaveBeenNthCalledWith(2, {
      address: VAULT,
      blockNumber: 100n,
    });
  });

  it('rejects a withdrawal event for a different intent', async () => {
    const client = makeClient({
      getTransactionReceipt: jest.fn().mockResolvedValue({
        blockNumber: 100n,
        logs: [withdrawnLog(OTHER_INTENT_HASH)],
      }),
    });
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, EVM_NATIVE, PUBLISH_TX)
    ).resolves.toEqual({ error: `no matching IntentWithdrawn event for ${INTENT_HASH}` });
  });

  it('rejects a native vault that did not decrease', async () => {
    const client = makeClient({
      getBalance: jest.fn().mockResolvedValueOnce(10n).mockResolvedValueOnce(10n),
    });
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, EVM_NATIVE, PUBLISH_TX)
    ).resolves.toEqual({ error: `native intent vault ${VAULT} did not decrease` });
  });

  it('keeps using ERC-20 Transfer evidence for non-native rewards', async () => {
    const client = makeClient({
      getTransactionReceipt: jest.fn().mockResolvedValue({
        blockNumber: 100n,
        logs: [
          withdrawnLog(),
          {
            address: ERC20_REWARD,
            data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
            topics: encodeEventTopics({
              abi: erc20Abi,
              eventName: 'Transfer',
              args: { from: VAULT, to: CLAIMANT },
            }),
          },
        ],
      }),
    });
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({ getUrl: jest.fn() } as never);

    await expect(
      service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, ERC20_REWARD)
    ).resolves.toEqual({ withdrawnAmount: 1_000_000n, claimant: CLAIMANT });
    expect(client.getTransaction).not.toHaveBeenCalled();
    expect(client.getBalance).not.toHaveBeenCalled();
  });

  it('rejects an ERC-20 transfer without the matching child withdrawal event', async () => {
    const client = makeClient({
      getTransactionReceipt: jest.fn().mockResolvedValue({
        blockNumber: 100n,
        logs: [
          withdrawnLog(OTHER_INTENT_HASH),
          {
            address: ERC20_REWARD,
            data: encodeAbiParameters([{ type: 'uint256' }], [1_000_000n]),
            topics: encodeEventTopics({
              abi: erc20Abi,
              eventName: 'Transfer',
              args: { from: VAULT, to: CLAIMANT },
            }),
          },
        ],
      }),
    });
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({ getUrl: jest.fn() } as never);

    await expect(
      service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, ERC20_REWARD)
    ).resolves.toEqual({ error: `no matching IntentWithdrawn event for ${INTENT_HASH}` });
  });
});

describe('WithdrawalVerifierService SVM native rewards', () => {
  beforeEach(() => jest.restoreAllMocks());

  it('verifies the matching withdrawal claimant and exact vault lamport debit', async () => {
    jest.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(svmTransaction() as never);
    jest.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({} as never);
    const service = new WithdrawalVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(solanaChain, INTENT_HASH, 'svm-signature', SVM_NATIVE)
    ).resolves.toEqual({
      withdrawnAmount: 8_000_000n,
      claimant: SVM_CLAIMANT.toBase58(),
      claimedMarkerPresent: true,
    });
  });

  it('rejects a withdrawal event for a different SVM intent', async () => {
    const tx = svmTransaction();
    tx.meta.logMessages = svmWithdrawnLogs(OTHER_INTENT_HASH);
    jest.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(tx as never);
    jest.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({} as never);
    const service = new WithdrawalVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(solanaChain, INTENT_HASH, 'svm-signature', SVM_NATIVE)
    ).resolves.toEqual({ error: `no matching IntentWithdrawn event for ${INTENT_HASH}` });
  });

  it('rejects a native SVM settlement whose vault is absent from the account keys', async () => {
    const tx = svmTransaction();
    tx.transaction.message.getAccountKeys.mockReturnValue({
      length: 1,
      get: () => SVM_CLAIMANT,
    });
    jest.spyOn(Connection.prototype, 'getTransaction').mockResolvedValue(tx as never);
    jest.spyOn(Connection.prototype, 'getAccountInfo').mockResolvedValue({} as never);
    const service = new WithdrawalVerifierService({
      getUrl: jest.fn().mockReturnValue(solanaChain.rpcUrl),
    } as never);

    await expect(
      service.verify(solanaChain, INTENT_HASH, 'svm-signature', SVM_NATIVE)
    ).resolves.toEqual({
      error: `native intent vault ${SVM_VAULT.toBase58()} not in settlement tx`,
    });
  });
});
