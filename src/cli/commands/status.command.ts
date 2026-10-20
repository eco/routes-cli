import { Injectable } from '@nestjs/common';

import chalk from 'chalk';
import { Command, CommandRunner, Option } from 'nest-commander';

import { ChainsService } from '@/blockchain/chains.service';
import { ConfigService, GatewayEnv } from '@/config/config.service';
import { RoutesCliError } from '@/shared/errors';
import { IntentStatus, StatusService } from '@/status/status.service';

import { DisplayService } from '../services/display.service';

interface StatusOptions {
  chain?: string;
  env?: GatewayEnv;
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
    private readonly display: DisplayService,
    private readonly config: ConfigService
  ) {
    super();
  }

  async run(inputs: string[], options: StatusOptions): Promise<void> {
    const intentHash = inputs[0];

    if (!intentHash || !intentHash.startsWith('0x') || intentHash.length !== 66) {
      this.display.error('Intent hash must be a 0x-prefixed 64-character hex string');
      process.exit(1);
    }

    // --chain forces the on-chain Portal lookup; otherwise ask the Eco API gateway.
    const chain = options.chain ? this.chains.resolveChain(options.chain) : undefined;
    const lookup = { env: options.env };

    if (!options.json && !options.watch) {
      this.display.title('🔍 Checking Intent Status');
      this.display.log(`Intent Hash: ${intentHash}`);
      if (chain) {
        this.display.log(`Chain: ${chain.name} (${chain.id})`);
      } else {
        const { baseUrl, env } = this.config.getGatewayBaseUrl(options.env);
        this.display.log(`Source: Eco API (${env}, ${baseUrl})`);
      }
    }

    if (options.watch) {
      await this.statusService.watch(
        intentHash,
        chain,
        status => this.displayStatus(status, options),
        lookup
      );
    } else {
      const status = await this.statusService.getStatus(intentHash, chain, lookup);
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
    if (status.state) this.display.log(`Gateway state: ${status.state}`);

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

  @Option({
    flags: '-c, --chain <chain>',
    description:
      'Destination chain (name or ID) — forces the on-chain Portal lookup instead of the Eco API',
  })
  parseChain(val: string): string {
    return val;
  }

  @Option({
    flags: '--env <environment>',
    description: 'Eco API gateway environment: production (default) or staging',
  })
  parseEnv(val: string): GatewayEnv {
    if (val !== 'production' && val !== 'staging') {
      throw RoutesCliError.configurationError(
        `--env must be "production" or "staging", got "${val}".`
      );
    }
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
