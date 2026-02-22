import { Injectable } from '@nestjs/common';

import { Keypair } from '@solana/web3.js';
import { Command, CommandRunner, Option } from 'nest-commander';
import { TronWeb } from 'tronweb';
import { Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainsService } from '@/blockchain/chains.service';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { ConfigService } from '@/config/config.service';
import { TOKEN_CONFIGS } from '@/config/tokens.config';
import { IntentBuilder } from '@/intent/intent-builder.service';
import { IntentStorage } from '@/intent/intent-storage.service';
import { QuoteService } from '@/quote/quote.service';
import { KeyHandle } from '@/shared/security';
import { ChainType, Intent } from '@/shared/types';

import { DisplayService } from '../services/display.service';
import { PromptService } from '../services/prompt.service';

function deriveAddress(key: string, chainType: ChainType): string {
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

interface PublishOptions {
  source?: string;
  destination?: string;
  privateKey?: string;
  rpc?: string;
  recipient?: string;
  dryRun?: boolean;
}

@Injectable()
@Command({ name: 'publish', description: 'Publish an intent to the blockchain' })
export class PublishCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly publisherFactory: PublisherFactory,
    private readonly quoteService: QuoteService,
    private readonly intentBuilder: IntentBuilder,
    private readonly intentStorage: IntentStorage,
    private readonly prompt: PromptService,
    private readonly display: DisplayService
  ) {
    super();
  }

  async run(_params: string[], options: PublishOptions): Promise<void> {
    this.display.title('🎨 Interactive Intent Publishing');

    const allChains = this.chains.listChains();
    const sourceChain = options.source
      ? this.chains.resolveChain(options.source)
      : await this.prompt.selectChain(allChains, 'Select source chain:');

    const destChain = options.destination
      ? this.chains.resolveChain(options.destination)
      : await this.prompt.selectChain(
          allChains.filter(c => c.id !== sourceChain.id),
          'Select destination chain:'
        );

    const tokens = Object.values(TOKEN_CONFIGS);

    this.display.section('📏 Route Configuration (Destination Chain)');
    const routeToken = await this.prompt.selectToken(destChain, tokens, 'route');

    this.display.section('💰 Reward Configuration (Source Chain)');
    const rewardToken = await this.prompt.selectToken(sourceChain, tokens, 'reward');
    const { parsed: rewardAmount } = await this.prompt.inputAmount(
      rewardToken.symbol ?? 'tokens',
      rewardToken.decimals
    );

    this.display.section('👤 Recipient Configuration');
    const destKey = this.config.getKeyForChainType(destChain.type);
    const recipientDefault = destKey ? deriveAddress(destKey, destChain.type) : undefined;
    const recipientRaw =
      options.recipient ??
      (await this.prompt.inputAddress(destChain, 'recipient', recipientDefault));
    const recipient = this.normalizer.normalize(
      recipientRaw as Parameters<typeof this.normalizer.normalize>[0],
      destChain.type
    );

    const rawKey = options.privateKey ?? this.config.getKeyForChainType(sourceChain.type) ?? '';
    const keyHandle = new KeyHandle(rawKey);

    // Derive sender address synchronously, then keep async key handle for publisher
    let senderAddress: string;
    const publishKeyHandle = new KeyHandle(rawKey);
    keyHandle.use(key => {
      senderAddress = deriveAddress(key, sourceChain.type);
    });

    // Quote or fallback
    let encodedRoute: string;
    let sourcePortal = sourceChain.portalAddress!;
    let proverAddress = sourceChain.proverAddress!;

    try {
      this.display.spinner('Getting quote...');
      const quote = await this.quoteService.getQuote({
        source: sourceChain.id,
        destination: destChain.id,
        amount: rewardAmount,
        funder: senderAddress!,
        recipient: recipientRaw,
        routeToken: routeToken.address,
        rewardToken: rewardToken.address,
      });
      this.display.succeed('Quote received');
      encodedRoute = quote.encodedRoute;
      sourcePortal = this.normalizer.normalize(
        quote.sourcePortal as Parameters<typeof this.normalizer.normalize>[0],
        sourceChain.type
      );
      proverAddress = this.normalizer.normalize(
        quote.prover as Parameters<typeof this.normalizer.normalize>[0],
        sourceChain.type
      );
    } catch (error) {
      console.error(error);
      this.display.warn('Quote service unavailable — using manual configuration');

      const { parsed: routeAmount } = await this.prompt.inputAmount(
        routeToken.symbol ?? 'tokens',
        routeToken.decimals
      );

      const destPortal = destChain.portalAddress!;
      const routeTokenUniversal = this.normalizer.normalize(
        routeToken.address as Parameters<typeof this.normalizer.normalize>[0],
        destChain.type
      );

      const { encodedRoute: manualEncodedRoute } = this.intentBuilder.buildManualRoute({
        destChain,
        recipient,
        routeToken: routeTokenUniversal,
        routeAmount,
        portal: destPortal,
      });
      encodedRoute = manualEncodedRoute;
    }

    const rewardTokenUniversal = this.normalizer.normalize(
      rewardToken.address as Parameters<typeof this.normalizer.normalize>[0],
      sourceChain.type
    );

    const reward = this.intentBuilder.buildReward({
      sourceChain,
      creator: this.normalizer.normalize(
        senderAddress! as Parameters<typeof this.normalizer.normalize>[0],
        sourceChain.type
      ),
      prover: proverAddress,
      rewardToken: rewardTokenUniversal,
      rewardAmount,
    });

    // Display summary + confirm
    const confirmed = await this.prompt.confirmPublish();
    if (!confirmed) throw new Error('Publication cancelled by user');

    if (options.dryRun) {
      this.display.warning('Dry run — not publishing');
      return;
    }

    this.display.spinner('Publishing intent to blockchain...');
    const publisher = this.publisherFactory.create(sourceChain);
    const result = await publisher.publish(
      sourceChain.id,
      destChain.id,
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
      destination: destChain.id,
      sourceChainId: sourceChain.id,
      route: {} as Intent['route'],
      reward,
    };
    await this.intentStorage.save(intent, result);
    this.display.succeed('Intent published!');
    this.display.displayTransactionResult(result);

    void recipient; // used in reward/route construction
  }

  @Option({ flags: '-s, --source <chain>', description: 'Source chain name or ID' })
  parseSource(val: string): string {
    return val;
  }

  @Option({ flags: '-d, --destination <chain>', description: 'Destination chain name or ID' })
  parseDestination(val: string): string {
    return val;
  }

  @Option({ flags: '-k, --private-key <key>', description: 'Private key override' })
  parsePrivateKey(val: string): string {
    return val;
  }

  @Option({ flags: '-r, --rpc <url>', description: 'RPC URL override' })
  parseRpc(val: string): string {
    return val;
  }

  @Option({ flags: '--recipient <address>', description: 'Recipient address on destination chain' })
  parseRecipient(val: string): string {
    return val;
  }

  @Option({ flags: '--dry-run', description: 'Validate without broadcasting' })
  parseDryRun(): boolean {
    return true;
  }
}
