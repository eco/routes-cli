import { Injectable } from '@nestjs/common';

import { Command, CommandRunner } from 'nest-commander';

import { TOKENS } from '@/config/tokens.config';

import { DisplayService } from '../services/display.service';

@Injectable()
@Command({ name: 'tokens', description: 'List configured tokens' })
export class TokensCommand extends CommandRunner {
  constructor(private readonly display: DisplayService) {
    super();
  }

  run(): Promise<void> {
    this.display.displayTokens(Object.values(TOKENS));
    return Promise.resolve();
  }
}
