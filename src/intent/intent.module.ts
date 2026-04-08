import { Module } from '@nestjs/common';

import { IntentBuilder } from './intent-builder.service';
import { IntentStorage } from './intent-storage.service';

@Module({
  providers: [IntentBuilder, IntentStorage],
  exports: [IntentBuilder, IntentStorage],
})
export class IntentModule {}
