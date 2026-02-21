import { Injectable } from '@nestjs/common';

import {
  BlockchainAddress,
  ChainType,
  EvmAddress,
  SvmAddress,
  TronAddress,
  UniversalAddress,
} from '@/shared/types';

import { ChainRegistryService } from './chain-registry.service';

@Injectable()
export class AddressNormalizerService {
  constructor(private readonly registry: ChainRegistryService) {}

  normalize(address: BlockchainAddress, chainType: ChainType): UniversalAddress {
    return this.registry.get(chainType).normalize(address as string);
  }

  denormalize(address: UniversalAddress, chainType: ChainType): BlockchainAddress {
    return this.registry.get(chainType).denormalize(address);
  }

  denormalizeToEvm(address: UniversalAddress): EvmAddress {
    return this.registry.get(ChainType.EVM).denormalize(address) as EvmAddress;
  }

  denormalizeToTvm(address: UniversalAddress): TronAddress {
    return this.registry.get(ChainType.TVM).denormalize(address) as TronAddress;
  }

  denormalizeToSvm(address: UniversalAddress): SvmAddress {
    return this.registry.get(ChainType.SVM).denormalize(address) as SvmAddress;
  }
}
