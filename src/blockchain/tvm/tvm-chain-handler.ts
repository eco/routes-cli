import type { ChainHandler } from '@/core/chain/chain-handler.interface';
import { chainRegistry } from '@/core/chain/chain-registry';
import { RoutesCliError } from '@/core/errors';
import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress, TronAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { TvmAddressSchema } from '@/core/validation';

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

// Self-register so that importing this module populates the chainRegistry.
chainRegistry.register(new TvmChainHandler());
