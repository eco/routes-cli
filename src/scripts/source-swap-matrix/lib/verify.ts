import { type Address, type Hex, type PublicClient, parseEventLogs } from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';

export interface PollDestInput {
  readBalance: () => Promise<bigint>;
  balanceBefore: bigint;
  intervalMs: number;
  timeoutMs: number;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
}

export type PollDestResult =
  | { timedOut: false; delta: bigint; finalBalance: bigint }
  | { timedOut: true };

export async function pollDestBalance(input: PollDestInput): Promise<PollDestResult> {
  const { readBalance, balanceBefore, intervalMs, timeoutMs, sleep, now } = input;
  const start = now();
  while (now() - start < timeoutMs) {
    const balance = await readBalance();
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
