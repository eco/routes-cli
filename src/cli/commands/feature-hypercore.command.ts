import { Injectable } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';
import { hyperEvm } from 'viem/chains';

import { ChainsService } from '@/blockchain/chains.service';

import { DisplayService } from '../services/display.service';
import { IntentPublishFlow, PublishFlowOptions } from '../services/intent-publish-flow.service';
import { PromptService } from '../services/prompt.service';

const HYPERCORE_CHAIN_ID = 1337n;
const HYPER_EVM_CHAIN_ID = BigInt(hyperEvm.id);

interface FeatureHypercoreOptions extends PublishFlowOptions {
  source?: string;
}

@Injectable()
@Command({
  name: 'feature:hypercore',
  description: 'Publish an intent that deposits into Hypercore on fulfillment',
})
export class FeatureHypercoreCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly prompt: PromptService,
    private readonly display: DisplayService,
    private readonly flow: IntentPublishFlow
  ) {
    super();
  }

  async run(_params: string[], options: FeatureHypercoreOptions): Promise<void> {
    this.display.title('🎯 Hypercore Deposit Intent');

    const allChains = this.chains.listChains();
    const sourceChain = options.source
      ? this.chains.resolveChain(options.source)
      : await this.prompt.selectChain(
          allChains.filter(c => c.id !== HYPER_EVM_CHAIN_ID),
          'Select source chain:'
        );

    if (sourceChain.id === HYPER_EVM_CHAIN_ID) {
      throw new Error('HyperEVM cannot be a source for a Hypercore deposit intent.');
    }

    // Operationally publish/watch on hyperEVM (real RPC, real portal, real
    // tokens). The Hypercore tag (1337) goes on the quote request only — the
    // signal to the solver pipeline that this should be priced/handled as a
    // Hypercore deposit. The on-chain intent stays a regular hyperEVM intent.
    const destChain = this.chains.getChainById(HYPER_EVM_CHAIN_ID);

    await this.flow.publish({
      sourceChain,
      destChain,
      options,
      overrides: { quoteDestinationChainIdOverride: HYPERCORE_CHAIN_ID },
    });
  }

  @Option({ flags: '-s, --source <chain>', description: 'Source chain name or ID' })
  parseSource(val: string): string {
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

  @Option({ flags: '--recipient <address>', description: 'Recipient address on hyperEVM' })
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
