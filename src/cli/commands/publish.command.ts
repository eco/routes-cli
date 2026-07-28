import { Injectable } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';

import { ChainsService } from '@/blockchain/chains.service';
import { getErrorMessage } from '@/commons/utils/error-handler';
import { serialize } from '@/commons/utils/serialize';
import { RoutesCliError } from '@/shared/errors';
import { ChainConfig } from '@/shared/types';

import { DisplayService } from '../services/display.service';
import {
  IntentPublishFlow,
  PublishFlowOptions,
  PublishFlowOverrides,
  PublishFlowResult,
} from '../services/intent-publish-flow.service';
import { PromptService } from '../services/prompt.service';
import { TokenResolverService } from '../services/token-resolver.service';
import { parseAmount } from '../utils/parse-amount';

interface PublishOptions extends PublishFlowOptions {
  source?: string;
  destination?: string;
  routeToken?: string;
  rewardToken?: string;
  routeTokenDecimals?: number;
  rewardTokenDecimals?: number;
  amount?: string;
  routeAmount?: string;
  json?: boolean;
}

@Injectable()
@Command({ name: 'publish', description: 'Publish an intent to the blockchain' })
export class PublishCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly prompt: PromptService,
    private readonly display: DisplayService,
    private readonly flow: IntentPublishFlow,
    private readonly tokenResolver: TokenResolverService
  ) {
    super();
  }

  async run(_params: string[], options: PublishOptions): Promise<void> {
    const jsonMode = options.json === true;
    if (jsonMode) this.display.setJsonMode(true);

    try {
      this.display.title('🎨 Interactive Intent Publishing');

      const allChains = this.chains.listChains();
      const sourceChain = options.source
        ? this.chains.resolveChain(options.source)
        : await this.prompt.selectChain(allChains, 'Select source chain:', '--source <chain>');

      const destChain = options.destination
        ? this.chains.resolveChain(options.destination)
        : await this.prompt.selectChain(
            allChains.filter(c => c.id !== sourceChain.id),
            'Select destination chain:',
            '--destination <chain>'
          );

      const overrides = this.buildOverrides(options, sourceChain, destChain);
      const outcome = await this.flow.publish({ sourceChain, destChain, options, overrides });

      if (jsonMode) this.emitJson(outcome);
    } catch (error) {
      if (jsonMode) {
        process.stdout.write(`${serialize({ success: false, error: getErrorMessage(error) })}\n`);
        process.exitCode = 1;
        return;
      }
      throw error;
    }
  }

  private buildOverrides(
    options: PublishOptions,
    sourceChain: ChainConfig,
    destChain: ChainConfig
  ): PublishFlowOverrides {
    const routeToken = options.routeToken
      ? this.tokenResolver.resolve(options.routeToken, destChain, {
          decimals: options.routeTokenDecimals,
          decimalsFlag: '--route-token-decimals',
        })
      : undefined;

    const rewardToken = options.rewardToken
      ? this.tokenResolver.resolve(options.rewardToken, sourceChain, {
          decimals: options.rewardTokenDecimals,
          decimalsFlag: '--reward-token-decimals',
        })
      : undefined;

    if (options.amount !== undefined && !rewardToken) {
      throw RoutesCliError.configurationError(
        '--amount requires --reward-token (its decimals convert the value to base units).'
      );
    }
    if (options.routeAmount !== undefined && !routeToken) {
      throw RoutesCliError.configurationError(
        '--route-amount requires --route-token (its decimals convert the value to base units).'
      );
    }

    return {
      ...(routeToken && { routeToken }),
      ...(rewardToken && { rewardToken }),
      ...(options.amount !== undefined &&
        rewardToken && {
          rewardAmount: parseAmount(options.amount, rewardToken.decimals, '--amount'),
        }),
      ...(options.routeAmount !== undefined &&
        routeToken && {
          routeAmount: parseAmount(options.routeAmount, routeToken.decimals, '--route-amount'),
        }),
    };
  }

  private emitJson(outcome: PublishFlowResult): void {
    process.stdout.write(
      `${serialize({
        success: true,
        ...(outcome.dryRun && { dryRun: true }),
        ...(outcome.result?.intentHash && { intentHash: outcome.result.intentHash }),
        ...(outcome.result?.transactionHash && { transactionHash: outcome.result.transactionHash }),
        ...(outcome.result?.vaultAddress && { vaultAddress: outcome.result.vaultAddress }),
        sourceChainId: outcome.sourceChainId,
        destinationChainId: outcome.destinationChainId,
        recipient: outcome.recipient,
      })}\n`
    );
  }

  @Option({ flags: '-s, --source <chain>', description: 'Source chain name or ID' })
  parseSource(val: string): string {
    return val;
  }

  @Option({ flags: '-d, --destination <chain>', description: 'Destination chain name or ID' })
  parseDestination(val: string): string {
    return val;
  }

  @Option({
    flags: '--route-token <symbolOrAddress>',
    description: 'Token delivered on the destination chain (symbol from `tokens`, or raw address)',
  })
  parseRouteToken(val: string): string {
    return val;
  }

  @Option({
    flags: '--reward-token <symbolOrAddress>',
    description: 'Token paid on the source chain (symbol from `tokens`, or raw address)',
  })
  parseRewardToken(val: string): string {
    return val;
  }

  @Option({
    flags: '--route-token-decimals <n>',
    description: 'Token decimals; required when --route-token is a raw address',
  })
  parseRouteTokenDecimals(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--reward-token-decimals <n>',
    description: 'Token decimals; required when --reward-token is a raw address',
  })
  parseRewardTokenDecimals(val: string): number {
    return parseInt(val, 10);
  }

  @Option({
    flags: '--amount <value>',
    description: 'Reward amount in human units, e.g. "5" (requires --reward-token)',
  })
  parseAmountFlag(val: string): string {
    return val;
  }

  @Option({
    flags: '--route-amount <value>',
    description:
      'Route amount in human units for the quote-failure fallback (requires --route-token)',
  })
  parseRouteAmount(val: string): string {
    return val;
  }

  @Option({ flags: '-k, --private-key <key>', description: 'EVM private key (overrides env)' })
  parsePrivateKey(val: string): string {
    return val;
  }

  @Option({ flags: '--private-key-tvm <key>', description: 'TVM private key (overrides env)' })
  parsePrivateKeyTvm(val: string): string {
    return val;
  }

  @Option({ flags: '--private-key-svm <key>', description: 'SVM private key (overrides env)' })
  parsePrivateKeySvm(val: string): string {
    return val;
  }

  @Option({ flags: '--recipient <address>', description: 'Recipient address on destination chain' })
  parseRecipient(val: string): string {
    return val;
  }

  @Option({
    flags: '--portal-address <address>',
    description: 'Portal contract address on the source chain',
  })
  parsePortalAddress(val: string): string {
    return val;
  }

  @Option({
    flags: '--prover-address <address>',
    description: 'Prover contract address on the source chain',
  })
  parseProverAddress(val: string): string {
    return val;
  }

  @Option({
    flags: '--prover-type <name>',
    description: "Prover type to use (e.g. 'LayerZero', 'Hyperlane')",
  })
  parseProverType(val: string): string {
    return val;
  }

  @Option({ flags: '--dry-run', description: 'Validate and build everything without broadcasting' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-y, --yes', description: 'Skip the confirmation prompt' })
  parseYes(): boolean {
    return true;
  }

  @Option({
    flags: '--json',
    description: 'Machine-readable output: one JSON object on stdout, human logs on stderr',
  })
  parseJson(): boolean {
    return true;
  }

  @Option({ flags: '-w, --watch', description: 'Watch for fulfillment after publishing' })
  parseWatch(): boolean {
    return true;
  }
}
