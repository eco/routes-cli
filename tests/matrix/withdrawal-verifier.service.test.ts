import {
  createPublicClient,
  erc20Abi,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  parseAbi,
} from 'viem';

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

function withdrawnLog(intentHash = INTENT_HASH) {
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

function makeClient(overrides: Record<string, unknown> = {}) {
  return {
    getTransactionReceipt: jest.fn().mockResolvedValue({
      blockNumber: 100n,
      logs: [withdrawnLog()],
    }),
    getTransaction: jest.fn().mockResolvedValue({ input: publishInput, to: PORTAL }),
    readContract: jest.fn().mockResolvedValue(VAULT),
    getBalance: jest
      .fn()
      .mockResolvedValueOnce(600_000_000_000_000n)
      .mockResolvedValueOnce(0n),
    ...overrides,
  };
}

describe('WithdrawalVerifierService EVM native rewards', () => {
  beforeEach(() => jest.clearAllMocks());

  it('verifies the matching withdrawal claimant and exact intent-vault debit', async () => {
    const client = makeClient();
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({ getUrl: jest.fn() } as never);

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
    const service = new WithdrawalVerifierService({ getUrl: jest.fn() } as never);

    await expect(
      service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, EVM_NATIVE, PUBLISH_TX)
    ).resolves.toEqual({ error: `no matching IntentWithdrawn event for ${INTENT_HASH}` });
  });

  it('rejects a native vault that did not decrease', async () => {
    const client = makeClient({
      getBalance: jest.fn().mockResolvedValueOnce(10n).mockResolvedValueOnce(10n),
    });
    jest.mocked(createPublicClient).mockReturnValue(client as never);
    const service = new WithdrawalVerifierService({ getUrl: jest.fn() } as never);

    await expect(
      service.verify(baseChain, INTENT_HASH, SETTLEMENT_TX, EVM_NATIVE, PUBLISH_TX)
    ).resolves.toEqual({ error: `native intent vault ${VAULT} did not decrease` });
  });

  it('keeps using ERC-20 Transfer evidence for non-native rewards', async () => {
    const client = makeClient({
      getTransactionReceipt: jest.fn().mockResolvedValue({
        blockNumber: 100n,
        logs: [
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
});
