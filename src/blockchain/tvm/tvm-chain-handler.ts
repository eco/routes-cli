import type { ChainHandler } from '@/blockchain/chain-handler.interface';
import { RoutesCliError } from '@/shared/errors';
import { ChainType, BlockchainAddress, TronAddress, UniversalAddress } from '@/shared/types';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { TvmAddressSchema } from '@/blockchain/validation';

export class TvmChainHandler implements ChainHandler {
  readonly chainType = ChainType.TVM;

  validateAddress(address: string): boolean {
    return TvmAddressSchema.safeParse(address).success;
  }

  normalize(address: string): UniversalAddress {
    const result = TvmAddressSchema.safeParse(address);
    if (!result.success) {
      throw RoutesCliError.invalidAddress(address, 'TVM');
    }
    return AddressNormalizer.normalizeTvm(address as TronAddress);
  }

  denormalize(address: UniversalAddress): BlockchainAddress {
    return AddressNormalizer.denormalizeToTvm(address);
  }

  getAddressFormat(): string {
    return 'Base58 starting with T, 34 characters (e.g., TLyqzVGLV1srkB7dToTAEqgDSfPtXRJZYH)';
  }
}
