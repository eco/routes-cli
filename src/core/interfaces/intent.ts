/**
 * Intent Interface
 * Simplified version from the solver for CLI usage
 */

import { Hex } from 'viem';
import { UniversalAddress } from '../types/universal-address';

export interface Intent {
  intentHash?: Hex; // Generated after creation
  destination: bigint; // Target chain ID
  sourceChainId: bigint; // Source chain ID
  route: {
    salt: Hex;
    deadline: bigint;
    portal: UniversalAddress;
    nativeAmount: bigint;
    tokens: Array<{
      amount: bigint;
      token: UniversalAddress;
    }>;
    calls: Array<{
      data: Hex;
      target: UniversalAddress;
      value: bigint;
    }>;
  };
  reward: {
    deadline: bigint;
    creator: UniversalAddress;
    prover: UniversalAddress;
    nativeAmount: bigint;
    tokens: Array<{
      amount: bigint;
      token: UniversalAddress;
    }>;
  };
}

export enum ChainType {
  EVM = 'EVM',
  TVM = 'TVM',
  SVM = 'SVM'
}