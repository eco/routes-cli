/**
 * Solana Client
 * Wraps Solana Connection setup and Anchor program initialization.
 * Provides the injectable SvmClientFactory interface for testability.
 */

import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import { Connection } from '@solana/web3.js';

import { getPortalIdl } from '@/commons/idls/portal.idl';

import { SVM_CONNECTION_CONFIG, SVM_PROVIDER_CONFIG } from './svm-constants';
import { AnchorSetupResult, PublishContext } from './svm-types';

export interface SvmClientFactory {
  createConnection(rpcUrl: string): Connection;
}

export class DefaultSvmClientFactory implements SvmClientFactory {
  createConnection(rpcUrl: string): Connection {
    return new Connection(rpcUrl, SVM_CONNECTION_CONFIG);
  }
}

/**
 * Sets up Anchor provider and program for Solana interactions.
 */
export function setupAnchorProgram(
  connection: Connection,
  context: PublishContext
): AnchorSetupResult {
  const wallet = new Wallet(context.keypair);
  const provider = new AnchorProvider(connection, wallet, SVM_PROVIDER_CONFIG);

  const idl = getPortalIdl(context.portalProgramId.toBase58());
  const program = new Program(idl, provider);

  return { program, provider };
}
