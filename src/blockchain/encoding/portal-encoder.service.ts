import { Injectable } from '@nestjs/common';
import { decodeAbiParameters, encodeAbiParameters, Hex } from 'viem';

import { EVMRewardAbiItem, EVMRouteAbiItem } from '@/commons/abis/portal.abi';
import { RewardInstruction, RouteInstruction } from '@/commons/types/portal-idl-coder.type';
import { bufferToBytes, bytes32ToAddress } from '@/commons/utils/converter';
import { toSvmRewardForCoder, toSvmRouteForCoder } from '@/commons/utils/instruments';
import { portalBorshCoder } from '@/commons/utils/portal-borsh-coder';
import { TvmUtils } from '@/commons/utils/tvm-utils';
import { AddressNormalizerService } from '../address-normalizer.service';

import { ChainType, Intent, SvmAddress } from '@/shared/types';

@Injectable()
export class PortalEncoderService {
  constructor(private readonly addrNorm: AddressNormalizerService) {}

  encode(data: Intent['route'] | Intent['reward'], chainType: ChainType): Hex {
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

  decode<Type extends 'route' | 'reward'>(
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

  isRoute(data: Intent['route'] | Intent['reward']): data is Intent['route'] {
    return 'salt' in data && 'portal' in data && 'calls' in data;
  }

  private encodeEvm(data: Intent['route'] | Intent['reward']): Hex {
    if (this.isRoute(data)) {
      return encodeAbiParameters(
        [EVMRouteAbiItem],
        [
          {
            salt: data.salt,
            deadline: data.deadline,
            nativeAmount: data.nativeAmount,
            portal: this.addrNorm.denormalizeToEvm(data.portal),
            tokens: data.tokens.map(t => ({
              token: this.addrNorm.denormalizeToEvm(t.token),
              amount: t.amount,
            })),
            calls: data.calls.map(c => ({
              target: this.addrNorm.denormalizeToEvm(c.target),
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
            creator: this.addrNorm.denormalizeToEvm(data.creator),
            prover: this.addrNorm.denormalizeToEvm(data.prover),
            nativeAmount: data.nativeAmount,
            tokens: data.tokens.map(t => ({
              token: this.addrNorm.denormalizeToEvm(t.token),
              amount: t.amount,
            })),
          },
        ]
      );
    }
  }

  private encodeSvm(data: Intent['route'] | Intent['reward']): Hex {
    if (this.isRoute(data)) {
      return bufferToBytes(
        portalBorshCoder.types.encode<RouteInstruction>('Route', toSvmRouteForCoder(data))
      );
    } else {
      return bufferToBytes(
        portalBorshCoder.types.encode<RewardInstruction>('Reward', toSvmRewardForCoder(data))
      );
    }
  }

  private decodeEvm<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    const dataString = typeof data === 'string' ? data : '0x' + data.toString('hex');

    if (dataType === 'reward') {
      const decoded = decodeAbiParameters([EVMRewardAbiItem], dataString as Hex)[0];

      return {
        deadline: decoded.deadline,
        creator: this.addrNorm.normalize(decoded.creator, ChainType.EVM),
        prover: this.addrNorm.normalize(decoded.prover, ChainType.EVM),
        nativeAmount: decoded.nativeAmount,
        tokens: decoded.tokens.map(t => ({
          token: this.addrNorm.normalize(t.token, ChainType.EVM),
          amount: t.amount,
        })),
      } as Intent['reward'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
    }

    const decoded = decodeAbiParameters([EVMRouteAbiItem], dataString as Hex)[0];
    return {
      salt: decoded.salt,
      deadline: decoded.deadline,
      portal: this.addrNorm.normalize(decoded.portal, ChainType.EVM),
      nativeAmount: decoded.nativeAmount || 0n,
      tokens: decoded.tokens.map(t => ({
        token: this.addrNorm.normalize(t.token, ChainType.EVM),
        amount: t.amount,
      })),
      calls: decoded.calls.map(c => ({
        target: this.addrNorm.normalize(c.target, ChainType.EVM),
        data: c.data,
        value: c.value,
      })),
    } as Intent['route'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
  }

  private decodeTvm<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    const dataString = typeof data === 'string' ? data : '0x' + data.toString('hex');

    if (dataType === 'reward') {
      const decoded = decodeAbiParameters([EVMRewardAbiItem], dataString as Hex)[0];

      return {
        deadline: decoded.deadline,
        creator: this.addrNorm.normalize(TvmUtils.fromEvm(decoded.creator), ChainType.TVM),
        prover: this.addrNorm.normalize(TvmUtils.fromEvm(decoded.prover), ChainType.TVM),
        nativeAmount: decoded.nativeAmount,
        tokens: decoded.tokens.map(t => ({
          token: this.addrNorm.normalize(TvmUtils.fromEvm(t.token), ChainType.TVM),
          amount: t.amount,
        })),
      } as Intent['reward'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
    }

    const decoded = decodeAbiParameters([EVMRouteAbiItem], dataString as Hex)[0];
    return {
      salt: decoded.salt,
      deadline: decoded.deadline,
      portal: this.addrNorm.normalize(TvmUtils.fromEvm(decoded.portal), ChainType.TVM),
      nativeAmount: decoded.nativeAmount || 0n,
      tokens: decoded.tokens.map(t => ({
        token: this.addrNorm.normalize(TvmUtils.fromEvm(t.token), ChainType.TVM),
        amount: t.amount,
      })),
      calls: decoded.calls.map(c => ({
        target: this.addrNorm.normalize(TvmUtils.fromEvm(c.target), ChainType.TVM),
        data: c.data,
        value: c.value,
      })),
    } as Intent['route'] as Type extends 'route' ? Intent['route'] : Intent['reward'];
  }

  private decodeSvm<Type extends 'route' | 'reward'>(
    data: Buffer | string,
    dataType: Type
  ): Type extends 'route' ? Intent['route'] : Intent['reward'] {
    const buffer =
      typeof data === 'string'
        ? Buffer.from(data.startsWith('0x') ? data.substring(2) : data, 'hex')
        : data;

    if (dataType === 'route') {
      const decoded = portalBorshCoder.types.decode<RouteInstruction>('Route', buffer);

      if (decoded === null) {
        throw new Error('Unable to decode SVM route');
      }

      const route: Intent['route'] = {
        salt: bufferToBytes(decoded.salt[0]),
        deadline: BigInt(decoded.deadline.toString()),
        portal: this.addrNorm.normalize(bytes32ToAddress(decoded.portal[0]), ChainType.SVM),
        nativeAmount: BigInt(decoded.native_amount.toString()),
        tokens: decoded.tokens.map(t => ({
          token: this.addrNorm.normalize(t.token.toBase58() as SvmAddress, ChainType.SVM),
          amount: BigInt(t.amount.toString()),
        })),
        calls: decoded.calls.map(c => ({
          target: this.addrNorm.normalize(bytes32ToAddress(c.target[0]), ChainType.SVM),
          data: bufferToBytes(c.data),
          value: 0n,
        })),
      };

      return route as Type extends 'route' ? Intent['route'] : Intent['reward'];
    }

    const decoded = portalBorshCoder.types.decode<RewardInstruction>('Reward', buffer);

    if (decoded === null) {
      throw new Error('Unable to decode SVM reward');
    }

    const reward: Intent['reward'] = {
      deadline: BigInt(decoded.deadline.toString()),
      creator: this.addrNorm.normalize(decoded.creator.toBase58() as SvmAddress, ChainType.SVM),
      prover: this.addrNorm.normalize(decoded.prover.toBase58() as SvmAddress, ChainType.SVM),
      nativeAmount: BigInt(decoded.native_amount.toString()),
      tokens: decoded.tokens.map(t => ({
        token: this.addrNorm.normalize(t.token.toBase58() as SvmAddress, ChainType.SVM),
        amount: BigInt(t.amount.toString()),
      })),
    };

    return reward as Type extends 'route' ? Intent['route'] : Intent['reward'];
  }
}
