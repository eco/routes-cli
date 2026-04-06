import { Module } from '@nestjs/common';

import { DisplayService } from './display.service';

@Module({
  providers: [DisplayService],
  exports: [DisplayService],
})
export class DisplayModule {}
