import { Module } from '@nestjs/common';

import { DisplayModule } from '@/cli/services/display.module';
import { IntentModule } from '@/intent/intent.module';
import { QuoteModule } from '@/quote/quote.module';
import { StatusModule } from '@/status/status.module';

import { DeliveryVerifierService } from './delivery-verifier.service';
import { GasService } from './gas.service';
import { MatrixService } from './matrix.service';
import { WithdrawalVerifierService } from './withdrawal-verifier.service';
import { YellowLifecycleService } from './yellow-lifecycle.service';

@Module({
  imports: [QuoteModule, IntentModule, StatusModule, DisplayModule],
  providers: [
    MatrixService,
    GasService,
    WithdrawalVerifierService,
    DeliveryVerifierService,
    YellowLifecycleService,
  ],
  exports: [MatrixService],
})
export class MatrixModule {}
