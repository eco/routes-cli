import type { V1StatusEntry } from '@eco-foundation/api-schemas/v1/types';

import { fromV1StatusEntries, StatusService } from '@/status/status.service';

const HASH = `0x${'ab'.repeat(32)}`;

function entry(overrides: Partial<V1StatusEntry>): V1StatusEntry {
  return {
    id: `intent:${HASH}`,
    type: 'intent',
    status: 'pending',
    updatedAt: 1_760_000_000,
    intentHashes: [HASH],
    ...overrides,
  };
}

describe('fromV1StatusEntries', () => {
  it.each(['filled', 'settled'])('treats %s as fulfilled and carries the destination tx', word => {
    const status = fromV1StatusEntries(
      [
        entry({
          status: word,
          destinationTx: { chainId: 5042, txHash: '0xdest', token: '0x36', amount: '1' },
        }),
      ],
      HASH
    );
    expect(status).toEqual({
      fulfilled: true,
      state: word,
      fulfillmentTxHash: '0xdest',
      timestamp: 1_760_000_000,
    });
  });

  it.each(['pending', 'refundable', 'refunded', 'expired', 'unknown', 'something-new'])(
    'treats %s as not fulfilled but keeps the word',
    word => {
      const status = fromV1StatusEntries([entry({ status: word })], HASH);
      expect(status.fulfilled).toBe(false);
      expect(status.state).toBe(word);
    }
  );

  it('prefers the entry that lists the hash and reports unknown when nothing matches', () => {
    const other = entry({ id: 'intent:0xother', intentHashes: ['0xother'], status: 'filled' });
    expect(fromV1StatusEntries([other, entry({ status: 'pending' })], HASH).state).toBe('pending');
    expect(fromV1StatusEntries([], HASH)).toEqual({ fulfilled: false, state: 'unknown' });
  });
});

describe('StatusService.getStatus', () => {
  const publisher = { getStatus: jest.fn().mockResolvedValue({ fulfilled: true }) };
  const publisherFactory = { create: jest.fn().mockReturnValue(publisher) };
  const ecoApi = { intentStatus: jest.fn().mockResolvedValue([entry({ status: 'filled' })]) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new StatusService(publisherFactory as any, ecoApi as any);
  const chain = { id: 5042n, name: 'Arc' } as never;

  beforeEach(() => jest.clearAllMocks());

  it('uses the gateway when no chain is given, forwarding the env', async () => {
    const status = await service.getStatus(HASH, undefined, { env: 'staging' });
    expect(ecoApi.intentStatus).toHaveBeenCalledWith({ intentHash: HASH }, { env: 'staging' });
    expect(publisherFactory.create).not.toHaveBeenCalled();
    expect(status.fulfilled).toBe(true);
  });

  it('keeps the on-chain lookup when a chain is given', async () => {
    await service.getStatus(HASH, chain);
    expect(publisherFactory.create).toHaveBeenCalledWith(chain);
    expect(publisher.getStatus).toHaveBeenCalledWith(HASH, chain);
    expect(ecoApi.intentStatus).not.toHaveBeenCalled();
  });
});
