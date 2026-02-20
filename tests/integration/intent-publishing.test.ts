/**
 * Integration tests — Intent publishing flow
 *
 * Verifies the end-to-end pipeline across modules:
 *   IntentService (quote → route encoding) →
 *   PublisherFactory (chain type dispatch) →
 *   EvmPublisher (token approval + portal contract call)
 *
 * All external I/O (RPC calls, HTTP quote service, CLI prompts) is mocked.
 */

import inquirer from 'inquirer';
import { encodeAbiParameters, encodeEventTopics, parseAbiParameters } from 'viem';

import { EvmPublisher } from '@/blockchain/evm-publisher';
import { createPublisher } from '@/blockchain/publisher-factory';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { TvmPublisher } from '@/blockchain/tvm-publisher';
import { portalAbi } from '@/commons/abis/portal.abi';
import { ChainConfig } from '@/config/chains';
import { ErrorCode, RoutesCliError } from '@/core/errors';
import { ChainType } from '@/core/interfaces/intent';
import { IntentConfig, IntentService } from '@/core/services/intent-service';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import * as quoteModule from '@/core/utils/quote';

import {
  createMockEvmClientFactory,
  mockEvmPublicClient,
  mockEvmWalletClient,
} from '../__mocks__/evm-client-factory.mock';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PORTAL_ADDR_EVM = '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97';
const PROVER_ADDR_EVM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CREATOR_ADDR_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth
const RECIPIENT_ADDR_EVM = '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5';
const TOKEN_ADDR_EVM = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'; // USDC on Base

/** Hardhat/Anvil account #0 — deterministic test private key. */
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

const portalUniversal = AddressNormalizer.normalize(PORTAL_ADDR_EVM, ChainType.EVM);
const proverUniversal = AddressNormalizer.normalize(PROVER_ADDR_EVM, ChainType.EVM);
const creatorUniversal = AddressNormalizer.normalize(CREATOR_ADDR_EVM, ChainType.EVM);
const recipientUniversal = AddressNormalizer.normalize(RECIPIENT_ADDR_EVM, ChainType.EVM);
const tokenUniversal = AddressNormalizer.normalize(TOKEN_ADDR_EVM, ChainType.EVM);

/** Source chain with pre-configured portal + prover so manual fallback skips prompts for them. */
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

function makeIntentConfig(): IntentConfig {
  return {
    sourceChain: SOURCE_CHAIN,
    destChain: DEST_CHAIN,
    creator: creatorUniversal,
    recipient: recipientUniversal,
    rewardToken: {
      address: TOKEN_ADDR_EVM as BlockchainAddress,
      decimals: 6,
      symbol: 'USDC',
    },
    rewardAmount: 5_000_000n, // 5 USDC
    rewardAmountStr: '5',
    routeToken: {
      address: TOKEN_ADDR_EVM as BlockchainAddress,
      decimals: 6,
      symbol: 'USDC',
    },
  };
}

/** Minimal valid QuoteResponse returned by the mock quote service. */
const MOCK_QUOTE: quoteModule.QuoteResponse = {
  quoteResponse: {
    sourceChainID: 1,
    destinationChainID: 10,
    sourceToken: TOKEN_ADDR_EVM,
    destinationToken: TOKEN_ADDR_EVM,
    sourceAmount: '5000000',
    destinationAmount: '4950000',
    funder: CREATOR_ADDR_EVM,
    refundRecipient: CREATOR_ADDR_EVM,
    recipient: RECIPIENT_ADDR_EVM,
    encodedRoute: '0xdeadbeef',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    fees: [] as any,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    estimatedFulfillTimeSec: 30,
  },
  contracts: {
    sourcePortal: PORTAL_ADDR_EVM as `0x${string}`,
    prover: PROVER_ADDR_EVM as `0x${string}`,
    destinationPortal: PORTAL_ADDR_EVM as `0x${string}`,
  },
};

