import { IntentPublishFlow } from '@/cli/services/intent-publish-flow.service';
import { ChainConfig, ChainType, UniversalAddress } from '@/shared/types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SOURCE_CHAIN: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  provers: {
    LayerZero:
      '0xprover0000000000000000000000000000000000000000000000000000000000' as unknown as UniversalAddress,
  },
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
    selectProver: jest.Mock;
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
    selectProver: jest.fn().mockResolvedValue(FAKE_UNIVERSAL),
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
  const config: any = {
    getKeyForChainType: () => TEST_PRIVATE_KEY,
    getDeadlineOffsetSeconds: () => 9000,
    getRewardDeadlineBufferSeconds: () => 87000,
  };
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

  it('manual fallback spaces the reward deadline a proving buffer past the route deadline', async () => {
    const { flow, quoteService, intentBuilder } = buildFlow();
    quoteService.getQuote.mockRejectedValueOnce(new Error('quote down'));

    const before = BigInt(Math.floor(Date.now() / 1000));
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

    const routeDeadline = intentBuilder.buildManualRoute.mock.calls[0][0].deadline as bigint;
    const rewardDeadline = intentBuilder.buildReward.mock.calls[0][0].deadline as number;
    expect(routeDeadline).toBeGreaterThanOrEqual(before + 9000n);
    // Zero gap gets permanently rejected by the solver's ExpirationValidation;
    // the reward deadline must sit a full proving buffer past the route deadline.
    expect(BigInt(rewardDeadline)).toBe(routeDeadline + 87000n);
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
    expect(out.dryRun).toBe(true);
    expect(out.result).toBeNull();
    expect(out.intent).toBeNull();
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(publisherFactory.create).not.toHaveBeenCalled();
  });

  it('quoteDestinationChainIdOverride only affects the quote request — published intent uses destChain.id', async () => {
    const { flow, quoteService, publisher } = buildFlow();
    await flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN, // id 10n
      options: { privateKey: TEST_PRIVATE_KEY },
      overrides: {
        rewardToken: TOKEN_USDC,
        routeToken: TOKEN_USDC,
        rewardAmount: 1_000_000n,
        recipientRaw: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
        quoteDestinationChainIdOverride: 1337n,
      },
    });
    // Quote request was tagged with the override.
    const quoteCall = quoteService.getQuote.mock.calls[0][0] as { destination: bigint };
    expect(quoteCall.destination).toBe(1337n);
    // Published intent uses destChain.id, NOT the override (and not the quote's
    // echoed destinationChainId — that's intentionally ignored when override
    // is in effect, in case the solver echoes back the synthetic tag).
    const publishCall = publisher.publish.mock.calls[0] as [bigint, bigint, ...unknown[]];
    expect(publishCall[1]).toBe(DEST_CHAIN.id);
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

describe('non-interactive publishing', () => {
  const FULL_OVERRIDES = {
    rewardToken: TOKEN_USDC,
    routeToken: TOKEN_USDC,
    rewardAmount: 1_000_000n,
  };
  const RECIPIENT = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

  it('publishes without any prompt when all values are provided and yes=true', async () => {
    const m = buildFlow();
    const outcome = await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { yes: true, recipient: RECIPIENT },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.selectToken).not.toHaveBeenCalled();
    expect(m.prompt.inputAmount).not.toHaveBeenCalled();
    expect(m.prompt.inputAddress).not.toHaveBeenCalled();
    expect(m.prompt.confirmPublish).not.toHaveBeenCalled();
    expect(outcome.dryRun).toBe(false);
    expect(outcome.result?.success).toBe(true);
    expect(outcome.recipient).toBe(RECIPIENT);
    expect(outcome.sourceChainId).toBe(SOURCE_CHAIN.id);
  });

  it('still asks for confirmation without yes', async () => {
    const m = buildFlow();
    await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { recipient: RECIPIENT },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.confirmPublish).toHaveBeenCalled();
  });

  it('dry-run returns before confirmation and before publishing', async () => {
    const m = buildFlow();
    const outcome = await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { dryRun: true, recipient: RECIPIENT },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.confirmPublish).not.toHaveBeenCalled();
    expect(m.publisher.publish).not.toHaveBeenCalled();
    expect(outcome.dryRun).toBe(true);
    expect(outcome.result).toBeNull();
    expect(outcome.intent).toBeNull();
  });

  it('uses overrides.routeAmount in the quote-failure fallback without prompting', async () => {
    const m = buildFlow();
    m.quoteService.getQuote.mockRejectedValue(new Error('quote service down'));
    await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: {
        yes: true,
        recipient: RECIPIENT,
        portalAddress: RECIPIENT,
        proverAddress: RECIPIENT,
      },
      overrides: { ...FULL_OVERRIDES, routeAmount: 2_000_000n },
    });
    expect(m.prompt.inputAmount).not.toHaveBeenCalled();
    expect(m.intentBuilder.buildManualRoute).toHaveBeenCalledWith(
      expect.objectContaining({ routeAmount: 2_000_000n })
    );
  });

  it('uses the derived sender address as recipient with yes=true and no --recipient', async () => {
    const m = buildFlow();
    const outcome = await m.flow.publish({
      sourceChain: SOURCE_CHAIN,
      destChain: DEST_CHAIN,
      options: { yes: true },
      overrides: FULL_OVERRIDES,
    });
    expect(m.prompt.inputAddress).not.toHaveBeenCalled();
    // TEST_PRIVATE_KEY's derived EVM address (anvil dev account 0)
    expect(outcome.recipient).toBe('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266');
  });

  it('throws a helpful error when no private key is configured', async () => {
    const prompt = {
      selectToken: jest.fn().mockResolvedValue(TOKEN_USDC),
      inputAmount: jest.fn().mockResolvedValue({ raw: '1', parsed: 1_000_000n }),
      inputAddress: jest.fn().mockResolvedValue('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
      inputManualPortal: jest.fn().mockResolvedValue('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
      inputManualProver: jest.fn().mockResolvedValue('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'),
      selectProver: jest.fn().mockResolvedValue(FAKE_UNIVERSAL),
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
    const config: any = { getKeyForChainType: () => undefined };
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

    await expect(
      flow.publish({
        sourceChain: SOURCE_CHAIN,
        destChain: DEST_CHAIN,
        options: { yes: true, recipient: RECIPIENT },
        overrides: FULL_OVERRIDES,
      })
    ).rejects.toThrow(/No private key configured for EVM/);
  });
});
