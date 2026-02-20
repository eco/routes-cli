import { Command, CommandRunner } from 'nest-commander';
import { Injectable } from '@nestjs/common';
import { DisplayService } from '../services/display.service';
import { TOKENS } from '@/config/tokens.config';

@Injectable()
@Command({ name: 'tokens', description: 'List configured tokens' })
export class TokensCommand extends CommandRunner {
  constructor(private readonly display: DisplayService) { super(); }

  async run(): Promise<void> {
    this.display.displayTokens(Object.values(TOKENS));
  }
}
