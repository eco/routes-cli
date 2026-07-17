import { selectPromotedChild } from '@/matrix/yellow-lifecycle.service';

const CHILD_0 = `0x${'10'.repeat(32)}`;
const CHILD_1 = `0x${'20'.repeat(32)}`;

describe('selectPromotedChild', () => {
  const buckets = [
    { index: 0, intentHash: CHILD_0, rewardAmount: '100', expectedDestinationOutput: '80' },
    { index: 1, intentHash: CHILD_1, rewardAmount: '110', expectedDestinationOutput: '88' },
  ];

  it('returns the bucket child promoted by an EVM funded event', () => {
    const result = selectPromotedChild(buckets, [
      { intentHash: CHILD_0, status: 'CANDIDATE' },
      {
        intentHash: CHILD_1,
        status: 'FULFILLED',
        fundedEvent: { txHash: '0xfund' },
        fulfilledEvent: { txHash: '0xfulfill', chainId: '1399811149' },
      },
    ]);

    expect(result?.bucket).toEqual(buckets[1]);
    expect(result?.intent.intentHash).toBe(CHILD_1);
    expect(result?.intent.status).toBe('FULFILLED');
  });

  it('returns the bucket child promoted by an SVM selected event', () => {
    const result = selectPromotedChild(buckets, [
      {
        intentHash: CHILD_0,
        status: 'FUNDED',
        selectedEvent: { txHash: 'svm-fund', rewardAmount: '100' },
      },
      { intentHash: CHILD_1, status: 'CANDIDATE' },
    ]);

    expect(result?.intent.intentHash).toBe(CHILD_0);
    expect(result?.bucket.index).toBe(0);
  });

  it('returns null before any bucket is promoted', () => {
    expect(
      selectPromotedChild(buckets, [
        { intentHash: CHILD_0, status: 'CANDIDATE' },
        { intentHash: CHILD_1, status: 'CANDIDATE' },
      ])
    ).toBeNull();
  });
});
