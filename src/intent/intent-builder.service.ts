import { Injectable } from '@nestjs/common';
import { encodeFunctionData, erc20Abi, Hex } from 'viem';
import { Intent, UniversalAddress, ChainConfig } from '@/shared/types';
import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { PortalEncoderService } from '@/blockchain/encoding/portal-encoder.service';
import { ConfigService } from '@/config/config.service';

export interface RewardParams {
  sourceChain: ChainConfig;
  creator: UniversalAddress;
  prover: UniversalAddress;
  rewardToken: UniversalAddress;
  rewardAmount: bigint;
  deadline?: bigint;
}

export interface ManualRouteParams {
  destChain: ChainConfig;
  recipient: UniversalAddress;
  routeToken: UniversalAddress;
  routeAmount: bigint;
  portal: UniversalAddress;
  deadline?: bigint;
}

@Injectable()
export class IntentBuilder {
  constructor(
    private readonly config: ConfigService,
    private readonly encoder: PortalEncoderService,
    private readonly normalizer: AddressNormalizerService,
  ) {}

  buildReward(params: RewardParams): Intent['reward'] {
    const deadlineOffset = BigInt(this.config.getDeadlineOffsetSeconds());
    const deadline = params.deadline ?? BigInt(Math.floor(Date.now() / 1000)) + deadlineOffset;
    return {
      deadline,
      creator: params.creator,
      prover: params.prover,
      nativeAmount: 0n,
      tokens: [{ token: params.rewardToken, amount: params.rewardAmount }],
    };
  }

  buildManualRoute(params: ManualRouteParams): { encodedRoute: Hex; route: Intent['route'] } {
    const deadlineOffset = BigInt(this.config.getDeadlineOffsetSeconds());
    const deadline = params.deadline ?? BigInt(Math.floor(Date.now() / 1000)) + deadlineOffset;
    const salt = this.generateSalt();

    // Build ERC-20 transfer call to recipient
    const recipientAddr = this.normalizer.denormalizeToEvm(params.recipient);
    const transferData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipientAddr, params.routeAmount],
    });

    const route: Intent['route'] = {
      salt,
      deadline,
      portal: params.portal,
      nativeAmount: 0n,
      tokens: [{ token: params.routeToken, amount: params.routeAmount }],
      calls: [{ target: params.routeToken, data: transferData, value: 0n }],
    };

    const encodedRoute = this.encoder.encode(route, params.destChain.type);
    return { encodedRoute, route };
  }

  private generateSalt(): Hex {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return `0x${Buffer.from(bytes).toString('hex')}` as Hex;
  }
}
