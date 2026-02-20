/**
 * Publisher Factory
 *
 * Creates the correct BasePublisher implementation for a given chain type.
 * Accepts optional client factories for dependency injection (useful in tests).
 */

import { BasePublisher } from '@/blockchain/base-publisher';
import { EvmClientFactory } from '@/blockchain/evm/evm-client-factory';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { SvmClientFactory } from '@/blockchain/svm/svm-client-factory';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { TvmClientFactory } from '@/blockchain/tvm/tvm-client-factory';
import { TvmPublisher } from '@/blockchain/tvm-publisher';
import { ChainType } from '@/core/interfaces/intent';

export interface PublisherFactoryOptions {
  evmClientFactory?: EvmClientFactory;
  tvmClientFactory?: TvmClientFactory;
  svmClientFactory?: SvmClientFactory;
}

export function createPublisher(
  chainType: ChainType,
  rpcUrl: string,
  options?: PublisherFactoryOptions
): BasePublisher {
  switch (chainType) {
    case ChainType.EVM:
      return new EvmPublisher(rpcUrl, options?.evmClientFactory);
    case ChainType.TVM:
      return new TvmPublisher(rpcUrl, options?.tvmClientFactory);
    case ChainType.SVM:
      return new SvmPublisher(rpcUrl, options?.svmClientFactory);
    default:
      throw new Error(`Unsupported chain type: ${chainType}`);
  }
}
