import { Injectable } from '@nestjs/common';
import { ChainType } from '@/shared/types';
import { BasePublisher } from './base.publisher';
import { EvmPublisher } from './evm/evm.publisher';
import { TvmPublisher } from './tvm/tvm.publisher';
import { SvmPublisher } from './svm/svm.publisher';
import { ChainRegistryService } from './chain-registry.service';
import { ChainsService } from './chains.service';
import { RpcService } from './rpc.service';
import { ChainConfig } from '@/shared/types';

@Injectable()
export class PublisherFactory {
  constructor(
    private readonly registry: ChainRegistryService,
    private readonly rpcService: RpcService,
    private readonly chains: ChainsService,
  ) {}

  create(chain: ChainConfig): BasePublisher {
    const rpcUrl = this.rpcService.getUrl(chain);
    switch (chain.type) {
      case ChainType.EVM:
        return new EvmPublisher(rpcUrl, this.registry, this.chains);
      case ChainType.TVM:
        return new TvmPublisher(rpcUrl, this.registry, this.chains);
      case ChainType.SVM:
        return new SvmPublisher(rpcUrl, this.registry, this.chains);
      default:
        throw new Error(`Unsupported chain type: ${chain.type}`);
    }
  }
}
