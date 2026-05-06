import { Injectable } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';

import { ChainsService } from '@/blockchain/chains.service';

import { DisplayService } from '../services/display.service';
import { IntentPublishFlow, PublishFlowOptions } from '../services/intent-publish-flow.service';
import { PromptService } from '../services/prompt.service';

interface PublishOptions extends PublishFlowOptions {
  source?: string;
  destination?: string;
  rpc?: string;
}

@Injectable()
@Command({ name: 'publish', description: 'Publish an intent to the blockchain' })
export class PublishCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly prompt: PromptService,
    private readonly display: DisplayService,
    private readonly flow: IntentPublishFlow
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

    await this.flow.publish({ sourceChain, destChain, options });
  }

  @Option({ flags: '-s, --source <chain>', description: 'Source chain name or ID' })
  parseSource(val: string): string {
    return val;
  }

  @Option({ flags: '-d, --destination <chain>', description: 'Destination chain name or ID' })
  parseDestination(val: string): string {
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

  @Option({ flags: '-r, --rpc <url>', description: 'RPC URL override' })
  parseRpc(val: string): string {
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

  @Option({ flags: '--dry-run', description: 'Validate without broadcasting' })
  parseDryRun(): boolean {
    return true;
  }

  @Option({ flags: '-w, --watch', description: 'Watch for fulfillment after publishing' })
  parseWatch(): boolean {
    return true;
  }
}
