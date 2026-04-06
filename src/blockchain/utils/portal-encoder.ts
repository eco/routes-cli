import { BN, web3 } from '@coral-xyz/anchor';
import { decodeAbiParameters, encodeAbiParameters, Hex } from 'viem';

import { EVMRewardAbiItem, EVMRouteAbiItem } from '@/commons/abis/portal.abi';
import { RewardInstruction, RouteInstruction } from '@/commons/types/portal-idl-coder.type';
import { bufferToBytes } from '@/commons/utils/converter';
import { toSvmRewardForCoder, toSvmRouteForCoder } from '@/commons/utils/instruments';
import { portalBorshCoder } from '@/commons/utils/portal-borsh-coder';
import { ChainType, Intent, UniversalAddress } from '@/shared/types';

import { AddressNormalizer } from './address-normalizer';

export function isRoute(data: Intent['route'] | Intent['reward']): data is Intent['route'] {
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

function decodeEvmRoute(hex: Hex): Intent['route'] {
  const [decoded] = decodeAbiParameters([EVMRouteAbiItem], hex);
  const d = decoded as {
    salt: `0x${string}`;
    deadline: bigint;
    portal: `0x${string}`;
    nativeAmount: bigint;
    tokens: Array<{ token: `0x${string}`; amount: bigint }>;
    calls: Array<{ target: `0x${string}`; data: `0x${string}`; value: bigint }>;
  };
  return {
    salt: d.salt,
    deadline: d.deadline,
    portal: AddressNormalizer.normalizeEvm(d.portal) as UniversalAddress,
    nativeAmount: d.nativeAmount,
    tokens: d.tokens.map(t => ({
      token: AddressNormalizer.normalizeEvm(t.token) as UniversalAddress,
      amount: t.amount,
    })),
    calls: d.calls.map(c => ({
      target: AddressNormalizer.normalizeEvm(c.target) as UniversalAddress,
      data: c.data,
      value: c.value,
    })),
  };
}

function decodeEvmReward(hex: Hex): Intent['reward'] {
  const [decoded] = decodeAbiParameters([EVMRewardAbiItem], hex);
  const d = decoded as {
    deadline: bigint;
    creator: `0x${string}`;
    prover: `0x${string}`;
    nativeAmount: bigint;
    tokens: Array<{ token: `0x${string}`; amount: bigint }>;
  };
  return {
    deadline: d.deadline,
    creator: AddressNormalizer.normalizeEvm(d.creator) as UniversalAddress,
    prover: AddressNormalizer.normalizeEvm(d.prover) as UniversalAddress,
    nativeAmount: d.nativeAmount,
    tokens: d.tokens.map(t => ({
      token: AddressNormalizer.normalizeEvm(t.token) as UniversalAddress,
      amount: t.amount,
    })),
  };
}

function decodeSvmRoute(hex: Hex): Intent['route'] {
  const bytes = Buffer.from(hex.slice(2), 'hex');
  const decoded = portalBorshCoder.types.decode<RouteInstruction>('Route', bytes);
  const salt = ('0x' + Buffer.from(decoded.salt[0] as number[]).toString('hex')) as Hex;
  const portalBytes = Buffer.from(decoded.portal[0] as number[]);
  const portalPk = new web3.PublicKey(portalBytes);
  return {
    salt,
    deadline: BigInt(decoded.deadline.toString()),
    portal: AddressNormalizer.normalizeSvm(portalPk) as UniversalAddress,
    nativeAmount: BigInt(decoded.native_amount.toString()),
    tokens: (decoded.tokens as Array<{ token: web3.PublicKey; amount: BN }>).map(t => ({
      token: AddressNormalizer.normalizeSvm(t.token) as UniversalAddress,
      amount: BigInt(t.amount.toString()),
    })),
    calls: (decoded.calls as Array<{ target: { 0: number[] }; data: Buffer }>).map(c => ({
      target: AddressNormalizer.normalizeSvm(
        new web3.PublicKey(Buffer.from(c.target[0]))
      ) as UniversalAddress,
      data: ('0x' + Buffer.from(c.data).toString('hex')) as Hex,
      value: 0n,
    })),
  };
}

function decodeSvmReward(hex: Hex): Intent['reward'] {
  const bytes = Buffer.from(hex.slice(2), 'hex');
  const decoded = portalBorshCoder.types.decode<RewardInstruction>('Reward', bytes);
  const creatorPk = decoded.creator as web3.PublicKey;
  const proverPk = decoded.prover as web3.PublicKey;
  return {
    deadline: BigInt(decoded.deadline.toString()),
    creator: AddressNormalizer.normalizeSvm(creatorPk) as UniversalAddress,
    prover: AddressNormalizer.normalizeSvm(proverPk) as UniversalAddress,
    nativeAmount: BigInt(decoded.native_amount.toString()),
    tokens: (decoded.tokens as Array<{ token: web3.PublicKey; amount: BN }>).map(t => ({
      token: AddressNormalizer.normalizeSvm(t.token) as UniversalAddress,
      amount: BigInt(t.amount.toString()),
    })),
  };
}

export class PortalEncoder {
  static isRoute(data: Intent['route'] | Intent['reward']): data is Intent['route'] {
    return isRoute(data);
  }

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

  static decode<K extends 'route' | 'reward'>(hex: Hex, chainType: ChainType, kind: K): Intent[K] {
    switch (chainType) {
      case ChainType.EVM:
      case ChainType.TVM:
        return kind === 'route'
          ? (decodeEvmRoute(hex) as Intent[K])
          : (decodeEvmReward(hex) as Intent[K]);
      case ChainType.SVM:
        return kind === 'route'
          ? (decodeSvmRoute(hex) as Intent[K])
          : (decodeSvmReward(hex) as Intent[K]);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }
}
