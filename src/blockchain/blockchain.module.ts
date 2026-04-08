import { Global, Module } from '@nestjs/common';

import { ConfigModule } from '@/config/config.module';

import { IntentConverterService } from './encoding/intent-converter.service';
import { PortalEncoderService } from './encoding/portal-encoder.service';
import { AddressNormalizerService } from './address-normalizer.service';
import { ChainRegistryService } from './chain-registry.service';
import { ChainsService } from './chains.service';
import { PublisherFactory } from './publisher-factory.service';
import { RpcService } from './rpc.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    ChainRegistryService,
    AddressNormalizerService,
    ChainsService,
    RpcService,
    PublisherFactory,
    PortalEncoderService,
    IntentConverterService,
  ],
  exports: [
    ChainRegistryService,
    AddressNormalizerService,
    ChainsService,
    RpcService,
    PublisherFactory,
    PortalEncoderService,
    IntentConverterService,
  ],
})
export class BlockchainModule {}
