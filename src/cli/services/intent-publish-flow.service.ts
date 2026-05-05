import { Injectable } from '@nestjs/common';

import { Keypair } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { PublishResult } from '@/blockchain/base.publisher';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { ConfigService } from '@/config/config.service';
import { TOKEN_CONFIGS } from '@/config/tokens.config';
import { IntentBuilder } from '@/intent/intent-builder.service';
import { IntentStorage } from '@/intent/intent-storage.service';
import { QuoteResult, QuoteService } from '@/quote/quote.service';
import { KeyHandle } from '@/shared/security';
import {
  BlockchainAddress,
  ChainConfig,
  ChainType,
  Intent,
  UniversalAddress,
} from '@/shared/types';
import { IntentStatus, StatusService } from '@/status/status.service';

import { DisplayService } from './display.service';
import { PromptService } from './prompt.service';

export interface PublishFlowOptions {
  privateKey?: string;
  privateKeyTvm?: string;
  privateKeySvm?: string;
  recipient?: string;
  portalAddress?: string;
  proverAddress?: string;
  dryRun?: boolean;
  watch?: boolean;
}

export interface TokenSelection {
  address: string;
  decimals: number;
  symbol?: string;
}

// Each field, if set, skips the corresponding interactive prompt. Used by
// feature commands that want opinionated defaults (e.g. always-USDC).
export interface PublishFlowOverrides {
  rewardToken?: TokenSelection;
  routeToken?: TokenSelection;
  rewardAmount?: bigint;
  recipientRaw?: string;
}

export interface PublishFlowResult {
  result: PublishResult;
  intent: Intent;
}

@Injectable()
export class IntentPublishFlow {
  constructor(
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly publisherFactory: PublisherFactory,
    private readonly quoteService: QuoteService,
    private readonly intentBuilder: IntentBuilder,
    private readonly intentStorage: IntentStorage,
    private readonly prompt: PromptService,
    private readonly display: DisplayService,
    private readonly statusService: StatusService
  ) {}

  async publish(args: {
    sourceChain: ChainConfig;
    destChain: ChainConfig;
    options: PublishFlowOptions;
    overrides?: PublishFlowOverrides;
  }): Promise<PublishFlowResult | null> {
    const { sourceChain, destChain, options, overrides = {} } = args;
    const tokens = Object.values(TOKEN_CONFIGS);

    this.display.section('📏 Route Configuration (Destination Chain)');
    const routeToken =
      overrides.routeToken ?? (await this.prompt.selectToken(destChain, tokens, 'route'));

    this.display.section('💰 Reward Configuration (Source Chain)');
    const rewardToken =
      overrides.rewardToken ?? (await this.prompt.selectToken(sourceChain, tokens, 'reward'));
    const rewardAmount =
      overrides.rewardAmount ??
      (await this.prompt.inputAmount(rewardToken.symbol ?? 'tokens', rewardToken.decimals)).parsed;

    this.display.section('👤 Recipient Configuration');
    const recipientRaw = await this.resolveRecipientRaw(destChain, options, overrides);
    const recipient = this.normalizer.normalize(
      recipientRaw as Parameters<AddressNormalizerService['normalize']>[0],
      destChain.type
    );

    const { publishKeyHandle, senderAddress } = this.resolveSender(sourceChain, options);

    const {
      encodedRoute,
      sourcePortal: portalFromQuote,
      proverAddress: proverFromQuote,
      quote,
    } = await this.fetchQuoteOrManualRoute({
      sourceChain,
      destChain,
      rewardToken,
      routeToken,
      rewardAmount,
      senderAddress,
      recipientRaw,
      recipient,
    });

    const sourcePortal = await this.resolveSourcePortal(sourceChain, portalFromQuote, options);
    const proverAddress = await this.resolveProver(sourceChain, proverFromQuote, options);

    const rewardTokenUniversal = this.normalizer.normalize(
      rewardToken.address as Parameters<AddressNormalizerService['normalize']>[0],
      sourceChain.type
    );

    const reward = this.intentBuilder.buildReward({
      sourceChain,
      deadline: quote?.deadline,
      creator: this.normalizer.normalize(
        senderAddress as Parameters<AddressNormalizerService['normalize']>[0],
        sourceChain.type
      ),
      prover: proverAddress,
      rewardToken: rewardTokenUniversal,
      rewardAmount,
    });

    const confirmed = await this.prompt.confirmPublish();
    if (!confirmed) throw new Error('Publication cancelled by user');

    if (options.dryRun) {
      this.display.warning('Dry run — not publishing');
      return null;
    }

    const destinationChainId = quote?.destinationChainId
      ? BigInt(quote.destinationChainId)
      : destChain.id;

    const publisher = this.publisherFactory.create(sourceChain);
    const result = await publisher.publish(
      sourceChain.id,
      destinationChainId,
      reward,
      encodedRoute,
      publishKeyHandle,
      sourcePortal
    );

    if (!result.success) {
      this.display.fail('Publishing failed');
      throw new Error(result.error);
    }

    const intent: Intent = {
      destination: destinationChainId,
      sourceChainId: sourceChain.id,
      route: {} as Intent['route'],
      reward,
    };
    await this.intentStorage.save(intent, result);
    this.display.succeed('Intent published!');
    this.display.displayTransactionResult(result);

    if (options.watch === true && result.intentHash) {
      await this.runWatchFlow(result.intentHash, destChain, quote);
    }

    return { result, intent };
  }

