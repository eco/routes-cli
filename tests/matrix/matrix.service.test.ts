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
  const display = { log: jest.fn() };
  const service = new MatrixService(
    chains as never,
    config as never,
    {} as never,
    publisherFactory as never,
    { getQuote } as never,
    {} as never,
    statusService as never,
    {} as never,
    {} as never,
    display as never
  );
  return { service, publisherFactory, statusService };
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
