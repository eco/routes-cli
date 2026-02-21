import { Injectable } from '@nestjs/common';

import { Command, CommandRunner } from 'nest-commander';

import { ChainsService } from '@/blockchain/chains.service';

import { DisplayService } from '../services/display.service';

@Injectable()
@Command({ name: 'chains', description: 'List supported chains' })
export class ChainsCommand extends CommandRunner {
  constructor(
    private readonly chains: ChainsService,
    private readonly display: DisplayService
  ) {
    super();
  }

  run(): Promise<void> {
    this.display.displayChains(this.chains.listChains());
    return Promise.resolve();
  }
}