/**
 * Build a properly ABI-encoded receipt log for the IntentPublished event so that
 * viem's `parseEventLogs` (strict: true) can decode it in the success path.
 */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function buildIntentPublishedReceipt(intentHash: `0x${string}`) {
  const topics = encodeEventTopics({
    abi: portalAbi,
    eventName: 'IntentPublished',
    args: {
      intentHash,
      creator: CREATOR_ADDR_EVM as `0x${string}`,
      prover: PROVER_ADDR_EVM as `0x${string}`,
    },
  });

  // Non-indexed fields: destination, route, rewardDeadline, rewardNativeAmount, rewardTokens
  const data = encodeAbiParameters(
    parseAbiParameters('uint64, bytes, uint64, uint256, (address token, uint256 amount)[]'),
    [10n, '0xdeadbeef', 9_999_999_999n, 0n, []]
  );

  return {
    status: 'success' as const,
    logs: [
      {
        address: PORTAL_ADDR_EVM as `0x${string}`,
        topics,
        data,
        blockHash:
          '0x0000000000000000000000000000000000000000000000000000000000000001' as `0x${string}`,
        blockNumber: 1n,
        logIndex: 0,
        removed: false,
        transactionHash: '0xmockpublishtxhash' as `0x${string}`,
        transactionIndex: 0,
      },
    ],
  };
}

// ── Mock setup ────────────────────────────────────────────────────────────────

/** Mock inquirer so interactive prompts return controlled values without blocking. */
jest.mock('inquirer', () => ({
  __esModule: true,
  default: { prompt: jest.fn() },
}));

