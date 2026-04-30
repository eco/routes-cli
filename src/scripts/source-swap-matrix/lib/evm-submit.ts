import {
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  parseAbi,
  parseEventLogs,
} from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';

import type { QuoteEnvelope } from './quote';

const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000' as const;

export interface EvmSubmitInput {
  publicClient: PublicClient;
  walletClient: WalletClient;
  quote: QuoteEnvelope;
  sourceChain: number;
  sourceToken: Address;
  sourceAmount: bigint;
  funder: Address;
}

export interface EvmSubmitResult {
  publishTxHash: Hex;
  intentHash: Hex;
  publishBlock: bigint;
  portal: Address;
}

export async function ensureErc20Approval(input: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  token: Address;
  owner: Address;
  spender: Address;
  required: bigint;
}): Promise<void> {
  const { publicClient, walletClient, token, owner, spender, required } = input;
  const allowance = await publicClient.readContract({
    address: token,
    abi: parseAbi(['function allowance(address,address) view returns (uint256)']),
    functionName: 'allowance',
    args: [owner, spender],
  });
  if (allowance >= required) return;

  const tx = await walletClient.writeContract({
    address: token,
    abi: parseAbi(['function approve(address,uint256) returns (bool)']),
    functionName: 'approve',
    args: [spender, required],
    account: walletClient.account!,
    chain: walletClient.chain,
  });
  await publicClient.waitForTransactionReceipt({ hash: tx });
}

export async function submitEvm(input: EvmSubmitInput): Promise<EvmSubmitResult> {
  const { publicClient, walletClient, quote, sourceChain, sourceToken, sourceAmount, funder } =
    input;
  const quoteResponse = quote.quoteResponses[0];
  const portal = quote.contracts.sourcePortal as Address;
  const isNative = sourceToken.toLowerCase() === NATIVE_ADDRESS;

  if (isNative) {
    const ethBal = await publicClient.getBalance({ address: funder });
    if (ethBal < sourceAmount) {
      throw new Error(`evm-balance-insufficient: native need=${sourceAmount} have=${ethBal}`);
    }
  } else {
    const balance = await publicClient.readContract({
      address: sourceToken,
      abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
      functionName: 'balanceOf',
      args: [funder],
    });
    if (balance < sourceAmount) {
      throw new Error(`evm-balance-insufficient: erc20 need=${sourceAmount} have=${balance}`);
    }
  }

  const reward = {
    deadline: BigInt(quoteResponse.deadline),
    creator: funder,
    prover: quote.contracts.prover as Address,
    nativeAmount: isNative ? sourceAmount : 0n,
    tokens: isNative ? [] : [{ token: sourceToken, amount: sourceAmount }],
  };
  const publishValue = isNative ? sourceAmount : 0n;
  // The destination arg comes from magenta's response, not the scenario's
  // configured destChain. For any-to-any LOCAL-parent quotes magenta returns
  // destinationChainID=sourceChain (LOCAL intent on source); for direct
  // cross-chain quotes it returns the actual destination. routes-cli's
  // publish.command.ts uses the same value (publish.command.ts:252-263).
  const responseDestChain = quoteResponse.destinationChainID;
  if (responseDestChain === undefined) {
    throw new Error(`quote-shape-invalid: response missing quoteResponses[0].destinationChainID`);
  }
  const publishArgs = [
    BigInt(responseDestChain),
    quoteResponse.encodedRoute as Hex,
    reward,
    true,
  ] as const;

  await publicClient.simulateContract({
    address: portal,
    abi: portalAbi,
    functionName: 'publishAndFund',
    args: publishArgs,
    value: publishValue,
    account: funder,
  });

  const publishTxHash = await walletClient.writeContract({
    address: portal,
    abi: portalAbi,
    functionName: 'publishAndFund',
    args: publishArgs,
    value: publishValue,
    account: walletClient.account!,
    chain: walletClient.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash: publishTxHash });
  if (receipt.status !== 'success') {
    throw new Error(`evm-publish-revert: tx=${publishTxHash}`);
  }

  const [event] = parseEventLogs({
    abi: portalAbi,
    strict: true,
    eventName: 'IntentPublished',
    logs: receipt.logs,
  });
  const intentHash = ((event?.args as { intentHash?: Hex } | undefined)?.intentHash ??
    ('0x' as Hex)) as Hex;

  return { publishTxHash, intentHash, publishBlock: receipt.blockNumber, portal };
}
