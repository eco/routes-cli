import { mkdir, writeFile } from 'node:fs/promises';

import { Keypair } from '@solana/web3.js';
import { privateKeyToAccount } from 'viem/accounts';

import { MatrixService } from '@/matrix/matrix.service';
import { QuoteHttpError } from '@/quote/quote.service';
import { ChainType } from '@/shared/types';

jest.mock('node:fs/promises', () => ({ mkdir: jest.fn(), writeFile: jest.fn() }));

const EVM_ACTOR = '0x000000000000000000000000000000000000dEaD';
const SVM_ACTOR = '3vvcFp6rUuTrrYK7SSqQKeYYiwvZXWmMnmgLfXDKgAu6';
const EVM_KEY = `0x${'11'.repeat(32)}`;
const EVM_ADDRESS = privateKeyToAccount(EVM_KEY as `0x${string}`).address;
const INTENT_HASH = `0x${'22'.repeat(32)}`;
const SVM_KEYPAIR = Keypair.fromSeed(new Uint8Array(32).fill(7));
const SVM_KEY = JSON.stringify(Array.from(SVM_KEYPAIR.secretKey));
const SVM_ADDRESS = SVM_KEYPAIR.publicKey.toBase58();

function makeService(
  getQuote: jest.Mock,
  keys: Partial<Record<ChainType, string>> = {}
): {
  service: MatrixService;
  publisherFactory: { create: jest.Mock };
  statusService: { getStatus: jest.Mock };
  withdrawalVerifier: { verify: jest.Mock };
  deliveryVerifier: { verify: jest.Mock };
  yellowLifecycle: { waitForDeliveredChild: jest.Mock; getSnapshot: jest.Mock };
  normalizer: { denormalize: jest.Mock };
} {
  const chainsById = new Map([
    [8453n, { id: 8453n, name: 'Base', type: ChainType.EVM }],
    [42161n, { id: 42161n, name: 'Arbitrum', type: ChainType.EVM }],
    [1399811149n, { id: 1399811149n, name: 'Solana', type: ChainType.SVM }],
  ]);
  const chains = {
    findChainById: jest.fn((id: bigint) => chainsById.get(id)),
    getChainById: jest.fn((id: bigint) => chainsById.get(id)),
  };
  const config = {
    getKeyForChainType: jest.fn((type: ChainType) => keys[type]),
  };
  const publisherFactory = { create: jest.fn() };
  const statusService = { getStatus: jest.fn() };
  const withdrawalVerifier = { verify: jest.fn() };
  const deliveryVerifier = { verify: jest.fn() };
  const yellowLifecycle = { waitForDeliveredChild: jest.fn(), getSnapshot: jest.fn() };
  const normalizer = { denormalize: jest.fn(value => value) };
  const display = { log: jest.fn() };
  const service = new MatrixService(
    chains as never,
    config as never,
    normalizer as never,
    publisherFactory as never,
    { getQuote } as never,
    {} as never,
    statusService as never,
    {} as never,
    withdrawalVerifier as never,
    deliveryVerifier as never,
    yellowLifecycle as never,
    display as never
  );
  return {
    service,
    publisherFactory,
    statusService,
    withdrawalVerifier,
    deliveryVerifier,
    yellowLifecycle,
    normalizer,
  };
}

