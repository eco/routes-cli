import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { BlockchainModule } from './blockchain/blockchain.module';
import { IntentModule } from './intent/intent.module';
import { QuoteModule } from './quote/quote.module';
import { StatusModule } from './status/status.module';
import { CliModule } from './cli/cli.module';

@Module({
  imports: [
    ConfigModule,
    BlockchainModule,
    IntentModule,
    QuoteModule,
    StatusModule,
    CliModule,
  ],
})
export class AppModule {}
