import { PublicKey } from '@solana/web3.js';
import { TronWeb } from 'tronweb';
import { getAddress, isAddress as isViemAddress } from 'viem';

import { getErrorMessage } from '@/commons/utils/error-handler';
import { BlockchainAddress, ChainType, EvmAddress, SvmAddress, TronAddress } from '@/shared/types';
import { padTo32Bytes, UniversalAddress, unpadFrom32Bytes } from '@/shared/types';

export class AddressNormalizer {
  static normalize(address: BlockchainAddress, chainType: ChainType): UniversalAddress {
    switch (chainType) {
      case ChainType.EVM:
        return AddressNormalizer.normalizeEvm(address as EvmAddress);
      case ChainType.TVM:
        return AddressNormalizer.normalizeTvm(address as TronAddress);
      case ChainType.SVM:
        return AddressNormalizer.normalizeSvm(address as SvmAddress);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  static denormalize<
    chainType extends ChainType,
    Addr extends chainType extends ChainType.TVM
      ? TronAddress
      : chainType extends ChainType.EVM
        ? EvmAddress
        : chainType extends ChainType.SVM
          ? SvmAddress
          : never,
  >(address: UniversalAddress, chainType: chainType): Addr {
    switch (chainType) {
      case ChainType.EVM:
        return AddressNormalizer.denormalizeToEvm(address) as Addr;
      case ChainType.TVM:
        return AddressNormalizer.denormalizeToTvm(address) as Addr;
      case ChainType.SVM:
        return AddressNormalizer.denormalizeToSvm(address) as Addr;
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  static denormalizeToEvm(address: UniversalAddress): EvmAddress {
    const unpadded = unpadFrom32Bytes(address);
    const cleanHex = unpadded.substring(2);
    const evmHex = cleanHex.length > 40 ? cleanHex.substring(cleanHex.length - 40) : cleanHex;
    const evmAddress = '0x' + evmHex;
    if (!isViemAddress(evmAddress)) {
      throw new Error(`Invalid EVM address after denormalization: ${evmAddress}`);
    }
    return getAddress(evmAddress);
  }

  static denormalizeToTvm(address: UniversalAddress): TronAddress {
    try {
      const unpadded = unpadFrom32Bytes(address);
      const hexAddress = unpadded.startsWith('0x41')
        ? unpadded.substring(2)
        : '41' + unpadded.substring(2);
      const base58Address = TronWeb.address.fromHex(hexAddress);
      if (!TronWeb.isAddress(base58Address)) {
        throw new Error(`Invalid Tron address after denormalization: ${base58Address}`);
      }
      return base58Address as TronAddress;
    } catch (error) {
      throw new Error(`Failed to denormalize to TVM address: ${getErrorMessage(error)}`);
    }
  }

  static denormalizeToSvm(address: UniversalAddress): SvmAddress {
    try {
      const hex = address.startsWith('0x') ? address.slice(2) : address;
      const bytes = Buffer.from(hex, 'hex');
      if (bytes.length !== 32) {
        throw new Error(`Expected 32 bytes, got ${bytes.length}`);
      }
      const publicKey = new PublicKey(bytes);
      return publicKey.toBase58() as SvmAddress;
    } catch (error) {
      throw new Error(`Failed to denormalize to SVM address: ${getErrorMessage(error)}`);
    }
  }

  static normalizeEvm(address: EvmAddress): UniversalAddress {
    if (!isViemAddress(address)) {
      throw new Error(`Invalid EVM address: ${address}`);
    }
    const checksummed = getAddress(address);
    return padTo32Bytes(checksummed) as UniversalAddress;
  }

  static normalizeTvm(address: TronAddress): UniversalAddress {
    try {
      let hexAddress: string;
      if (address.startsWith('0x')) {
        const hexTronAddr = address.startsWith('0x41') ? address : '0x41' + address.substring(2);
        const base58 = TronWeb.address.fromHex(hexTronAddr.substring(2));
        if (!TronWeb.isAddress(base58)) {
          throw new Error(`Invalid Tron hex address: ${address}`);
        }
        hexAddress = hexTronAddr.toLowerCase();
      } else {
        if (!TronWeb.isAddress(address)) {
          throw new Error(`Invalid Tron base58 address: ${address}`);
        }
        const tronHex = TronWeb.address.toHex(address);
        hexAddress = '0x' + tronHex.toLowerCase();
      }
      return padTo32Bytes(hexAddress) as UniversalAddress;
    } catch (error) {
      throw new Error(`Failed to normalize TVM address ${address}: ${getErrorMessage(error)}`);
    }
  }

  static normalizeSvm(address: SvmAddress | PublicKey): UniversalAddress {
    try {
      const publicKey = address instanceof PublicKey ? address : new PublicKey(address);
      const bytes = publicKey.toBytes();
      const hex = '0x' + Buffer.from(bytes).toString('hex');
      return hex as UniversalAddress;
    } catch (error) {
      throw new Error(`Failed to normalize SVM address ${address}: ${getErrorMessage(error)}`);
    }
  }
}
