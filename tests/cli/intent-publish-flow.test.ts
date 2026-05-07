import { IntentPublishFlow } from '@/cli/services/intent-publish-flow.service';
import { ChainConfig, ChainType, UniversalAddress } from '@/shared/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SOURCE_CHAIN: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  proverAddress:
    '0xprover000000000000000000000000000000000000000000000000000000000' as unknown as UniversalAddress,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

const DEST_CHAIN: ChainConfig = {
  id: 10n,
  name: 'Optimism',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.optimism.io',
  portalAddress:
    '0xportal0000000000000000000000000000000000000000000000000000000000' as unknown as UniversalAddress,
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

const TOKEN_USDC = {
  address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
  decimals: 6,
  symbol: 'USDC',
};

const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const FAKE_UNIVERSAL: UniversalAddress =
  '0x0000000000000000000000000000000000000000000000000000000000000000' as UniversalAddress;

// ── Mock factory ─────────────────────────────────────────────────────────────

interface FlowMocks {
  flow: IntentPublishFlow;
  prompt: {
    selectToken: jest.Mock;
    inputAmount: jest.Mock;
    inputAddress: jest.Mock;
    inputManualPortal: jest.Mock;
    inputManualProver: jest.Mock;
    confirmPublish: jest.Mock;
  };
  publisher: { publish: jest.Mock };
  publisherFactory: { create: jest.Mock };
  quoteService: { getQuote: jest.Mock };
  intentBuilder: { buildReward: jest.Mock; buildManualRoute: jest.Mock };
  intentStorage: { save: jest.Mock };
  statusService: { watch: jest.Mock };
}

function buildFlow(): FlowMocks {
  const prompt = {
    selectToken: jest.fn().mockResolvedValue(TOKEN_USDC),
    inputAmount: jest.fn().mockResolvedValue({ raw: '1', parsed: 1_000_000n }),
    inputAddress: jest.fn().mockResolvedValue('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
    inputManualPortal: jest.fn().mockResolvedValue('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
    inputManualProver: jest.fn().mockResolvedValue('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
    confirmPublish: jest.fn().mockResolvedValue(true),
  };

  const publisher = {
    publish: jest.fn().mockResolvedValue({
      success: true,
      transactionHash: '0xtx',
      intentHash: '0xhash',
    }),
  };
  const publisherFactory = { create: jest.fn().mockReturnValue(publisher) };

  const quoteService = {
    getQuote: jest.fn().mockResolvedValue({
      encodedRoute: '0xroute',
      sourcePortal: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      prover: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      deadline: 9_999_999_999,
      destinationAmount: '1000000',
      destinationPortalAddress: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      destinationChainId: Number(DEST_CHAIN.id),
    }),
  };

  const intentBuilder = {
    buildReward: jest.fn().mockReturnValue({
      deadline: 9_999_999_999n,
      creator: FAKE_UNIVERSAL,
      prover: FAKE_UNIVERSAL,
      nativeAmount: 0n,
      tokens: [],
    }),
    buildManualRoute: jest.fn().mockReturnValue({ encodedRoute: '0xmanual', route: {} }),
  };

  const intentStorage = { save: jest.fn().mockResolvedValue(undefined) };
  const statusService = { watch: jest.fn().mockResolvedValue('fulfilled') };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = { getKeyForChainType: () => TEST_PRIVATE_KEY };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizer: any = { normalize: () => FAKE_UNIVERSAL };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const display: any = {
    title: () => undefined,
    section: () => undefined,
    spinner: () => undefined,
    succeed: () => undefined,
    fail: () => undefined,
    warn: () => undefined,
    warning: () => undefined,
    log: () => undefined,
    displayQuote: () => undefined,
    displayTransactionResult: () => undefined,
    displayFulfillmentResult: () => undefined,
  };

  const flow = new IntentPublishFlow(
    config,
    normalizer,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    publisherFactory as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    quoteService as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intentBuilder as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    intentStorage as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prompt as any,
    display,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusService as any
  );

  return {
    flow,
    prompt,
    publisher,
    publisherFactory,
    quoteService,
    intentBuilder,
    intentStorage,
    statusService,
  };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe('IntentPublishFlow.publish', () => {
  it('overrides skip the corresponding interactive prompts', async () => {
    const { flow, prompt } = buildFlow();
    await flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { privateKey: TEST_PRIVATE_KEY },
      overrides: {
        rewardToken: TOKEN_USDC,
        routeToken: TOKEN_USDC,
        rewardAmount: 1_000_000n,
        recipientRaw: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
    });
    expect(prompt.selectToken).not.toHaveBeenCalled();
    expect(prompt.inputAddress).not.toHaveBeenCalled();
    // inputAmount may still be called inside the manual-route fallback;
    // happy path with successful quote should not call it.
    expect(prompt.inputAmount).not.toHaveBeenCalled();
  });

  it('falls back to manual route when the quote service throws', async () => {
    const { flow, quoteService, intentBuilder } = buildFlow();
    quoteService.getQuote.mockRejectedValueOnce(new Error('quote down'));

    await flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { privateKey: TEST_PRIVATE_KEY },
      overrides: {
        rewardToken: TOKEN_USDC,
        routeToken: TOKEN_USDC,
        rewardAmount: 1_000_000n,
        recipientRaw: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
    });
    expect(intentBuilder.buildManualRoute).toHaveBeenCalledTimes(1);
  });

  it('dry-run skips publishing and returns null', async () => {
    const { flow, publisher, publisherFactory } = buildFlow();
    const out = await flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { privateKey: TEST_PRIVATE_KEY, dryRun: true },
      overrides: {
        rewardToken: TOKEN_USDC,
        routeToken: TOKEN_USDC,
        rewardAmount: 1_000_000n,
        recipientRaw: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      },
    });
    expect(out).toBeNull();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(publisherFactory.create).not.toHaveBeenCalled();
  });

  it('throws when the user does not confirm', async () => {
    const { flow, prompt, publisher } = buildFlow();
    prompt.confirmPublish.mockResolvedValueOnce(false);
    await expect(
      flow.publish({
        sourceChain: SOURCE_CHAIN,
        destChain: DEST_CHAIN,
        options: { privateKey: TEST_PRIVATE_KEY },
        overrides: {
          rewardToken: TOKEN_USDC,
          routeToken: TOKEN_USDC,
          rewardAmount: 1_000_000n,
          recipientRaw: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        },
      })
    ).rejects.toThrow(/cancelled by user/i);
    expect(publisher.publish).not.toHaveBeenCalled();
  });
});
