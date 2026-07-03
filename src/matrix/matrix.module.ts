import { Module } from '@nestjs/common';

import { DisplayModule } from '@/cli/services/display.module';
import { IntentModule } from '@/intent/intent.module';
import { QuoteModule } from '@/quote/quote.module';
import { StatusModule } from '@/status/status.module';

import { GasService } from './gas.service';
import { MatrixService } from './matrix.service';

@Module({
  imports: [QuoteModule, IntentModule, StatusModule, DisplayModule],
  providers: [MatrixService, GasService],
  exports: [MatrixService],
})
export class MatrixModule {}
