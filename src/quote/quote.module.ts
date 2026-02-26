import { Module } from '@nestjs/common';

import { DisplayModule } from '@/cli/services/display.module';

import { QuoteService } from './quote.service';

@Module({
  imports: [DisplayModule],
  providers: [QuoteService],
  exports: [QuoteService],
})
export class QuoteModule {}
