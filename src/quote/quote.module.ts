import { Module } from '@nestjs/common';

import { DisplayModule } from '@/cli/services/display.module';
import { EcoApiModule } from '@/eco-api/eco-api.module';

import { QuoteService } from './quote.service';

@Module({
  imports: [DisplayModule, EcoApiModule],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
