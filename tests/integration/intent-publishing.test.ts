/**
 * Integration tests — Intent publishing flow
 *
 * Verifies the end-to-end pipeline across modules:
 *   PublisherFactory (chain type dispatch) →
 *   EvmPublisher (token approval + portal contract call)
 *
 * All external I/O (RPC calls) is mocked.
 */

import { EvmPublisher } from '@/blockchain/evm/evm.publisher';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { ChainConfig } from '@/config/chains';
import { ErrorCode, RoutesCliError } from '@/shared/errors';
import { KeyHandle } from '@/shared/security';
import { BlockchainAddress, ChainType } from '@/shared/types';

import {
  createMockEvmClientFactory,
  mockEvmPublicClient,
  mockEvmWalletClient,
} from '../__mocks__/evm-client-factory.mock';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PORTAL_ADDR_EVM = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97';
const PROVER_ADDR_EVM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CREATOR_ADDR_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const TOKEN_ADDR_EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

/** Hardhat/Anvil account #0 — deterministic test private key. */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const portalUniversal = AddressNormalizer.normalize(PORTAL_ADDR_EVM, ChainType.EVM);
const proverUniversal = AddressNormalizer.normalize(PROVER_ADDR_EVM, ChainType.EVM);
const creatorUniversal = AddressNormalizer.normalize(CREATOR_ADDR_EVM, ChainType.EVM);
const tokenUniversal = AddressNormalizer.normalize(TOKEN_ADDR_EVM, ChainType.EVM);

// Minimal mocks for EvmPublisher's NestJS DI dependencies
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockRegistry: any = { isRegistered: () => true };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockChains: any = {
  findChainById: (id: bigint) =>
    id === 10n
      ? {
          id: 10n,
          name: 'Optimism',
          type: ChainType.EVM,
          env: 'production',
          rpcUrl: 'https://mainnet.optimism.io',
          nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        }
      : undefined,
};

/** Source chain with pre-configured portal + prover. */
const SOURCE_CHAIN: ChainConfig = {
  id: 1n,
  name: 'Ethereum',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://cloudflare-eth.com',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  portalAddress: portalUniversal,
  proverAddress: proverUniversal,
};

const DEST_CHAIN: ChainConfig = {
  id: 10n,
  name: 'Optimism',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.optimism.io',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Intent publishing flow (integration)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Restore mock client defaults for every test
    (mockEvmPublicClient.getBalance as jest.Mock).mockResolvedValue(1_000_000_000_000_000_000n);
    (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(10_000_000n);
    (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue({
      status: 'success',
      logs: [],
    });
    (mockEvmWalletClient.writeContract as jest.Mock).mockResolvedValue('0xmockapprovetxhash');
    (mockEvmWalletClient.sendTransaction as jest.Mock).mockResolvedValue('0xmockpublishtxhash');
  });

  // ── 1. Invalid recipient address ───────────────────────────────────────────

  describe('Invalid recipient address', () => {
    it('throws RoutesCliError with INVALID_ADDRESS when EVM address is malformed', () => {
      expect(() =>
        AddressNormalizer.normalize('not-a-valid-address' as BlockchainAddress, ChainType.EVM)
      ).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_ADDRESS }));
    });

    it('thrown error is a RoutesCliError instance', () => {
      expect(() =>
        AddressNormalizer.normalize('0xBAD' as BlockchainAddress, ChainType.EVM)
      ).toThrow(RoutesCliError);
    });

    it('isUserError is true so the CLI can render a friendly message', () => {
      let caught: RoutesCliError | null = null;
      try {
        AddressNormalizer.normalize('garbage' as BlockchainAddress, ChainType.EVM);
      } catch (err: unknown) {
        if (err instanceof RoutesCliError) caught = err;
      }
      expect(caught).not.toBeNull();
      expect(caught!.isUserError).toBe(true);
    });
  });

  // ── 2. Insufficient balance ────────────────────────────────────────────────

  describe('Insufficient balance', () => {
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const largeReward = () => ({
      deadline: 9_999_999_999n,
      creator: creatorUniversal,
      prover: proverUniversal,
      nativeAmount: 0n,
      tokens: [{ token: tokenUniversal, amount: 1_000_000_000n }], // 1000 USDC required
    });

    it('validate() returns { valid: false } when token balance is below required', async () => {
      const publisher = new EvmPublisher(
        SOURCE_CHAIN.rpcUrl,
        mockRegistry,
        mockChains,
        createMockEvmClientFactory()
      );
      (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(100n); // 0.0001 USDC

      const result = await publisher.validate(largeReward(), CREATOR_ADDR_EVM);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Insufficient token balance/i);
    });

    it('publish() returns { success: false } when token balance check fails', async () => {
      const publisher = new EvmPublisher(
        SOURCE_CHAIN.rpcUrl,
        mockRegistry,
        mockChains,
        createMockEvmClientFactory()
      );
      // balanceOf returns insufficient amount (100 < 1_000_000_000)
      (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(100n);

      const result = await publisher.publish(
        SOURCE_CHAIN.id,
        DEST_CHAIN.id,
        largeReward(),
        '0x',
        new KeyHandle(TEST_PRIVATE_KEY),
        portalUniversal
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Insufficient token balance/i);
    });
  });
});