const mockPrompt = inquirer.prompt as unknown as jest.Mock;

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Intent publishing flow (integration)', () => {
  let intentService: IntentService;
  let getQuoteSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    intentService = new IntentService();

    // Restore mock client defaults for every test
    (mockEvmPublicClient.getBalance as jest.Mock).mockResolvedValue(1_000_000_000_000_000_000n);
    (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(10_000_000n);
    (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue({
      status: 'success',
      logs: [],
    });
    (mockEvmWalletClient.writeContract as jest.Mock).mockResolvedValue('0xmockapprovetxhash');
    (mockEvmWalletClient.sendTransaction as jest.Mock).mockResolvedValue('0xmockpublishtxhash');

    getQuoteSpy = jest.spyOn(quoteModule, 'getQuote');
  });

  afterEach(() => {
    getQuoteSpy.mockRestore();
  });

  // ── 1. Full flow: quote → encode → publish ──────────────────────────────────

  describe('Full flow: quote → encode → publish', () => {
    it('publishes intent successfully when quote service returns a valid response', async () => {
      const intentHash = `0x${'ab'.repeat(32)}` as `0x${string}`;

      getQuoteSpy.mockResolvedValue(MOCK_QUOTE);
      mockPrompt.mockResolvedValueOnce({ confirm: true });

      const { reward, encodedRoute, sourcePortal } =
        await intentService.buildIntent(makeIntentConfig());

      // Reward contains expected creator from intent config
      expect(reward.creator).toBe(creatorUniversal);
      // encodedRoute comes from the mocked quote
      expect(encodedRoute).toBe('0xdeadbeef');
      // sourcePortal is normalized from quote.contracts.sourcePortal
      expect(sourcePortal).toBe(portalUniversal);

      const publisher = new EvmPublisher(SOURCE_CHAIN.rpcUrl, createMockEvmClientFactory());

      // balanceOf check → sufficient; allowance check → sufficient (skip approval)
      (mockEvmPublicClient.readContract as jest.Mock)
        .mockResolvedValueOnce(10_000_000n) // balanceOf
        .mockResolvedValueOnce(10_000_000n); // allowance (>= reward amount → no approval)

      (mockEvmPublicClient.waitForTransactionReceipt as jest.Mock).mockResolvedValue(
        buildIntentPublishedReceipt(intentHash)
      );

      const result = await publisher.publish(
        SOURCE_CHAIN.id,
        DEST_CHAIN.id,
        reward,
        encodedRoute,
        TEST_PRIVATE_KEY,
        sourcePortal
      );

      expect(result.success).toBe(true);
      expect(result.transactionHash).toBe('0xmockpublishtxhash');
      expect(result.intentHash).toBe(intentHash);
    });
  });

  // ── 2. Quote failure → manual config fallback ──────────────────────────────

  describe('Quote service failure → manual config fallback', () => {
    it('builds a valid intent from manual config when quote service throws', async () => {
      getQuoteSpy.mockRejectedValue(new Error('Network timeout'));

      // buildManualFallback prompts: proceedManual → routeAmountStr
      // (no portal/prover prompts because SOURCE_CHAIN has both configured)
      // then buildIntent prompts: confirm
      mockPrompt
        .mockResolvedValueOnce({ proceedManual: true })
        .mockResolvedValueOnce({ routeAmountStr: '5' })
        .mockResolvedValueOnce({ confirm: true });

      const result = await intentService.buildIntent(makeIntentConfig());

      // Must produce a valid reward and encoded route even without a live quote
      expect(result.reward).toBeDefined();
      expect(result.reward.creator).toBe(creatorUniversal);
      expect(result.encodedRoute).toMatch(/^0x/);
      // sourcePortal comes from SOURCE_CHAIN.portalAddress (no prompt needed)
      expect(result.sourcePortal).toBe(portalUniversal);
    });

    it('throws if user declines manual config when quote fails', async () => {
      getQuoteSpy.mockRejectedValue(new Error('Service unavailable'));

      // User declines manual mode
      mockPrompt.mockResolvedValueOnce({ proceedManual: false });

      await expect(intentService.buildIntent(makeIntentConfig())).rejects.toThrow(
        'Publication cancelled by user'
      );
    });
  });

  // ── 3. Invalid recipient address ───────────────────────────────────────────

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

  // ── 4. Insufficient balance ────────────────────────────────────────────────

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
      const publisher = new EvmPublisher(SOURCE_CHAIN.rpcUrl, createMockEvmClientFactory());
      (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(100n); // 0.0001 USDC

      const result = await publisher.validate(largeReward(), CREATOR_ADDR_EVM);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatch(/Insufficient token balance/i);
    });

    it('publish() returns { success: false } when token balance check fails', async () => {
      const publisher = new EvmPublisher(SOURCE_CHAIN.rpcUrl, createMockEvmClientFactory());
      // balanceOf returns insufficient amount (100 < 1_000_000_000)
      (mockEvmPublicClient.readContract as jest.Mock).mockResolvedValue(100n);

      const result = await publisher.publish(
        SOURCE_CHAIN.id,
        DEST_CHAIN.id,
        largeReward(),
        '0x',
        TEST_PRIVATE_KEY,
        portalUniversal
      );

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Insufficient token balance/i);
    });
  });

  // ── 5. Publisher selected based on source chain type ───────────────────────

  describe('Publisher selected based on source chain type', () => {
    it('createPublisher returns EvmPublisher for ChainType.EVM', () => {
      const publisher = createPublisher(ChainType.EVM, 'https://cloudflare-eth.com');
      expect(publisher).toBeInstanceOf(EvmPublisher);
    });

    it('createPublisher returns TvmPublisher for ChainType.TVM', () => {
      const publisher = createPublisher(ChainType.TVM, 'https://api.trongrid.io');
      expect(publisher).toBeInstanceOf(TvmPublisher);
    });

    it('createPublisher returns SvmPublisher for ChainType.SVM', () => {
      const publisher = createPublisher(ChainType.SVM, 'https://api.mainnet-beta.solana.com');
      expect(publisher).toBeInstanceOf(SvmPublisher);
    });

    it('createPublisher throws for an unregistered chain type', () => {
      expect(() => createPublisher('UNKNOWN' as ChainType, 'https://rpc.example.com')).toThrow(
        /Unsupported chain type/i
      );
    });
  });
});