  private async resolveRecipientRaw(
    destChain: ChainConfig,
    options: PublishFlowOptions,
    overrides: PublishFlowOverrides
  ): Promise<string> {
    if (overrides.recipientRaw) return overrides.recipientRaw;
    if (options.recipient) return options.recipient;
    const destKey =
      IntentPublishFlow.resolveKey(options, destChain.type) ??
      this.config.getKeyForChainType(destChain.type);
    const recipientDefault = destKey
      ? IntentPublishFlow.deriveAddress(destKey, destChain.type)
      : undefined;
    return this.prompt.inputAddress(destChain, 'recipient', recipientDefault);
  }

  private resolveSender(
    sourceChain: ChainConfig,
    options: PublishFlowOptions
  ): { publishKeyHandle: KeyHandle; senderAddress: string } {
    const rawKey =
      IntentPublishFlow.resolveKey(options, sourceChain.type) ??
      this.config.getKeyForChainType(sourceChain.type) ??
      '';
    // One handle for the sync sender-address derivation (consumed below), one
    // for the async publisher.publish() call which needs its own copy.
    const senderHandle = new KeyHandle(rawKey);
    const publishKeyHandle = new KeyHandle(rawKey);
    const senderAddress = senderHandle.use(key =>
      IntentPublishFlow.deriveAddress(key, sourceChain.type)
    );
    return { publishKeyHandle, senderAddress };
  }

  private async fetchQuoteOrManualRoute(args: {
    sourceChain: ChainConfig;
    destChain: ChainConfig;
    rewardToken: TokenSelection;
    routeToken: TokenSelection;
    rewardAmount: bigint;
    senderAddress: string;
    recipientRaw: string;
    recipient: UniversalAddress;
  }): Promise<{
    encodedRoute: string;
    sourcePortal?: UniversalAddress;
    proverAddress?: UniversalAddress;
    quote?: QuoteResult;
  }> {
    const {
      sourceChain,
      destChain,
      rewardToken,
      routeToken,
      rewardAmount,
      senderAddress,
      recipientRaw,
      recipient,
    } = args;

    try {
      this.display.spinner('Getting quote...');
      const quote = await this.quoteService.getQuote({
        source: sourceChain.id,
        destination: destChain.id,
        amount: rewardAmount,
        funder: senderAddress,
        recipient: recipientRaw,
        routeToken: routeToken.address,
        rewardToken: rewardToken.address,
      });
      this.display.succeed('Quote received');
      this.display.displayQuote(quote, rewardToken, rewardAmount, routeToken);
      const sourcePortal = this.normalizer.normalize(
        quote.sourcePortal as Parameters<AddressNormalizerService['normalize']>[0],
        sourceChain.type
      );
      const proverAddress = this.normalizer.normalize(
        quote.prover as Parameters<AddressNormalizerService['normalize']>[0],
        sourceChain.type
      );
      return { encodedRoute: quote.encodedRoute, sourcePortal, proverAddress, quote };
    } catch (error) {
      console.error(error);
      this.display.warn('Quote service unavailable — using manual configuration');

      const { parsed: routeAmount } = await this.prompt.inputAmount(
        routeToken.symbol ?? 'tokens',
        routeToken.decimals
      );

      const destPortal = destChain.portalAddress;
      if (!destPortal) {
        throw new Error(
          `Cannot fall back to manual route: no portal address configured for ${destChain.name}.`
        );
      }
      const routeTokenUniversal = this.normalizer.normalize(
        routeToken.address as Parameters<AddressNormalizerService['normalize']>[0],
        destChain.type
      );

      const { encodedRoute } = this.intentBuilder.buildManualRoute({
        destChain,
        recipient,
        routeToken: routeTokenUniversal,
        routeAmount,
        portal: destPortal,
      });
      return { encodedRoute };
    }
  }

