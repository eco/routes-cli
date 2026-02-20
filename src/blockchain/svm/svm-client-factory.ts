/**
 * SVM Client Factory
 *
 * Injectable factory for creating Solana Connection instances, enabling dependency
 * injection in SvmPublisher for testability without live RPC connections.
 */

import { Connection } from '@solana/web3.js';

import { SVM_CONNECTION_CONFIG } from './svm-constants';

export interface SvmClientFactory {
  createConnection(rpcUrl: string): Connection;
}

export class DefaultSvmClientFactory implements SvmClientFactory {
  createConnection(rpcUrl: string): Connection {
    return new Connection(rpcUrl, SVM_CONNECTION_CONFIG);
  }
}
