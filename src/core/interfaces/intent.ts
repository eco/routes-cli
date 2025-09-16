/**
 * Intent Interface
 *
 * Defines the structure for cross-chain intent objects used throughout the
 * Routes CLI system. An Intent represents a request to execute operations
 * on one blockchain (route) in exchange for rewards on another blockchain.
 *
 * All addresses in the Intent structure use UniversalAddress format to enable
 * cross-chain compatibility. Publishers must denormalize these addresses to
 * chain-native formats before blockchain operations.
 *
 * @example
 * ```typescript
 * const intent: Intent = {
 *   destination: 10n,  // Optimism chain ID
 *   sourceChainId: 1n, // Ethereum chain ID
 *   route: {
 *     portal: '0x742d35cc6634c0532925a3b8d65c32c2b3f6de1b000000000000000000000000',
 *     tokens: [{ token: '0xa0b86a33...', amount: 1000n }],
 *     calls: [{ target: '0x567abc...', data: '0x', value: 0n }],
 *     // ... other route properties
 *   },
 *   reward: {
 *     creator: '0x123def...',
 *     tokens: [{ token: '0xfed789...', amount: 500n }],
 *     // ... other reward properties
 *   }
 * };
 * ```
 */

import { Hex } from 'viem';

import { UniversalAddress } from '../types/universal-address';

/**
 * Cross-chain intent object containing route execution and reward information.
 *
 * An Intent defines:
 * - What operations to execute on the destination chain (route)
 * - What rewards to provide for execution (reward)
 * - Chain identifiers for source and destination
 * - Unique hash for tracking and verification
 */
export interface Intent {
  /** Unique hash identifying this intent (computed after creation) */
  intentHash?: Hex;
  /** Chain ID of the destination blockchain where route will be executed */
  destination: bigint;
  /** Chain ID of the source blockchain where reward is offered */
  sourceChainId: bigint;
  /** Route definition - operations to execute on the destination chain */
  route: {
    /** Random salt for uniqueness and replay protection */
    salt: Hex;
    /** Deadline timestamp (Unix seconds) for route execution */
    deadline: bigint;
    /** Portal contract address on destination chain (UniversalAddress format) */
    portal: UniversalAddress;
    /** Native token amount to include in route execution */
    nativeAmount: bigint;
    /** ERC20/equivalent tokens to include in route execution */
    tokens: Array<{
      /** Token amount in smallest unit */
      amount: bigint;
      /** Token contract address (UniversalAddress format) */
      token: UniversalAddress;
    }>;
    /** Smart contract calls to execute on destination chain */
    calls: Array<{
      /** Calldata for the contract call */
      data: Hex;
      /** Target contract address (UniversalAddress format) */
      target: UniversalAddress;
      /** Native token value to send with call */
      value: bigint;
    }>;
  };
  /** Reward definition - incentives offered for route execution */
  reward: {
    /** Deadline timestamp (Unix seconds) for reward claiming */
    deadline: bigint;
    /** Address that created and funds the reward (UniversalAddress format) */
    creator: UniversalAddress;
    /** Address authorized to prove and claim the reward (UniversalAddress format) */
    prover: UniversalAddress;
    /** Native token amount offered as reward */
    nativeAmount: bigint;
    /** ERC20/equivalent tokens offered as reward */
    tokens: Array<{
      /** Token amount in smallest unit */
      amount: bigint;
      /** Token contract address (UniversalAddress format) */
      token: UniversalAddress;
    }>;
  };
}

/**
 * Blockchain type enumeration.
 *
 * Identifies the virtual machine type and protocol family for different
 * blockchain networks. Used throughout the system for chain-specific
 * address handling, encoding, and transaction processing.
 */
export enum ChainType {
  /** Ethereum Virtual Machine chains (Ethereum, Optimism, Base, Arbitrum, etc.) */
  EVM = 'EVM',
  /** Tron Virtual Machine chains (Tron mainnet, Shasta testnet, etc.) */
  TVM = 'TVM',
  /** Solana Virtual Machine chains (Solana mainnet, devnet, testnet) */
  SVM = 'SVM',
}