describe('MatrixService quote-only mode', () => {
  beforeEach(() => jest.clearAllMocks());

  it('quotes a cross-VM route with public actors and never publishes or polls', async () => {
    const getQuote = jest.fn().mockResolvedValue({
      encodedRoute: '0x01',
      sourcePortal: '0x0000000000000000000000000000000000000001',
      prover: '0x0000000000000000000000000000000000000002',
      deadline: 1,
      destinationAmount: '100',
      destinationPortalAddress: '11111111111111111111111111111111',
      receivedAt: 1,
      elapsedMs: 42,
      quoteId: 'quote-1',
      solverId: 'yellow',
    });
    const { service, publisherFactory, statusService } = makeService(getQuote);

    const report = await service.run({
      configPath: 'tests/fixtures/matrix-a2a-quote.json',
      quoteOnly: true,
    });

    expect(getQuote).toHaveBeenCalledWith(
      expect.objectContaining({ funder: EVM_ACTOR, recipient: SVM_ACTOR })
    );
    expect(publisherFactory.create).not.toHaveBeenCalled();
    expect(statusService.getStatus).not.toHaveBeenCalled();
    expect(report.rows[0]).toMatchObject({
      id: 'SS-2',
      phase: 'QUOTED',
      destinationChainId: 1399811149,
      quoteLatencyMs: 42,
      quoteId: 'quote-1',
      solverId: 'yellow',
    });
    expect(mkdir).toHaveBeenCalled();
    expect(writeFile).toHaveBeenCalled();
  });

  it('persists the direct solver HTTP message on quote failure', async () => {
    const getQuote = jest
      .fn()
      .mockRejectedValue(
        new QuoteHttpError(
          400,
          { message: 'Source-swap routes from this chain are temporarily unavailable.' },
          19
        )
      );
    const { service } = makeService(getQuote);

    const report = await service.run({
      configPath: 'tests/fixtures/matrix-a2a-quote.json',
      quoteOnly: true,
    });

    expect(report.rows[0]).toMatchObject({
      phase: 'QUOTE_FAILED',
      quoteHttpStatus: 400,
      quoteLatencyMs: 19,
      quoteResponseBody: {
        message: 'Source-swap routes from this chain are temporarily unavailable.',
      },
    });
  });
});

describe('MatrixService settlement recipients', () => {
  beforeEach(() => jest.clearAllMocks());

  it('derives each recipient from the destination VM key', async () => {
    const getQuote = jest.fn().mockRejectedValue(new Error('stop after quote'));
    const { service } = makeService(getQuote, {
      [ChainType.EVM]: EVM_KEY,
      [ChainType.SVM]: SVM_KEY,
    });

    await service.run({
      configPath: 'tests/fixtures/matrix-a2a-settlement-recipients.json',
    });

    expect(getQuote).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        funder: EVM_ADDRESS,
        recipient: SVM_ADDRESS,
      })
    );
    expect(getQuote).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        funder: SVM_ADDRESS,
        recipient: EVM_ADDRESS,
      })
    );
    expect(getQuote).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        funder: EVM_ADDRESS,
        recipient: EVM_ADDRESS,
      })
    );
  });

  it('fails before quoting when the destination VM key is missing', async () => {
    const getQuote = jest.fn();
    const { service, publisherFactory } = makeService(getQuote, {
      [ChainType.EVM]: EVM_KEY,
    });

    const report = await service.run({
      configPath: 'tests/fixtures/matrix-a2a-quote.json',
    });

    expect(getQuote).not.toHaveBeenCalled();
    expect(publisherFactory.create).not.toHaveBeenCalled();
    expect(report.rows[0]).toMatchObject({
      phase: 'PUBLISH_FAILED',
      error: `No recipient key configured for ${ChainType.SVM}`,
    });
  });
});

