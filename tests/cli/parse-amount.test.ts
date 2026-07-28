import { parseAmount } from '@/cli/utils/parse-amount';

describe('parseAmount', () => {
  it('converts human units using token decimals', () => {
    expect(parseAmount('10.5', 6, '--amount')).toBe(10_500_000n);
    expect(parseAmount('1', 18, '--amount')).toBe(1_000_000_000_000_000_000n);
  });

  it('rejects zero, negatives, and non-numbers, naming the flag', () => {
    expect(() => parseAmount('0', 6, '--amount')).toThrow(/--amount.*positive/);
    expect(() => parseAmount('-1', 6, '--amount')).toThrow(/--amount/);
    expect(() => parseAmount('abc', 6, '--route-amount')).toThrow(/--route-amount/);
  });

  it('rejects more decimal places than the token supports', () => {
    expect(() => parseAmount('0.0000001', 6, '--amount')).toThrow(/decimal places/);
  });
});
