import { VMType } from './vm.js';
import { TokenAmount, TokenInfo } from './token.js';
import { ChainConfig } from './chain.js';

export interface TransferCall {
  target: string;
  value: bigint;
  callData: string;
  vmType: VMType;
}

export interface TokenRoute {
  salt: string;
  deadline: bigint;
  portal: string;
  requiredTokens: TokenAmount[];
  calls: TransferCall[];
}

export interface TokenReward {
  deadline: bigint;
  creator: string;
  prover: string;
  nativeValue: bigint;
  tokens: TokenAmount[];
}

export interface TokenTransferIntent {
  sourceVM: VMType;
  destinationVM: VMType;
  destinationChainId: string | bigint;
  route: TokenRoute;
  reward: TokenReward;
}

export interface IntentCreationParams {
  sourceChain: ChainConfig;
  destinationChain: ChainConfig;
  routeToken: TokenInfo;
  rewardToken: TokenInfo;
  recipient: string;
  deadlines: {
    route: number;
    refund: number;
  };
}

export interface IntentInfo {
  intentHash: string;
  vaultAddress: string;
  sourceChain: string;
  sourceVM: VMType;
  destinationChain: string;
  destinationVM: VMType;
  status: 'created' | 'funded' | 'completed';
  transactionHash?: string;
  isCrossVM: boolean;
}
