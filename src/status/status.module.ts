import { Module } from '@nestjs/common';

import { EcoApiModule } from '@/eco-api/eco-api.module';

import { StatusService } from './status.service';

@Module({
  imports: [EcoApiModule],
  providers: [StatusService],
  exports: [StatusService],
})
export class StatusModule {}
