import { Module } from '@nestjs/common';
import { PromptService } from './services/prompt.service';
import { DisplayService } from './services/display.service';
import { PublishCommand } from './commands/publish.command';
import { StatusCommand } from './commands/status.command';
import { ConfigCommand } from './commands/config.command';
import { ChainsCommand } from './commands/chains.command';
import { TokensCommand } from './commands/tokens.command';

@Module({
  providers: [
    PromptService,
    DisplayService,
    PublishCommand,
    StatusCommand,
    ConfigCommand,
    ChainsCommand,
    TokensCommand,
  ],
})
export class CliModule {}
