import { parseAmount, parseDecimalsFlag } from '@/cli/utils/parse-amount';

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

describe('parseDecimalsFlag', () => {
  it('accepts valid integer decimals', () => {
    expect(parseDecimalsFlag('6', '--route-token-decimals')).toBe(6);
    expect(parseDecimalsFlag('0', '--route-token-decimals')).toBe(0);
    expect(parseDecimalsFlag('255', '--route-token-decimals')).toBe(255);
  });

  it('rejects non-numeric input, naming the flag', () => {
    expect(() => parseDecimalsFlag('abc', '--route-token-decimals')).toThrow(
      /--route-token-decimals/
    );
  });

  it('rejects negative values, naming the flag', () => {
    expect(() => parseDecimalsFlag('-1', '--reward-token-decimals')).toThrow(
      /--reward-token-decimals/
    );
  });

  it('rejects non-integer values, naming the flag', () => {
    expect(() => parseDecimalsFlag('3.5', '--route-token-decimals')).toThrow(
      /--route-token-decimals/
    );
  });

  it('rejects values above 255, naming the flag', () => {
    expect(() => parseDecimalsFlag('256', '--reward-token-decimals')).toThrow(
      /--reward-token-decimals/
    );
  });
});
