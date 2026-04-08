/**
 * TVM Client Factory
 *
 * Injectable factory for creating TronWeb instances, enabling dependency injection
 * in TvmPublisher for testability without live RPC connections.
 */

import { TronWeb } from 'tronweb';

export interface TvmClientFactory {
  createClient(rpcUrl: string): TronWeb;
}

export class DefaultTvmClientFactory implements TvmClientFactory {
  createClient(rpcUrl: string): TronWeb {
    return new TronWeb({ fullHost: rpcUrl });
  }
}
