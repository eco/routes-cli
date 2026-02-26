import { createPublicClient, http, parseEventLogs, parseUnits } from 'viem';
import { base } from 'viem/chains';

import { EvmPublisher } from '@/blockchain/evm/evm.publisher';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { PortalEncoder } from '@/blockchain/utils/portal-encoder';
import { portalAbi } from '@/commons/abis/portal.abi';
import { ChainType, KeyHandle } from '@/shared';

import {
  ANVIL_RPC,
  fundTestAccountWithUsdc,
  getUsdcBalance,
  PORTAL_ADDRESS,
  TEST_ADDRESS,
  TEST_PRIVATE_KEY,
  USDC_ADDRESS,
} from './setup/anvil-helpers';

const SOURCE_CHAIN_ID = 8453n; // Base mainnet
const DEST_CHAIN_ID = 10n; // Optimism

// Minimal fakes satisfying the DI contracts required by EvmPublisher
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRegistry: any = { isRegistered: (_id: bigint) => true };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChains: any = {
  findChainById: (id: bigint) => {
    if (id === SOURCE_CHAIN_ID || id === DEST_CHAIN_ID) {
      return { id, name: id === SOURCE_CHAIN_ID ? 'Base' : 'Optimism', type: 'EVM' };
    }
    return undefined;
  },
};

const universalCreator = AddressNormalizer.normalize(TEST_ADDRESS, ChainType.EVM);
const universalPortal = AddressNormalizer.normalize(PORTAL_ADDRESS, ChainType.EVM);
const universalUsdc = AddressNormalizer.normalize(USDC_ADDRESS, ChainType.EVM);

function buildReward(deadlineOffsetSec = 3600): {
  deadline: bigint;
  nativeAmount: bigint;
  creator: ReturnType<typeof AddressNormalizer.normalize>;
  prover: ReturnType<typeof AddressNormalizer.normalize>;
  tokens: Array<{ token: ReturnType<typeof AddressNormalizer.normalize>; amount: bigint }>;
} {
  return {
    deadline: BigInt(Math.floor(Date.now() / 1000) + deadlineOffsetSec),
    nativeAmount: 0n,
    creator: universalCreator,
    prover: universalCreator, // using self as prover for test simplicity
    tokens: [{ token: universalUsdc, amount: parseUnits('5', 6) }], // 5 USDC
  };
}

const encodedRoute = PortalEncoder.encode(
  {
    salt: '0x0000000000000000000000000000000000000000000000000000000000000001',
    portal: universalPortal,
    calls: [],
    nativeAmount: 0n,
    deadline: 0n,
    tokens: [{ token: universalUsdc, amount: parseUnits('5', 6) }],
  },
  ChainType.EVM
) as string;

describe('EvmPublisher E2E — Base mainnet fork via Anvil', () => {
  let publisher: EvmPublisher;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let publicClient: ReturnType<typeof createPublicClient<typeof base>> | any;

  beforeAll(async () => {
    publisher = new EvmPublisher(ANVIL_RPC, mockRegistry, mockChains);
    publicClient = createPublicClient({ chain: base, transport: http(ANVIL_RPC) });

    // Write 100 USDC directly into the test account storage on the fork
    await fundTestAccountWithUsdc(100);
  });

  // ─── Happy path ─────────────────────────────────────────────────────────────

  it('publishes intent and emits IntentPublished event on-chain', async () => {
    const reward = buildReward();
    const result = await publisher.publish(
      SOURCE_CHAIN_ID,
      DEST_CHAIN_ID,
      reward,
      encodedRoute,
      new KeyHandle(TEST_PRIVATE_KEY),
      universalPortal
    );

    expect(result.success).toBe(true);
    expect(result.transactionHash).toMatch(/^0x[a-f0-9]{64}$/i);
    expect(result.intentHash).toMatch(/^0x[a-f0-9]{64}$/i);

    // Verify the IntentPublished event was actually emitted on-chain
    const receipt = await publicClient.getTransactionReceipt({
      hash: result.transactionHash as `0x${string}`,
    });
    const [event] = parseEventLogs({
      abi: portalAbi,
      eventName: 'IntentPublished',
      logs: receipt.logs,
    });
    expect(event).toBeDefined();
    expect(event.args.intentHash).toBe(result.intentHash);
  });

  it('USDC is deducted from test account after funding', async () => {
    const balanceBefore = await getUsdcBalance(TEST_ADDRESS);
    const reward = buildReward(7200); // different deadline = new intent hash
    await publisher.publish(
      SOURCE_CHAIN_ID,
      DEST_CHAIN_ID,
      reward,
      encodedRoute,
      new KeyHandle(TEST_PRIVATE_KEY),
      universalPortal
    );
    const balanceAfter = await getUsdcBalance(TEST_ADDRESS);
    expect(balanceAfter).toBeLessThan(balanceBefore);
  });

  it('skips approval on second publish (maxUint256 allowance already set)', async () => {
    // After the first test the portal already has maxUint256 allowance.
    // This test measures that the second publish succeeds (no approval tx needed).
    const reward = buildReward(10800);
    const result = await publisher.publish(
      SOURCE_CHAIN_ID,
      DEST_CHAIN_ID,
      reward,
      encodedRoute,
      new KeyHandle(TEST_PRIVATE_KEY),
      universalPortal
    );
    expect(result.success).toBe(true);
  });

  // ─── validate() against real chain ──────────────────────────────────────────

  it('validate() passes when USDC balance is sufficient', async () => {
    const result = await publisher.validate(buildReward(), TEST_ADDRESS);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validate() fails when USDC balance is insufficient', async () => {
    const hugeReward = buildReward();
    hugeReward.tokens = [{ token: universalUsdc, amount: parseUnits('999999', 6) }];
    const result = await publisher.validate(hugeReward, TEST_ADDRESS);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/insufficient/i);
  });

  // ─── Error paths ─────────────────────────────────────────────────────────────

  it('returns { success: false } when reward deadline is already expired', async () => {
    const expiredReward = buildReward(-60); // 60 seconds in the past
    const result = await publisher.publish(
      SOURCE_CHAIN_ID,
      DEST_CHAIN_ID,
      expiredReward,
      encodedRoute,
      new KeyHandle(TEST_PRIVATE_KEY),
      universalPortal
    );
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns { success: false } when portal address is wrong', async () => {
    const badPortal = AddressNormalizer.normalize(
      '0x0000000000000000000000000000000000000001',
      ChainType.EVM
    );
    const result = await publisher.publish(
      SOURCE_CHAIN_ID,
      DEST_CHAIN_ID,
      buildReward(),
      encodedRoute,
      new KeyHandle(TEST_PRIVATE_KEY),
      badPortal
    );
    expect(result.success).toBe(false);
  });
});
