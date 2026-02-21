import { encodeAbiParameters, Hex } from 'viem';

import { EVMRewardAbiItem, EVMRouteAbiItem } from '@/commons/abis/portal.abi';
import { RewardInstruction, RouteInstruction } from '@/commons/types/portal-idl-coder.type';
import { bufferToBytes } from '@/commons/utils/converter';
import { toSvmRewardForCoder, toSvmRouteForCoder } from '@/commons/utils/instruments';
import { portalBorshCoder } from '@/commons/utils/portal-borsh-coder';
import { ChainType, Intent } from '@/shared/types';
import { AddressNormalizer } from './address-normalizer';

function isRoute(data: Intent['route'] | Intent['reward']): data is Intent['route'] {
  return 'salt' in data && 'portal' in data && 'calls' in data;
}

function encodeEvm(data: Intent['route'] | Intent['reward']): Hex {
  if (isRoute(data)) {
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

function encodeSvm(data: Intent['route'] | Intent['reward']): Hex {
  if (isRoute(data)) {
    return bufferToBytes(
      portalBorshCoder.types.encode<RouteInstruction>('Route', toSvmRouteForCoder(data))
    );
  } else {
    return bufferToBytes(
      portalBorshCoder.types.encode<RewardInstruction>('Reward', toSvmRewardForCoder(data))
    );
  }
}

export class PortalEncoder {
  static encode(data: Intent['route'] | Intent['reward'], chainType: ChainType): Hex {
    switch (chainType) {
      case ChainType.EVM:
      case ChainType.TVM:
        return encodeEvm(data);
      case ChainType.SVM:
        return encodeSvm(data);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }
}
