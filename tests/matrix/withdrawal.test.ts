/**
 * Unit tests for the pure withdrawal-verification helpers: SVM per-owner delta
 * extraction, claimant selection (vault-excluded), and the always-on
 * amount/claimant assertion logic.
 */

import {
  assertWithdrawal,
  computeOwnerDeltas,
  isNativeReward,
  pickSvmClaimant,
  positiveBalanceDebit,
  SvmTokenBalanceEntry,
} from '@/matrix/matrix.util';

const REWARD_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const OTHER_MINT = '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH';
const VAULT = 'VaULtPDA1111111111111111111111111111111111';
const CLAIMANT = 'GWGh86ifwLYa22Rk8c4Rzmg8dTd9HAsykgeyXQS9porW';
const FUNDER = 'Funder11111111111111111111111111111111111';

function entry(mint: string, owner: string, amount: string): SvmTokenBalanceEntry {
  return { mint, owner, uiTokenAmount: { amount } };
}

describe('native withdrawal helpers', () => {
  it('recognizes the native sentinel for each supported VM', () => {
    expect(isNativeReward('EVM', '0x0000000000000000000000000000000000000000')).toBe(true);
    expect(isNativeReward('SVM', '11111111111111111111111111111111')).toBe(true);
  });

  it('does not treat wrapped native tokens as native rewards', () => {
    expect(isNativeReward('EVM', '0x4200000000000000000000000000000000000006')).toBe(false);
    expect(isNativeReward('SVM', 'So11111111111111111111111111111111111111112')).toBe(false);
  });

  it('returns an exact positive vault debit', () => {
    expect(positiveBalanceDebit(25n, 10n)).toBe(15n);
  });

  it('rejects unchanged or increasing vault balances', () => {
    expect(positiveBalanceDebit(10n, 10n)).toBeNull();
    expect(positiveBalanceDebit(10n, 25n)).toBeNull();
  });
});

describe('computeOwnerDeltas', () => {
  it('computes per-owner raw deltas for the reward mint only', () => {
    const pre = [entry(REWARD_MINT, VAULT, '100000'), entry(OTHER_MINT, CLAIMANT, '999')];
    const post = [
      entry(REWARD_MINT, VAULT, '0'),
      entry(REWARD_MINT, CLAIMANT, '100000'),
      entry(OTHER_MINT, CLAIMANT, '999'),
    ];
    const deltas = computeOwnerDeltas(REWARD_MINT, pre, post);
    const byOwner = Object.fromEntries(deltas.map(d => [d.owner, d.delta]));
    expect(byOwner[VAULT]).toBe(-100000n);
    expect(byOwner[CLAIMANT]).toBe(100000n);
  });

  it('uses raw uiTokenAmount.amount, not float uiAmount (no precision loss)', () => {
    // 6-decimal token: 1234567 raw = 1.234567; float would lose precision at scale.
    const pre = [entry(REWARD_MINT, VAULT, '1234567')];
    const post = [entry(REWARD_MINT, CLAIMANT, '1234567')];
    const deltas = computeOwnerDeltas(REWARD_MINT, pre, post);
    expect(deltas.find(d => d.owner === CLAIMANT)?.delta).toBe(1234567n);
  });

  it('ignores balances of other mints', () => {
    const deltas = computeOwnerDeltas(REWARD_MINT, [entry(OTHER_MINT, VAULT, '5')], []);
    expect(deltas).toHaveLength(0);
  });
});

describe('pickSvmClaimant', () => {
  it('picks the positive-delta owner that is not the vault', () => {
    const deltas = [
      { owner: VAULT, delta: -100000n },
      { owner: CLAIMANT, delta: 100000n },
    ];
    const picked = pickSvmClaimant(deltas, VAULT);
    expect(picked).toEqual({ claimant: CLAIMANT, withdrawnAmount: 100000n });
  });

  it('excludes the vault even if it has a positive delta', () => {
    const deltas = [
      { owner: VAULT, delta: 100000n },
      { owner: CLAIMANT, delta: 5n },
    ];
    const picked = pickSvmClaimant(deltas, VAULT);
    expect(picked?.claimant).toBe(CLAIMANT);
    expect(picked?.withdrawnAmount).toBe(5n);
  });

  it('returns null when no positive delta outside the vault', () => {
    expect(pickSvmClaimant([{ owner: VAULT, delta: 100000n }], VAULT)).toBeNull();
  });

  it('picks the largest positive delta when several owners gain', () => {
    const deltas = [
      { owner: 'ataRentPayer', delta: 2n },
      { owner: CLAIMANT, delta: 100000n },
    ];
    expect(pickSvmClaimant(deltas, VAULT)?.claimant).toBe(CLAIMANT);
  });
});

describe('assertWithdrawal', () => {
  const base = {
    chainType: 'SVM',
    withdrawnAmount: 100000n,
    expectedAmount: 100000n,
    claimant: CLAIMANT,
    funder: FUNDER,
  };

  it('passes when amount matches, claimant != funder, and expectedClaimant matches', () => {
    expect(assertWithdrawal({ ...base, expectedClaimant: CLAIMANT }).ok).toBe(true);
  });

  it('fails on amount mismatch with a WITHDRAWAL_MISMATCH phase', () => {
    const r = assertWithdrawal({ ...base, withdrawnAmount: 99999n });
    expect(r.ok).toBe(false);
    expect(r.failPhase).toBe('WITHDRAWAL_MISMATCH');
    expect(r.error).toContain('99999');
  });

  it('fails when the claimant equals the funder (reward returned to funder)', () => {
    const r = assertWithdrawal({ ...base, claimant: FUNDER });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('funder');
  });

  it('fails when claimant != expectedClaimant (SVM exact base58)', () => {
    const r = assertWithdrawal({
      ...base,
      expectedClaimant: 'SomeOtherClaimant11111111111111111111111',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('expectedClaimant');
  });

  it('matches EVM claimant case-insensitively', () => {
    const r = assertWithdrawal({
      chainType: 'EVM',
      withdrawnAmount: 1200000n,
      expectedAmount: 1200000n,
      claimant: '0x022831e28085b0e64f8feea47c6d10675d09d521',
      funder: '0xFUNDER00000000000000000000000000000000FF',
      expectedClaimant: '0x022831E28085b0E64f8feea47C6D10675d09D521',
    });
    expect(r.ok).toBe(true);
  });

  it('passes without expectedClaimant as long as claimant != funder and amount matches', () => {
    expect(assertWithdrawal(base).ok).toBe(true);
  });
});