  // Source portal priority: quote → CLI option → manual prompt.
  private async resolveSourcePortal(
    sourceChain: ChainConfig,
    fromQuote: UniversalAddress | undefined,
    options: PublishFlowOptions
  ): Promise<UniversalAddress> {
    if (fromQuote) return fromQuote;
    if (options.portalAddress) {
      return this.normalizer.normalize(
        options.portalAddress as Parameters<AddressNormalizerService['normalize']>[0],
        sourceChain.type
      );
    }
    const raw = await this.prompt.inputManualPortal(sourceChain);
    return this.normalizer.normalize(
      raw as Parameters<AddressNormalizerService['normalize']>[0],
      sourceChain.type
    );
  }

  // Prover priority: quote → CLI option → chain config default → manual prompt.
  private async resolveProver(
    sourceChain: ChainConfig,
    fromQuote: UniversalAddress | undefined,
    options: PublishFlowOptions
  ): Promise<UniversalAddress> {
    if (fromQuote) return fromQuote;
    if (options.proverAddress) {
      return this.normalizer.normalize(
        options.proverAddress as Parameters<AddressNormalizerService['normalize']>[0],
        sourceChain.type
      );
    }
    if (sourceChain.proverAddress) return sourceChain.proverAddress;
    const raw = await this.prompt.inputManualProver(sourceChain);
    return this.normalizer.normalize(
      raw as Parameters<AddressNormalizerService['normalize']>[0],
      sourceChain.type
    );
  }

  private async runWatchFlow(
    intentHash: string,
    destChain: ChainConfig,
    quote: QuoteResult | undefined
  ): Promise<void> {
    if (destChain.type !== ChainType.EVM) {
      this.display.log(`Fulfillment watching not yet supported for ${destChain.type} chains.`);
      return;
    }

    const timeoutMultiplier = 3;
    const estimatedSec = quote?.estimatedFulfillTimeSec ?? 300;
    const timeoutMs = estimatedSec * timeoutMultiplier * 1000;

    this.display.spinner(`Watching for fulfillment on ${destChain.name}...`);

    const watchChain = quote?.destinationPortalAddress
      ? {
          ...destChain,
          portalAddress: this.normalizer.normalize(
            quote.destinationPortalAddress as BlockchainAddress,
            destChain.type
          ),
        }
      : destChain;

    let finalStatus: IntentStatus | null = null;
    const outcome = await this.statusService.watch(
      intentHash,
      watchChain,
      status => {
        finalStatus = status;
      },
      { timeoutMs }
    );

    if (outcome === 'fulfilled' && finalStatus) {
      this.display.succeed('Intent fulfilled!');
      this.display.displayFulfillmentResult(finalStatus);
    } else {
      this.display.warn(
        `Not fulfilled within ${estimatedSec * timeoutMultiplier}s — check manually: ` +
          `routes status ${intentHash} --chain ${destChain.name}`
      );
    }
  }

  private static resolveKey(options: PublishFlowOptions, chainType: ChainType): string | undefined {
    switch (chainType) {
      case ChainType.EVM:
        return options.privateKey;
      case ChainType.TVM:
        return options.privateKeyTvm;
      case ChainType.SVM:
        return options.privateKeySvm;
    }
  }

  private static deriveAddress(key: string, chainType: ChainType): string {
    switch (chainType) {
      case ChainType.EVM:
        return privateKeyToAccount(key as Hex).address;
      case ChainType.TVM:
        return TronWeb.address.fromPrivateKey(key) as string;
      case ChainType.SVM: {
        let keypair: Keypair;
        if (key.startsWith('[') && key.endsWith(']')) {
          keypair = Keypair.fromSecretKey(new Uint8Array(JSON.parse(key) as number[]));
        } else if (key.includes(',')) {
          keypair = Keypair.fromSecretKey(
            new Uint8Array(key.split(',').map(b => parseInt(b.trim())))
          );
        } else {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const bs58 = require('bs58') as { decode: (s: string) => Uint8Array };
          keypair = Keypair.fromSecretKey(bs58.decode(key));
        }
        return keypair.publicKey.toBase58();
      }
    }
  }
}
