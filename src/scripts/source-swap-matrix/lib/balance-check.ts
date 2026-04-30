import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';
import Table from 'cli-table3';
import pc from 'picocolors';
import { type Address, type PublicClient, formatUnits, parseAbi } from 'viem';

import type { Scenario } from './scenarios';

const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';
// Native SOL sentinel (System Program ID, 32 zero bytes). When the matrix
// uses this as the source token, balance is read via getBalance, not via an
// SPL ATA lookup.
const SOL_NATIVE = '11111111111111111111111111111111';

export interface BalanceCheckInput {
  scenarios: readonly Scenario[];
  evmAddress: Address;
  svmAddress: string;
  evmPublicByChain: Map<number, PublicClient>;
  svmConnection: Connection;
}

export interface BalanceCheckRow {
  scenarioIds: string[];
  vm: 'evm' | 'svm';
  chain: number;
  chainLabel: string;
  token: string;
  symbol: string;
  decimals: number;
  required: bigint;
  have: bigint;
  /** floor(have / required) — how many full matrix runs this row can cover. */
  runsRemaining: number;
  status: 'ok' | 'insufficient';
}

interface GroupKey {
  vm: 'evm' | 'svm';
  chain: number;
  token: string;
  symbol: string;
  decimals: number;
}

export async function checkBalances(input: BalanceCheckInput): Promise<BalanceCheckRow[]> {
  const groups = new Map<string, { key: GroupKey; ids: string[]; required: bigint }>();
  for (const s of input.scenarios) {
    const key: GroupKey = {
      vm: s.srcVm,
      chain: s.srcChain,
      token: s.srcToken,
      symbol: s.srcSymbol,
      decimals: s.srcDecimals,
    };
    const id = `${key.vm}:${key.chain}:${key.token.toLowerCase()}`;
    const existing = groups.get(id);
    if (existing) {
      existing.ids.push(s.id);
      existing.required += s.defaultAmount;
    } else {
      groups.set(id, { key, ids: [s.id], required: s.defaultAmount });
    }
  }

  const rows = await Promise.all(
    Array.from(groups.values()).map(async ({ key, ids, required }) => {
      const have =
        key.vm === 'evm'
          ? await readEvmBalance(
              input.evmPublicByChain.get(key.chain)!,
              key.token,
              input.evmAddress
            )
          : await readSvmBalance(input.svmConnection, new PublicKey(input.svmAddress), key.token);
      const runsRemaining = required > 0n ? Number(have / required) : 0;
      const row: BalanceCheckRow = {
        scenarioIds: ids,
        vm: key.vm,
        chain: key.chain,
        chainLabel: chainLabel(key.chain),
        token: key.token,
        symbol: key.symbol,
        decimals: key.decimals,
        required,
        have,
        runsRemaining,
        status: have >= required ? 'ok' : 'insufficient',
      };
      return row;
    })
  );
  return rows;
}

export function renderBalanceCheck(rows: BalanceCheckRow[]): string {
  const table = new Table({
    head: ['Scenarios', 'Chain', 'Token', 'Required', 'Have', 'Runs left', 'Status'],
  });
  for (const r of rows) {
    const required = formatUnits(r.required, r.decimals);
    const have = formatUnits(r.have, r.decimals);
    const runsLeft = r.runsRemaining >= 1000 ? '999+' : r.runsRemaining.toString();
    const status = r.status === 'ok' ? pc.green('✓') : pc.red('✗');
    table.push([r.scenarioIds.join(','), r.chainLabel, r.symbol, required, have, runsLeft, status]);
  }
  const minRuns = rows.length === 0 ? 0 : Math.min(...rows.map(r => r.runsRemaining));
  const summary = pc.dim(
    `↳ ${minRuns} full matrix run(s) before topping up (bound by the lowest 'Runs left' row).`
  );
  return [table.toString(), summary].join('\n');
}

async function readEvmBalance(
  client: PublicClient,
  token: string,
  owner: Address
): Promise<bigint> {
  if (token.toLowerCase() === NATIVE_ADDRESS) {
    return client.getBalance({ address: owner });
  }
  return client.readContract({
    address: token as Address,
    abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
    functionName: 'balanceOf',
    args: [owner],
  });
}

async function readSvmBalance(
  connection: Connection,
  owner: PublicKey,
  mint: string
): Promise<bigint> {
  if (mint === SOL_NATIVE) {
    return BigInt(await connection.getBalance(owner));
  }
  const mintKey = new PublicKey(mint);
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const ata = getAssociatedTokenAddressSync(mintKey, owner, true, programId);
    const info = await connection.getAccountInfo(ata);
    if (info && info.data.length >= 72) {
      return info.data.readBigUInt64LE(64);
    }
  }
  return 0n;
}

function chainLabel(chainId: number): string {
  if (chainId === 1399811149) return 'sol';
  return chainId.toString();
}
