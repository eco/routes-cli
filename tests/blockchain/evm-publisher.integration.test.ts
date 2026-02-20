/**
 * Integration tests for EvmPublisher using mocked viem clients.
 *
 * Verifies that EvmPublisher correctly delegates to its injected client factory,
 * performs the right on-chain reads/writes, and handles success/revert outcomes —
 * all without requiring a live RPC endpoint.
 */

import { encodeFunctionData, getAddress, maxUint256 } from 'viem';

import { EvmPublisher } from '@/blockchain/evm-publisher';
import { portalAbi } from '@/commons/abis/portal.abi';
import type { Intent } from '@/core/interfaces/intent';
import { ChainType } from '@/core/interfaces/intent';
import { KeyHandle } from '@/core/security';
import { AddressNormalizer } from '@/core/utils/address-normalizer';

import {
  createMockEvmClientFactory,
  mockEvmPublicClient,
  mockEvmWalletClient,
} from '../__mocks__/evm-client-factory.mock';

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Hardhat/Anvil account 0 — deterministic test private key. */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
/** Address derived from TEST_PRIVATE_KEY. */
const SENDER_ADDR = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';

const PORTAL_ADDR_EVM = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97'; // Base mainnet portal
const CREATOR_ADDR_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const PROVER_ADDR_EVM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC contract (valid EVM addr)
const TOKEN_ADDR_EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

const SOURCE_CHAIN_ID = 1n; // Ethereum (production env)
const DEST_CHAIN_ID = 10n; // Optimism (production env)

const portalUniversal = AddressNormalizer.normalize(PORTAL_ADDR_EVM, ChainType.EVM);
const creatorUniversal = AddressNormalizer.normalize(CREATOR_ADDR_EVM, ChainType.EVM);
const proverUniversal = AddressNormalizer.normalize(PROVER_ADDR_EVM, ChainType.EVM);
const tokenUniversal = AddressNormalizer.normalize(TOKEN_ADDR_EVM, ChainType.EVM);

