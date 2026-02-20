import type { ChainHandler } from '@/core/chain/chain-handler.interface';
import { chainRegistry } from '@/core/chain/chain-registry';
import { RoutesCliError } from '@/core/errors';
import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress, EvmAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { EvmAddressSchema } from '@/core/validation';

export class EvmChainHandler implements ChainHandler {
  readonly chainType = ChainType.EVM;

  validateAddress(address: string): boolean {
    return EvmAddressSchema.safeParse(address).success;
  }

  normalize(address: string): UniversalAddress {
    const result = EvmAddressSchema.safeParse(address);
    if (!result.success) {
      throw RoutesCliError.invalidAddress(address, 'EVM');
    }
    return AddressNormalizer.normalizeEvm(address as EvmAddress);
  }

  denormalize(address: UniversalAddress): BlockchainAddress {
    return AddressNormalizer.denormalizeToEvm(address);
  }

  getAddressFormat(): string {
    return '0x followed by 40 hex characters (e.g., 0x742d35Cc6634C0532925a3b8D65C32c2b3f6dE1b)';
  }
}

// Self-register so that importing this module populates the chainRegistry.
chainRegistry.register(new EvmChainHandler());
