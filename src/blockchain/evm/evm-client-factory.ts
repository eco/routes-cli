/**
 * EVM Client Factory
 *
 * Injectable factory for creating viem clients, enabling dependency injection
 * in EvmPublisher for testability without live RPC connections.
 */

import {
  Account,
  Chain,
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  Transport,
  type WalletClient,
} from 'viem';

export interface EvmClientFactory {
  createPublicClient(config: { chain: Chain; rpcUrl: string }): PublicClient;
  createWalletClient(config: {
    chain: Chain;
    rpcUrl: string;
    account: Account;
  }): WalletClient<Transport, Chain, Account>;
}

export class DefaultEvmClientFactory implements EvmClientFactory {
  createPublicClient({ chain, rpcUrl }: { chain: Chain; rpcUrl: string }): PublicClient {
    return createPublicClient({ chain, transport: http(rpcUrl) }) as PublicClient;
  }

  createWalletClient({
    chain,
    rpcUrl,
    account,
  }: {
    chain: Chain;
    rpcUrl: string;
    account: Account;
  }): WalletClient<Transport, Chain, Account> {
    return createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    }) as WalletClient<Transport, Chain, Account>;
  }
}
