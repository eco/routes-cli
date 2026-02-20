/**
 * Publisher Factory
 *
 * Creates the correct BasePublisher implementation for a given chain type.
 */

import { BasePublisher } from '@/blockchain/base-publisher';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { TvmPublisher } from '@/blockchain/tvm-publisher';
import { ChainType } from '@/core/interfaces/intent';

export function createPublisher(chainType: ChainType, rpcUrl: string): BasePublisher {
  switch (chainType) {
    case ChainType.EVM:
      return new EvmPublisher(rpcUrl);
    case ChainType.TVM:
      return new TvmPublisher(rpcUrl);
    case ChainType.SVM:
      return new SvmPublisher(rpcUrl);
    default:
      throw new Error(`Unsupported chain type: ${chainType}`);
  }
}
