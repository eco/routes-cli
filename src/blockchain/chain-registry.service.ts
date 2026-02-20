import { Injectable, OnModuleInit } from '@nestjs/common';
import { ChainType } from '@/shared/types';
import { RoutesCliError } from '@/shared/errors';
import { ChainHandler } from './chain-handler.interface';
import { EvmChainHandler } from './evm/evm-chain-handler';
import { TvmChainHandler } from './tvm/tvm-chain-handler';
import { SvmChainHandler } from './svm/svm-chain-handler';

@Injectable()
export class ChainRegistryService implements OnModuleInit {
  private readonly handlers = new Map<ChainType, ChainHandler>();
  private readonly registeredChainIds = new Set<bigint>();

  onModuleInit(): void {
    this.bootstrap([
      new EvmChainHandler(),
      new TvmChainHandler(),
      new SvmChainHandler(),
    ]);
  }

  bootstrap(handlers: ChainHandler[]): void {
    for (const handler of handlers) {
      this.handlers.set(handler.chainType, handler);
    }
  }

  get(chainType: ChainType): ChainHandler {
    const handler = this.handlers.get(chainType);
    if (!handler) throw RoutesCliError.unsupportedChain(chainType);
    return handler;
  }

  getAll(): ChainHandler[] {
    return [...this.handlers.values()];
  }

  registerChainId(chainId: bigint): void {
    this.registeredChainIds.add(chainId);
  }

  isRegistered(chainId: bigint): boolean {
    return this.registeredChainIds.has(chainId);
  }
}
