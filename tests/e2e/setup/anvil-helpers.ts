import {
  createPublicClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbiParameters,
  parseUnits,
} from 'viem';
import { base } from 'viem/chains';

export const ANVIL_RPC = 'http://localhost:8545';

// Anvil default test account #0 — pre-funded with 10 000 ETH by Anvil at fork startup
export const TEST_PRIVATE_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
export const TEST_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;

// Base mainnet contract addresses
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const PORTAL_ADDRESS = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97' as const;

/**
 * Fund the test account with USDC by directly writing to the ERC-20 storage slot.
 * Circle's USDC uses mapping slot 9 for balances.
 * Storage key = keccak256(abi.encode(account, 9))
 */
export async function fundTestAccountWithUsdc(amountUsdc: number): Promise<void> {
  const USDC_BALANCE_SLOT = 9n;
  const storageKey = keccak256(
    encodeAbiParameters(parseAbiParameters('address, uint256'), [TEST_ADDRESS, USDC_BALANCE_SLOT])
  );
  const encodedBalance = encodeAbiParameters(parseAbiParameters('uint256'), [
    parseUnits(String(amountUsdc), 6),
  ]);

  await fetch(ANVIL_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'anvil_setStorageAt',
      params: [USDC_ADDRESS, storageKey, encodedBalance],
    }),
  });
}

/** Read on-chain USDC balance of an address (for assertion in tests). */
export async function getUsdcBalance(address: string): Promise<bigint> {
  const client = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });
  return client.readContract({
    address: USDC_ADDRESS,
    abi: [
      {
        name: 'balanceOf',
        type: 'function',
        inputs: [{ type: 'address' }],
        outputs: [{ type: 'uint256' }],
        stateMutability: 'view',
      },
    ],
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  }) as Promise<bigint>;
}
