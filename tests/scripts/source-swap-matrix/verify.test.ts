/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/explicit-function-return-type */
import { pollDestBalance } from '@/scripts/source-swap-matrix/lib/verify';

describe('pollDestBalance', () => {
  it('returns delta as soon as balance increases', async () => {
    const balances = [100n, 100n, 250n];
    let i = 0;
    const readBalance = jest.fn(async () => balances[i++]);
    const sleep = jest.fn(async () => undefined);
    const nowMs = 0;
    const now = () => nowMs;
    const out = await pollDestBalance({
      readBalance,
      balanceBefore: 100n,
      intervalMs: 10,
      timeoutMs: 1000,
      sleep,
      now,
    });
    expect(out).toEqual({ timedOut: false, delta: 150n, finalBalance: 250n });
    expect(readBalance).toHaveBeenCalledTimes(3);
  });

  it('returns timedOut=true when balance never moves', async () => {
    const readBalance = jest.fn(async () => 100n);
    const sleep = jest.fn(async () => undefined);
    const times = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100];
    let i = 0;
    const now = () => times[Math.min(i++, times.length - 1)];
    const out = await pollDestBalance({
      readBalance,
      balanceBefore: 100n,
      intervalMs: 100,
      timeoutMs: 500,
      sleep,
      now,
    });
    expect(out.timedOut).toBe(true);
  });
});
