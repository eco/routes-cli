/**
 * Portal Encoder Utility
 *
 * Provides chain-specific encoding and decoding for Portal contract data structures.
 * Each blockchain type (EVM, TVM, SVM) has its own encoding format:
 * - EVM: ABI encoding (hex)
 * - TVM: ABI encoding (hex)
 * - SVM: Borsh serialization
 */

import { decodeAbiParameters, encodeAbiParameters, Hex } from 'viem';

import { EVMRewardAbiItem, EVMRouteAbiItem } from '@/commons/abis/portal.abi';
import { RewardInstruction, RouteInstruction } from '@/commons/types/portal-idl-coder.type';
import { bufferToBytes, bytes32ToAddress } from '@/commons/utils/converter';
import { toSvmRewardForCoder, toSvmRouteForCoder } from '@/commons/utils/instruments';
import { portalBorshCoder } from '@/commons/utils/portal-borsh-coder';
import { TvmUtils } from '@/commons/utils/tvm-utils';
import { AddressNormalizer } from '@/core/utils/address-normalizer';

import { ChainType, Intent } from '../interfaces/intent';

// Helper to serialize objects with BigInt
const serializeWithBigInt = (obj: any) =>
  JSON.stringify(obj, (_, value) => (typeof value === 'bigint' ? value.toString() : value));

