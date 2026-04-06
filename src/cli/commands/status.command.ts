import { Injectable } from '@nestjs/common';

import chalk from 'chalk';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ChainsService } from '@/blockchain/chains.service';
import { IntentStatus, StatusService } from '@/status/status.service';

import { DisplayService } from '../services/display.service';

interface StatusOptions {
  chain?: string;
  watch?: boolean;
  json?: boolean;
  verbose?: boolean;
}

@Injectable()
@Command({
  name: 'status',
  description: 'Check the fulfillment status of an intent',
  arguments: '<intentHash>',
})
export class StatusCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly statusService: StatusService,
    private readonly display: DisplayService
  ) {
    super();
  }

  async run(inputs: string[], options: StatusOptions): Promise<void> {
    const intentHash = inputs[0];

    if (!intentHash || !intentHash.startsWith('0x') || intentHash.length !== 66) {
      this.display.error('Intent hash must be a 0x-prefixed 64-character hex string');
      process.exit(1);
    }

    if (!options.chain) {
      this.display.error('Destination chain is required. Use --chain option.');
      process.exit(1);
    }

    const chain = this.chains.resolveChain(options.chain);

    if (!options.json && !options.watch) {
      this.display.title('🔍 Checking Intent Status');
      this.display.log(`Intent Hash: ${intentHash}`);
      this.display.log(`Chain: ${chain.name} (${chain.id})`);
    }

    if (options.watch) {
      await this.statusService.watch(
        intentHash,
        chain,
        status => this.displayStatus(status, options),
        {}
      );
    } else {
      const status = await this.statusService.getStatus(intentHash, chain);
      this.displayStatus(status, options);
    }
  }

  private displayStatus(status: IntentStatus, options: StatusOptions): void {
    if (options.json) {
      console.log(JSON.stringify(status, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
      return;
    }

    const statusText = status.fulfilled ? chalk.green('✅ Fulfilled') : chalk.yellow('⏳ Pending');
    this.display.log(`Status: ${statusText}`);

    if (status.fulfilled) {
      if (status.solver) this.display.log(`Solver: ${status.solver}`);
      if (status.fulfillmentTxHash) this.display.log(`Tx: ${status.fulfillmentTxHash}`);
      if (status.blockNumber) this.display.log(`Block: ${status.blockNumber.toString()}`);
      if (status.timestamp)
        this.display.log(`Time: ${new Date(status.timestamp * 1000).toLocaleString()}`);
    } else {
      this.display.log('The intent has not been fulfilled yet.');
    }
  }

  @Option({ flags: '-c, --chain <chain>', description: 'Destination chain (name or ID)' })
  parseChain(val: string): string {
    return val;
  }

  @Option({ flags: '-w, --watch', description: 'Poll every 10 seconds until fulfilled' })
  parseWatch(): boolean {
    return true;
  }

  @Option({ flags: '--json', description: 'Output result as JSON' })
  parseJson(): boolean {
    return true;
  }

  @Option({ flags: '--verbose', description: 'Show portal address and raw transaction details' })
  parseVerbose(): boolean {
    return true;
  }
}