describe('MatrixService withdrawal verification inputs', () => {
  it('passes the publish hash but does not treat a cross-chain source withdrawal as terminal', async () => {
    const { service, withdrawalVerifier } = makeService(jest.fn(), {
      [ChainType.EVM]: EVM_KEY,
    });
    withdrawalVerifier.verify.mockResolvedValue({
      withdrawnAmount: 600_000_000_000_000n,
      claimant: '0x00000000000000000000000000000000000000b2',
    });
    const pair = {
      id: 'native-evm',
      label: 'ETH Base -> USDC Arbitrum',
      sourceChainId: 8453,
      destinationChainId: 42161,
      inputToken: '0x0000000000000000000000000000000000000000',
      outputToken: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
      amount: '0.0006',
      inputDecimals: 18,
    };
    const row = {
      intentHash: INTENT_HASH,
      publishTxHash: '0xpublish',
      withdrawalVerified: false,
      sourceWithdrawalVerified: false,
    };
    const chain = {
      id: 8453n,
      type: ChainType.EVM,
    };
    const status = { fulfilled: true, fulfillmentTxHash: '0xsettlement' };

    await (
      service as unknown as {
        verifyWithdrawal: (...args: unknown[]) => Promise<void>;
      }
    ).verifyWithdrawal(pair, row, chain, status, {}, '[1/1]');

    expect(withdrawalVerifier.verify).toHaveBeenCalledWith(
      chain,
      INTENT_HASH,
      '0xsettlement',
      pair.inputToken,
      '0xpublish',
      600_000_000_000_000n
    );
    expect(row).toMatchObject({ withdrawalVerified: false });
  });

  it('stops polling when Yellow records a permanent parent source-leg failure', async () => {
    const { service, statusService, yellowLifecycle } = makeService(jest.fn());
    statusService.getStatus.mockResolvedValue({ fulfilled: false });
    yellowLifecycle.getSnapshot.mockResolvedValue({
      parent: {
        status: 'FAILED',
        lastError: {
          errorCode: 'EVM_REVERT_EMPTY',
          message: 'EVM transaction reverted without available revert data.',
        },
      },
    });

    const outcome = await (
      service as unknown as {
        pollUntilFulfilledOrFailed: (...args: unknown[]) => Promise<unknown>;
      }
    ).pollUntilFulfilledOrFailed(
      INTENT_HASH,
      'quote-failed-parent',
      { id: 8453n, type: ChainType.EVM },
      1,
      undefined,
      1
    );

    expect(outcome).toEqual({
      sourceFailure: 'EVM_REVERT_EMPTY: EVM transaction reverted without available revert data.',
    });
  });

  it('marks success only after the promoted child reward reaches the kernel', async () => {
    const { service, yellowLifecycle, withdrawalVerifier, normalizer } = makeService(jest.fn(), {
      [ChainType.EVM]: EVM_KEY,
    });
    const kernel = '0x00000000000000000000000000000000000000b2';
    const childIntentHash = `0x${'33'.repeat(32)}`;
    normalizer.denormalize.mockReturnValue('0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913');
    yellowLifecycle.getSnapshot.mockResolvedValue({
      quoteID: 'quote-reconcile',
      parentIntentHash: INTENT_HASH,
      promotedChild: {
        bucket: {
          index: 0,
          intentHash: childIntentHash,
          rewardAmount: '1000000',
          expectedDestinationOutput: '5000000',
        },
        intent: {
          intentHash: childIntentHash,
          reward: {
            nativeAmount: '0',
            tokens: [
              {
                token: `0x${'00'.repeat(12)}833589fcd6edb6e08f4c7c32d4f71b54bda02913`,
                amount: '1000000',
              },
            ],
          },
          fulfilledEvent: { txHash: 'svm-fulfillment' },
          provenEvent: { txHash: '0xproof' },
          withdrawnEvent: { txHash: '0xwithdrawal' },
        },
      },
    });
    withdrawalVerifier.verify.mockResolvedValue({
      withdrawnAmount: 1_000_000n,
      claimant: kernel,
    });

    const report = await service.reconcile('tests/fixtures/matrix-a2a-reconcile-report.json');

    expect(withdrawalVerifier.verify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 8453n, type: ChainType.EVM }),
      childIntentHash,
      '0xwithdrawal',
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      undefined,
      1_000_000n
    );
    expect(report.rows[0]).toMatchObject({
      phase: 'SUCCEEDED',
      childIntentHash,
      deliveryVerified: true,
      proven: true,
      withdrawn: true,
      withdrawalVerified: true,
      claimant: kernel,
      expectedClaimant: kernel,
    });
  });
});
