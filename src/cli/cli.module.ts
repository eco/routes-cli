import { Module } from '@nestjs/common';
import { QuoteModule } from '@/quote/quote.module';
import { IntentModule } from '@/intent/intent.module';
import { StatusModule } from '@/status/status.module';
import { PromptService } from './services/prompt.service';
import { DisplayService } from './services/display.service';
import { PublishCommand } from './commands/publish.command';
import { StatusCommand } from './commands/status.command';
import { ConfigCommand } from './commands/config.command';
import { ChainsCommand } from './commands/chains.command';
import { TokensCommand } from './commands/tokens.command';

@Module({
  imports: [QuoteModule, IntentModule, StatusModule],
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
