/**
 * Portal Encoder Utility
 * Simplified version from the solver for CLI usage
 */

import { encodeAbiParameters, getAbiItem, Hex, parseAbiParameters } from 'viem';
import { ChainType, Intent } from '../interfaces/intent';
import { AddressNormalizer } from './address-normalizer';
import { portalAbi } from '@/commons/abis/portal.abi';
import { toRouteEVMIntent } from './intent-converter';
import { PublicKey } from '@solana/web3.js';
import { BN, BorshCoder } from '@coral-xyz/anchor';
import { portalIdl } from '@/commons/idls/portal.idl';

const svmCoder = new BorshCoder(portalIdl);

export class PortalEncoder {
  /**
   * Encodes Intent route data for a specific chain type
   */
  static encodeRoute(route: Intent['route'], chainType: ChainType): Buffer {
    switch (chainType) {
      case ChainType.EVM:
      case ChainType.TVM:
        return this.encodeEvmRoute(route);
      case ChainType.SVM:
        return this.encodeSvmRoute(route);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * Encodes Intent reward data for a specific chain type
   */
  static encodeReward(reward: Intent['reward'], chainType: ChainType): Buffer {
    switch (chainType) {
      case ChainType.EVM:
        return this.encodeEvmReward(reward);
      case ChainType.TVM:
        return this.encodeTvmReward(reward);
      case ChainType.SVM:
        return this.encodeSvmReward(reward);
      default:
        throw new Error(`Unsupported chain type: ${chainType}`);
    }
  }

  /**
   * EVM route encoding using ABI parameters
   */
  private static encodeEvmRoute(route: Intent['route']): Buffer {
    const EVMRouteAbiItem = getAbiItem({
      abi: portalAbi,
      name: 'isIntentFunded',
    }).inputs[0].components[1];

    const encoded = encodeAbiParameters([EVMRouteAbiItem], [toRouteEVMIntent(route)]);
    return Buffer.from(encoded.slice(2), 'hex'); // Remove 0x prefix
  }

  /**
   * EVM reward encoding using ABI parameters
   */
  private static encodeEvmReward(reward: Intent['reward']): Buffer {
    const encoded = encodeAbiParameters(
      parseAbiParameters('(uint64,address,address,uint256,(address,uint256)[])'),
      [
        [
          reward.deadline,
          AddressNormalizer.denormalize(reward.creator, ChainType.EVM) as `0x${string}`,
          AddressNormalizer.denormalize(reward.prover, ChainType.EVM) as `0x${string}`,
          reward.nativeAmount,
          reward.tokens.map(
            t =>
              [
                AddressNormalizer.denormalize(t.token, ChainType.EVM) as `0x${string}`,
                t.amount,
              ] as const
          ),
        ],
      ]
    );
    return Buffer.from(encoded.slice(2), 'hex'); // Remove 0x prefix
  }

  /**
   * TVM route encoding using JSON with Base58 addresses
   */
  private static encodeTvmRoute(route: Intent['route']): Buffer {
    const tvmData = {
      salt: route.salt,
      deadline: route.deadline.toString(),
      portal: AddressNormalizer.denormalize(route.portal, ChainType.TVM),
      tokens: route.tokens.map(t => ({
        token: AddressNormalizer.denormalize(t.token, ChainType.TVM),
        amount: t.amount.toString(),
      })),
      calls: route.calls.map(c => ({
        target: AddressNormalizer.denormalize(c.target, ChainType.TVM),
        data: c.data,
        value: c.value.toString(),
      })),
    };
    return Buffer.from(JSON.stringify(tvmData), 'utf8');
  }

  /**
   * TVM reward encoding using JSON
   */
  private static encodeTvmReward(reward: Intent['reward']): Buffer {
    const tvmData = {
      deadline: reward.deadline.toString(),
      creator: AddressNormalizer.denormalize(reward.creator, ChainType.TVM),
      prover: AddressNormalizer.denormalize(reward.prover, ChainType.TVM),
      nativeAmount: reward.nativeAmount.toString(),
      tokens: reward.tokens.map(t => ({
        token: AddressNormalizer.denormalize(t.token, ChainType.TVM),
        amount: t.amount.toString(),
      })),
    };
    return Buffer.from(JSON.stringify(tvmData), 'utf8');
  }

  /**
   * SVM route encoding using simplified JSON
   */
  private static encodeSvmRoute(route: Intent['route']): Buffer {
    // Use Anchor's BorshCoder for proper Solana serialization
    const { salt, deadline, portal, tokens, calls } = route;

    const saltBytes = Buffer.from(salt.slice(2), 'hex');
    const portalBytes = new PublicKey(portal).toBytes();

    return svmCoder.types.encode('Route', {
      salt: { 0: Array.from(saltBytes) }, // Bytes32 struct format
      deadline: new BN(deadline.toString()), // Convert BigInt to BN for u64
      portal: { 0: Array.from(portalBytes) }, // Bytes32 struct format
      tokens: tokens.map(({ token, amount }) => ({
        token: new PublicKey(token),
        amount: new BN(amount.toString()), // Convert BigInt to BN for u64
      })),
      calls: calls.map(({ target, data, value }) => ({
        target: { 0: Array.from(new PublicKey(target).toBytes()) }, // Bytes32 struct format
        data: Buffer.from(data.slice(2), 'hex'), // Keep as Buffer for bytes type
        value: new BN(value.toString()), // Convert BigInt to BN for u64
      })),
    });
  }

  /**
   * SVM reward encoding using JSON
   */
  private static encodeSvmReward(reward: Intent['reward']): Buffer {
    const svmData = {
      deadline: reward.deadline.toString(),
      creator: AddressNormalizer.denormalize(reward.creator, ChainType.SVM),
      prover: AddressNormalizer.denormalize(reward.prover, ChainType.SVM),
      nativeAmount: reward.nativeAmount.toString(),
      tokens: reward.tokens.map(t => ({
        token: AddressNormalizer.denormalize(t.token, ChainType.SVM),
        amount: t.amount.toString(),
      })),
    };
    return Buffer.from(JSON.stringify(svmData), 'utf8');
  }
}
