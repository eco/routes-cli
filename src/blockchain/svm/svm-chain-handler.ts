import type { ChainHandler } from '@/blockchain/chain-handler.interface';
import { RoutesCliError } from '@/shared/errors';
import { ChainType, BlockchainAddress, SvmAddress, UniversalAddress } from '@/shared/types';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { SvmAddressSchema } from '@/core/validation';

export class SvmChainHandler implements ChainHandler {
  readonly chainType = ChainType.SVM;

  validateAddress(address: string): boolean {
    return SvmAddressSchema.safeParse(address).success;
  }

  normalize(address: string): UniversalAddress {
    const result = SvmAddressSchema.safeParse(address);
    if (!result.success) {
      throw RoutesCliError.invalidAddress(address, 'SVM');
    }
    return AddressNormalizer.normalizeSvm(address as SvmAddress);
  }

  denormalize(address: UniversalAddress): BlockchainAddress {
    return AddressNormalizer.denormalizeToSvm(address);
  }

  getAddressFormat(): string {
    return 'Base58 public key, 32–44 characters (e.g., So11111111111111111111111111111111111111112)';
  }
}
