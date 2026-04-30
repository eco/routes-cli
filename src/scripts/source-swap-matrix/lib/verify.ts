import { type Address, type Hex, type PublicClient, parseEventLogs } from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';

export interface PollDestInput {
  readBalance: () => Promise<bigint>;
  balanceBefore: bigint;
  intervalMs: number;
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  /** Called when a single readBalance() iteration throws. The poll continues
   * to the next iteration; cap is enforced via maxConsecutiveErrors. */
  onReadError?: (err: unknown, consecutive: number) => void;
  /** Throw if readBalance() fails this many times in a row (default 5). */
  maxConsecutiveErrors?: number;
}

export type PollDestResult =
  | { timedOut: false; delta: bigint; finalBalance: bigint }
  | { timedOut: true };

export async function pollDestBalance(input: PollDestInput): Promise<PollDestResult> {
  const {
    readBalance,
    balanceBefore,
    intervalMs,
    timeoutMs,
    sleep,
    now,
    onReadError,
    maxConsecutiveErrors = 5,
  } = input;
  const start = now();
  let consecutiveErrors = 0;
  while (now() - start < timeoutMs) {
    let balance: bigint;
    try {
      balance = await readBalance();
      consecutiveErrors = 0;
    } catch (err) {
      consecutiveErrors++;
      onReadError?.(err, consecutiveErrors);
      if (consecutiveErrors >= maxConsecutiveErrors) throw err;
      await sleep(intervalMs);
      continue;
    }
    const delta = balance - balanceBefore;
    if (delta > 0n) {
      return { timedOut: false, delta, finalBalance: balance };
    }
    await sleep(intervalMs);
  }
  return { timedOut: true };
}

export interface ScanEvmPortalInput {
  publicClient: PublicClient;
  portal: Address;
  intentHash: Hex;
  fromBlock: bigint;
  toBlock?: bigint;
}

export interface PortalScanResult {
  fulfilledTx?: Hex;
  refundedTx?: Hex;
}

export async function scanSourcePortalEvm(input: ScanEvmPortalInput): Promise<PortalScanResult> {
  const { publicClient, portal, intentHash, fromBlock, toBlock } = input;
  const logs = await publicClient.getLogs({
    address: portal,
    fromBlock,
    toBlock,
  });
  const parsed = parseEventLogs({ abi: portalAbi, logs });
  const out: PortalScanResult = {};
  for (const log of parsed) {
    const args = log.args as { intentHash?: Hex } | undefined;
    if (!args?.intentHash) continue;
    if (args.intentHash.toLowerCase() !== intentHash.toLowerCase()) continue;
    if (log.eventName === 'IntentFulfilled') out.fulfilledTx = log.transactionHash as Hex;
    if (log.eventName === 'IntentRefunded') out.refundedTx = log.transactionHash as Hex;
  }
  return out;
}
