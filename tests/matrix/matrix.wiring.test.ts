import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { BlockchainModule } from '@/blockchain/blockchain.module';
import { ConfigModule } from '@/config/config.module';
import { GasService } from '@/matrix/gas.service';
import { MatrixModule } from '@/matrix/matrix.module';
import { MatrixService } from '@/matrix/matrix.service';

import 'reflect-metadata';

// A minimal host module that wires MatrixModule against the real Blockchain +
// Config DI graph (excludes the CLI module, whose inquirer import is ESM-only
// and cannot be transformed by jest). This proves MatrixService's dependency
// graph — QuoteService, PublisherFactory, StatusService, IntentBuilder,
// GasService, ChainsService — resolves.
@Module({ imports: [ConfigModule, BlockchainModule, MatrixModule] })
class TestHostModule {}

describe('Matrix DI wiring', () => {
  it('resolves MatrixService and GasService with all dependencies', async () => {
    const app = await NestFactory.createApplicationContext(TestHostModule, { logger: false });
    expect(app.get(MatrixService)).toBeInstanceOf(MatrixService);
    expect(app.get(GasService)).toBeInstanceOf(GasService);
    await app.close();
  });
});
