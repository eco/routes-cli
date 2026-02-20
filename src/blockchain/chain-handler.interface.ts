import { ChainType } from '@/shared/types';
import { BlockchainAddress } from '@/shared/types';
import { UniversalAddress } from '@/shared/types';

/**
 * Chain handler interface for pluggable chain-type support.
 *
 * Implementing this interface and registering via `ChainRegistryService.bootstrap()` is all
 * that is needed to add support for a new blockchain type — no switch statements to update.
 */
export interface ChainHandler {
  /** The blockchain type this handler is responsible for. */
  readonly chainType: ChainType;

  /**
   * Returns true if the given address string is valid for this chain type.
   * Used to gate user input before normalization.
   */
  validateAddress(address: string): boolean;

  /**
   * Converts a chain-native address string to UniversalAddress format.
   * @throws {RoutesCliError} When the address is invalid for this chain type.
   */
  normalize(address: string): UniversalAddress;

  /**
   * Converts a UniversalAddress back to the chain-native address format.
   * @throws {Error} When denormalization fails.
   */
  denormalize(address: UniversalAddress): BlockchainAddress;

  /**
   * Returns a human-readable description of the expected address format.
   * Used in error messages and CLI prompts.
   */
  getAddressFormat(): string;
}
