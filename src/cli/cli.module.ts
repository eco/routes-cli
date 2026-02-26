import { Module } from '@nestjs/common';

import { IntentModule } from '@/intent/intent.module';
import { QuoteModule } from '@/quote/quote.module';
import { StatusModule } from '@/status/status.module';

import { ChainsCommand } from './commands/chains.command';
import { ConfigCommand } from './commands/config.command';
import { PublishCommand } from './commands/publish.command';
import { StatusCommand } from './commands/status.command';
import { TokensCommand } from './commands/tokens.command';
import { DisplayModule } from './services/display.module';
import { PromptService } from './services/prompt.service';

@Module({
  imports: [QuoteModule, IntentModule, StatusModule, DisplayModule],
  providers: [
    PromptService,
    PublishCommand,
    StatusCommand,
    ConfigCommand,
    ChainsCommand,
    TokensCommand,
  ],
})
export class CliModule {}