function makeReward(overrides: Partial<Intent['reward']> = {}): Intent['reward'] {
  return {
    deadline: 9_999_999_999n,
    creator: creatorUniversal,
    prover: proverUniversal,
    nativeAmount: 0n,
    tokens: [],
    ...overrides,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('EvmPublisher (integration — mocked clients)', () => {
  let publisher: EvmPublisher;

  beforeEach(() => {
    // Reset call counts and clear Once queues; keep default mockResolvedValue implementations.
    jest.clearAllMocks();
    // Re-establish defaults explicitly so each test starts from a known state.
    (mockEvmPublicClient.getBalance as jest.Mock).mockResolvedValue(0n);
    (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(0n);
    (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue({
      status: 'success',
      logs: [],
    });
    (mockEvmWalletClient.writeContract as jest.Mock).mockResolvedValue('0xmockapprovetxhash');
    (mockEvmWalletClient.sendTransaction as jest.Mock).mockResolvedValue('0xmockpublishtxhash');

    publisher = new EvmPublisher('https://rpc.example.com', createMockEvmClientFactory());
  });

  // ── getBalance() ─────────────────────────────────────────────────────────────

  describe('getBalance()', () => {
    it('returns the mocked native balance', async () => {
      const balance = 5_000_000_000_000_000_000n; // 5 ETH in wei
      (mockEvmPublicClient.getBalance as jest.Mock).mockResolvedValue(balance);

      const result = await publisher.getBalance(SENDER_ADDR);

      expect(result).toBe(balance);
      expect(mockEvmPublicClient.getBalance).toHaveBeenCalledWith({ address: SENDER_ADDR });
    });
  });

  // ── validate() ────────────────────────────────────────────────────────────────

  describe('validate()', () => {
    it('returns valid:true when native and token balances are sufficient', async () => {
      const reward = makeReward({
        nativeAmount: 1n,
        tokens: [{ token: tokenUniversal, amount: 100n }],
      });
      (mockEvmPublicClient.getBalance as jest.Mock).mockResolvedValue(10n); // > 1n
      (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(200n); // > 100n

      const result = await publisher.validate(reward, SENDER_ADDR);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid:false with error when native balance is insufficient', async () => {
      const reward = makeReward({ nativeAmount: 1_000_000_000_000_000_000n }); // requires 1 ETH
      (mockEvmPublicClient.getBalance as jest.Mock).mockResolvedValue(0n); // has nothing

      const result = await publisher.validate(reward, SENDER_ADDR);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Insufficient native balance/);
    });

    it('returns valid:false with error when token balance is insufficient', async () => {
      const reward = makeReward({ tokens: [{ token: tokenUniversal, amount: 500n }] });
      (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(10n); // 10 < 500

      const result = await publisher.validate(reward, SENDER_ADDR);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Insufficient token balance/);
    });
  });

  // ── publish() — token approval ────────────────────────────────────────────────

  describe('publish() — token approval', () => {
    it('skips approval when allowance is already sufficient', async () => {
      const reward = makeReward({ tokens: [{ token: tokenUniversal, amount: 100n }] });

      // balanceOf → 200 (sufficient); allowance → 200 (sufficient — skip approval)
      (mockEvmPublicClient.readContract as jest.Mock)
        .mockResolvedValueOnce(200n)
        .mockResolvedValueOnce(200n);
      (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue({
        status: 'reverted',
        logs: [],
      });

      await publisher.publish(
        SOURCE_CHAIN_ID,
        DEST_CHAIN_ID,
        reward,
        '0x',
        new KeyHandle(TEST_PRIVATE_KEY),
        portalUniversal
      );

      expect(mockEvmWalletClient.writeContract).not.toHaveBeenCalled();
    });

    it('sends approval transaction when allowance is insufficient', async () => {
      const reward = makeReward({ tokens: [{ token: tokenUniversal, amount: 100n }] });

      // balanceOf → 200 (sufficient); allowance → 0 (must approve)
      (mockEvmPublicClient.readContract as jest.Mock)
        .mockResolvedValueOnce(200n)
        .mockResolvedValueOnce(0n);
      (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock)
        .mockResolvedValueOnce({ status: 'success', logs: [] }) // approval receipt
        .mockResolvedValueOnce({ status: 'reverted', logs: [] }); // main tx receipt

      await publisher.publish(
        SOURCE_CHAIN_ID,
        DEST_CHAIN_ID,
        reward,
        '0x',
        new KeyHandle(TEST_PRIVATE_KEY),
        portalUniversal
      );

      expect(mockEvmWalletClient.writeContract).toHaveBeenCalledTimes(1);
      expect(mockEvmWalletClient.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: getAddress(TOKEN_ADDR_EVM),
          functionName: 'approve',
          args: [getAddress(PORTAL_ADDR_EVM), maxUint256],
        })
      );
    });
  });

  // ── publish() — portal contract call ─────────────────────────────────────────

  describe('publish() — portal contract call', () => {
    it('calls portal sendTransaction with correctly encoded publishAndFund data', async () => {
      const reward = makeReward();
      const encodedRoute = '0xdeadbeef';
      (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue({
        status: 'reverted',
        logs: [],
      });

      await publisher.publish(
        SOURCE_CHAIN_ID,
        DEST_CHAIN_ID,
        reward,
        encodedRoute,
        new KeyHandle(TEST_PRIVATE_KEY),
        portalUniversal
      );

      const expectedEvmReward = {
        deadline: reward.deadline,
        nativeAmount: 0n,
        creator: getAddress(CREATOR_ADDR_EVM),
        prover: getAddress(PROVER_ADDR_EVM),
        tokens: [],
      };
      const expectedData = encodeFunctionData({
        abi: portalAbi,
        functionName: 'publishAndFund',
        args: [DEST_CHAIN_ID, encodedRoute as `0x${string}`, expectedEvmReward, false],
      });

      expect(mockEvmWalletClient.sendTransaction).toHaveBeenCalledTimes(1);
      expect(mockEvmWalletClient.sendTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          to: getAddress(PORTAL_ADDR_EVM),
          data: expectedData,
          value: 0n,
        })
      );
    });

    it('returns { success: false } when transaction reverts', async () => {
      const reward = makeReward();
      (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue({
        status: 'reverted',
        logs: [],
      });

      const result = await publisher.publish(
        SOURCE_CHAIN_ID,
        DEST_CHAIN_ID,
        reward,
        '0x',
        new KeyHandle(TEST_PRIVATE_KEY),
        portalUniversal
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('Transaction failed');
    });
  });
});
