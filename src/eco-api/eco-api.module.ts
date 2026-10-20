import { Module } from '@nestjs/common';

import { DisplayModule } from '@/cli/services/display.module';

import { EcoApiClient } from './eco-api.client';

@Module({
  imports: [DisplayModule],
  providers: [EcoApiClient],
  exports: [EcoApiClient],
})
export class EcoApiModule {}
