import { RoutesCliError } from '@/core/errors';
import { ChainType } from '@/core/interfaces/intent';

import { ChainHandler } from './chain-handler.interface';

/**
 * Registry of chain handlers, indexed by ChainType.
 *
 * New chain types can be added at runtime by calling `register()` with a `ChainHandler`
 * implementation. All address validation, normalization, and denormalization is dispatched
 * through this registry — no switch statements required in consuming code.
 *
 * Chain IDs can also be registered via `registerChainId()` to build an explicit allowlist.
 * Use `isRegistered(chainId)` to check whether a numeric chain ID is on the allowlist.
 */
export class ChainRegistry {
  private readonly handlers = new Map<ChainType, ChainHandler>();
  private readonly registeredChainIds = new Set<bigint>();

  /** Register a handler for the chain type it declares. */
  register(handler: ChainHandler): void {
    this.handlers.set(handler.chainType, handler);
  }

  /**
   * Returns the handler for the given chain type.
   * @throws {RoutesCliError} When no handler is registered for the given chain type.
   */
  get(chainType: ChainType): ChainHandler {
    const handler = this.handlers.get(chainType);
    if (!handler) {
      throw RoutesCliError.unsupportedChain(chainType);
    }
    return handler;
  }

  /** Returns all registered handlers. */
  getAll(): ChainHandler[] {
    return [...this.handlers.values()];
  }

  /**
   * Adds a chain ID to the allowlist.
   * Call this once at startup for each chain in your configuration.
   */
  registerChainId(chainId: bigint): void {
    this.registeredChainIds.add(chainId);
  }

  /**
   * Returns true if the chain ID has been added to the allowlist via `registerChainId()`.
   * Returns false when no chain IDs have been registered yet (empty allowlist).
   */
  isRegistered(chainId: bigint): boolean {
    return this.registeredChainIds.has(chainId);
  }
}

/** Singleton chain registry — populated via self-registering handler modules. */
export const chainRegistry = new ChainRegistry();