export class PortalEncoder {
  /**
   * Encodes Intent data for a specific chain type
   *
   * @param data - Data to encode (Route or Reward from Intent)
   * @param chainType - Target chain type
   * @returns Encoded data as Buffer
   */
  static encode(data: Intent['route'] | Intent['reward'], chainType: ChainType): Hex {
    switch (chainType) {
      case ChainType.EVM:
      case ChainType.TVM:
        return this.encodeEvm(data);
      case ChainType.SVM:
        return this.encodeSvm(data);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Decodes data from a specific chain type to Intent format
   *
   * @param data - Encoded data as Buffer or string
   * @param chainType - Source chain type
   * @param dataType - Type of data ('route' or 'reward')
   * @returns Decoded Route or Reward object in Intent format
   */
  static decode<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    chainType: ChainType,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    switch (chainType) {
      case ChainType.EVM:
        return this.decodeEvm(data, dataType);
      case ChainType.TVM:
        return this.decodeTvm(data, dataType);
      case ChainType.SVM:
        return this.decodeSvm(data, dataType);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Type guard to determine if data is a Route
   */
  static isRoute(data: Intent['route'] | Intent['reward']): data is Intent['route'] {
    return 'salt' in data && 'portal' in data && 'calls' in data;
  }

  /**
   * EVM encoding using ABI parameters
   */
  private static encodeEvm(data: Intent['route'] | Intent['reward']): Hex {
    if (this.isRoute(data)) {
      return encodeAbiParameters(
        [EVMRouteAbiItem],
        [
          {
            salt: data.salt,
            deadline: data.deadline,
            nativeAmount: data.nativeAmount,
            portal: AddressNormalizer.denormalizeToEvm(data.portal),
            tokens: data.tokens.map(t => ({
              token: AddressNormalizer.denormalizeToEvm(t.token),
              amount: t.amount,
            })),
            calls: data.calls.map(c => ({
              target: AddressNormalizer.denormalizeToEvm(c.target),
              data: c.data,
              value: c.value,
            })),
          },
        ]
      );
    } else {
      return encodeAbiParameters(
        [EVMRewardAbiItem],
        [
          {
            deadline: data.deadline,
            creator: AddressNormalizer.denormalizeToEvm(data.creator),
            prover: AddressNormalizer.denormalizeToEvm(data.prover),
            nativeAmount: data.nativeAmount,
            tokens: data.tokens.map(t => ({
              token: AddressNormalizer.denormalizeToEvm(t.token),
              amount: t.amount,
            })),
          },
        ]
      );
    }
  }

  /**
   * SVM encoding using proper Borsh serialization
   */
  private static encodeSvm(data: Intent['route'] | Intent['reward']): Hex {
    if (PortalEncoder.isRoute(data)) {
      return bufferToBytes(
        portalBorshCoder.types.encode<RouteInstruction>('Route', toSvmRouteForCoder(data))
      );
    } else {
      return bufferToBytes(
        portalBorshCoder.types.encode<RewardInstruction>('Reward', toSvmRewardForCoder(data))
      );
    }
  }

  /**
   * EVM decoding to Intent format
   */
  private static decodeEvm<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    const dataString = typeof data === 'string' ? data : '0x' + data.toString('hex');

    if (dataType === 'reward') {
      const decoded = decodeAbiParameters([EVMRewardAbiItem], dataString as Hex)[0];

      return {
        deadline: decoded.deadline,
        creator: AddressNormalizer.normalize(decoded.creator, ChainType.EVM),
        prover: AddressNormalizer.normalize(decoded.prover, ChainType.EVM),
        nativeAmount: decoded.nativeAmount,
        tokens: decoded.tokens.map(t => ({
          token: AddressNormalizer.normalize(t.token, ChainType.EVM),
          amount: t.amount,
        })),
      } as Intent['reward'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
    }

    const decoded = decodeAbiParameters([EVMRouteAbiItem], dataString as Hex)[0];
    return {
      salt: decoded.salt,
      deadline: decoded.deadline,
      portal: AddressNormalizer.normalize(decoded.portal, ChainType.EVM),
      nativeAmount: decoded.nativeAmount || 0n,
      tokens: decoded.tokens.map(t => ({
        token: AddressNormalizer.normalize(t.token, ChainType.EVM),
        amount: t.amount,
      })),
      calls: decoded.calls.map(c => ({
        target: AddressNormalizer.normalize(c.target, ChainType.EVM),
        data: c.data,
        value: c.value,
      })),
    } as Intent['route'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
  }

  /**
   * EVM decoding to Intent format
   */
  private static decodeTvm<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    const dataString = typeof data === 'string' ? data : '0x' + data.toString('hex');

    if (dataType === 'reward') {
      const decoded = decodeAbiParameters([EVMRewardAbiItem], dataString as Hex)[0];

      return {
        deadline: decoded.deadline,
        creator: AddressNormalizer.normalize(TvmUtils.fromEvm(decoded.creator), ChainType.TVM),
        prover: AddressNormalizer.normalize(TvmUtils.fromEvm(decoded.prover), ChainType.TVM),
        nativeAmount: decoded.nativeAmount,
        tokens: decoded.tokens.map(t => ({
          token: AddressNormalizer.normalize(TvmUtils.fromEvm(t.token), ChainType.TVM),
          amount: t.amount,
        })),
      } as Intent['reward'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
    }

    const decoded = decodeAbiParameters([EVMRouteAbiItem], dataString as Hex)[0];
    return {
      salt: decoded.salt,
      deadline: decoded.deadline,
      portal: AddressNormalizer.normalize(TvmUtils.fromEvm(decoded.portal), ChainType.TVM),
      nativeAmount: decoded.nativeAmount || 0n,
      tokens: decoded.tokens.map(t => ({
        token: AddressNormalizer.normalize(TvmUtils.fromEvm(t.token), ChainType.TVM),
        amount: t.amount,
      })),
      calls: decoded.calls.map(c => ({
        target: AddressNormalizer.normalize(TvmUtils.fromEvm(c.target), ChainType.TVM),
        data: c.data,
        value: c.value,
      })),
    } as Intent['route'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
  }

  /**
   * SVM decoding from Borsh to Intent format
   */
  private static decodeSvm<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    const buffer =
      typeof data === 'string'
        ? Buffer.from(data.startsWith('0x') ? data.substring(2) : data, 'hex')
        : data;

    if (dataType === 'route') {
      // Decode route using Borsh
      const decoded = portalBorshCoder.types.decode<RouteInstruction>('Route', buffer);

      if (decoded === null) {
        throw new Error('Unable to decode SVM route');
      }

      const route: Intent['route'] = {
        salt: bufferToBytes(decoded.salt[0]),
        deadline: BigInt(decoded.deadline.toString()),
        portal: AddressNormalizer.normalizeSvm(bytes32ToAddress(decoded.portal[0])),
        nativeAmount: BigInt(decoded.native_amount.toString()), // Route doesn't have nativeAmount in the schema
        tokens: decoded.tokens.map(t => ({
          token: AddressNormalizer.normalizeSvm(t.token),
          amount: BigInt(t.amount.toString()),
        })),
        calls: decoded.calls.map(c => ({
          target: AddressNormalizer.normalizeSvm(bytes32ToAddress(c.target[0])),
          data: bufferToBytes(c.data),
          value: 0n, // Value is not part of the Call struct
        })),
      };

      return route as Type extends 'route' ? Intent['route'] : Intent['reward'];
    }

    // Decode reward using Borsh
    const decoded = portalBorshCoder.types.decode<RewardInstruction>('Reward', buffer);

    if (decoded === null) {
      throw new Error('Unable to decode SVM reward');
    }

    const reward: Intent['reward'] = {
      deadline: BigInt(decoded.deadline.toString()),
      creator: AddressNormalizer.normalizeSvm(decoded.creator),
      prover: AddressNormalizer.normalizeSvm(decoded.prover),
      nativeAmount: BigInt(decoded.native_amount.toString()),
      tokens: decoded.tokens.map(t => ({
        token: AddressNormalizer.normalizeSvm(t.token),
        amount: BigInt(t.amount.toString()),
      })),
    };

    return reward as Type extends 'route' ? Intent['route'] : Intent['reward'];
  }
}
