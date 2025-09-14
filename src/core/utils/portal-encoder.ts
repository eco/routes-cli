/**
 * Portal Encoder Utility
 *
 * Provides chain-specific encoding and decoding for Portal contract data structures
 * used in cross-chain intent publishing. This utility handles the serialization/
 * deserialization of Route and Reward data for different blockchain types.
 *
 * Encoding formats by chain type:
 * - EVM: ABI encoding using viem library (produces hex strings)
 * - TVM: ABI encoding compatible with Tron (produces hex strings)
 * - SVM: Borsh serialization for Solana programs (produces binary data)
 *
 * The encoder automatically handles Universal Address normalization/denormalization
 * internally to ensure addresses are in the correct format for each blockchain.
 *
 * @example
 * ```typescript
 * // Encode route data for EVM chains
 * const encoded = PortalEncoder.encode(intent.route, ChainType.EVM);
 *
 * // Decode reward data from Solana
 * const reward = PortalEncoder.decode(encodedData, ChainType.SVM, 'reward');
 * ```
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

export class PortalEncoder {
  /**
   * Encodes Intent data for a specific chain type.
   *
   * Converts Route or Reward data from the Intent structure into the appropriate
   * format for the target blockchain. Automatically handles address denormalization
   * from UniversalAddress to chain-native formats before encoding.
   *
   * @param data - Data to encode (Route or Reward from Intent structure)
   * @param chainType - Target chain type determining the encoding method
   * @returns Encoded data as hexadecimal string with 0x prefix
   * @throws {Error} When the chain type is unsupported or encoding fails
   *
   * @example
   * ```typescript
   * // Encode route for EVM deployment
   * const encodedRoute = PortalEncoder.encode(intent.route, ChainType.EVM);
   *
   * // Encode reward for Solana program
   * const encodedReward = PortalEncoder.encode(intent.reward, ChainType.SVM);
   * ```
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
   * Decodes data from a specific chain type to Intent format.
   *
   * Converts encoded blockchain data back into the standardized Intent structure.
   * Automatically handles address normalization from chain-native formats to
   * UniversalAddress during the decoding process.
   *
   * @param data - Encoded data as Buffer or hex string
   * @param chainType - Source chain type that determines the decoding method
   * @param dataType - Type of data structure to decode ('route' or 'reward')
   * @returns Decoded Route or Reward object in Intent format with UniversalAddresses
   * @throws {Error} When the chain type is unsupported or decoding fails
   *
   * @example
   * ```typescript
   * // Decode route data from EVM transaction
   * const route = PortalEncoder.decode(
   *   encodedData,
   *   ChainType.EVM,
   *   'route'
   * );
   *
   * // Decode reward data from Solana program account
   * const reward = PortalEncoder.decode(
   *   accountData,
   *   ChainType.SVM,
   *   'reward'
   * );
   * ```
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
   * Type guard to determine if data is a Route.
   *
   * Distinguishes between Route and Reward data structures by checking for
   * Route-specific properties like 'salt', 'portal', and 'calls'.
   *
   * @param data - Intent data to check (Route or Reward)
   * @returns True if data is a Route, false if it's a Reward
   *
   * @example
   * ```typescript
   * if (PortalEncoder.isRoute(intentData)) {
   *   // Handle as Route
   *   console.log(`Route has ${intentData.calls.length} calls`);
   * } else {
   *   // Handle as Reward
   *   console.log(`Reward creator: ${intentData.creator}`);
   * }
   * ```
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
