import type { ChainHandler } from '@/blockchain/chain-handler.interface';
import { RoutesCliError } from '@/shared/errors';
import { ChainType, BlockchainAddress, EvmAddress, UniversalAddress } from '@/shared/types';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { EvmAddressSchema } from '@/blockchain/validation';

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
