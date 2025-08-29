import { encodeFunctionData, keccak256, toHex } from 'viem';
import {
  IntentCreationParams,
  TokenInfo,
  TokenTransferIntent,
  TransferCall,
  VMType,
} from '@/types';
import { AddressManager } from '@/utils';

export class MultiVMIntentBuilder {
  constructor(private addressManager: AddressManager) {}

  buildTokenTransferIntent(params: IntentCreationParams): TokenTransferIntent {
    // Validate addresses for respective VMs
    if (!this.addressManager.validateAddress(params.recipient, params.destinationChain.vmType)) {
      throw new Error(`Invalid recipient address for ${params.destinationChain.vmType}`);
    }

    // Validate token addresses
    if (
      !this.addressManager.validateAddress(
        params.routeToken.address,
        params.destinationChain.vmType
      )
    ) {
      throw new Error(`Invalid route token address for ${params.destinationChain.vmType}`);
    }

    if (
      !this.addressManager.validateAddress(params.rewardToken.address, params.sourceChain.vmType)
    ) {
      throw new Error(`Invalid reward token address for ${params.sourceChain.vmType}`);
    }

    // Generate random salt
    const salt =
      '0x' +
      crypto
        .getRandomValues(new Uint8Array(32))
        .reduce((acc, byte) => acc + byte.toString(16).padStart(2, '0'), '');

    // Calculate deadlines
    const now = Math.floor(Date.now() / 1000);
    const routeDeadline = BigInt(now + params.deadlines.route * 3600);
    const refundDeadline = BigInt(now + params.deadlines.refund * 3600);

    // Build transfer call based on destination VM
    const transferCall = this.encodeTransferCall(
      params.routeToken,
      params.recipient,
      params.destinationChain.vmType
    );

    // Construct intent with VM-specific formatting
    return {
      sourceVM: params.sourceChain.vmType,
      destinationVM: params.destinationChain.vmType,
      destinationChainId: this.getChainId(params.destinationChain),
      route: {
        salt,
        deadline: routeDeadline,
        portal: params.destinationChain.portalAddress,
        requiredTokens: [
          {
            token: params.routeToken.address,
            amount: params.routeToken.amount,
            vmType: params.destinationChain.vmType,
          },
        ],
        calls: [transferCall],
      },
      reward: {
        deadline: refundDeadline,
        creator: params.sourceChain.portalAddress, // Creator is the source chain portal
        prover: '0xde255Aab8e56a6Ae6913Df3a9Bbb6a9f22367f4C',
        nativeValue: BigInt(0),
        tokens: [
          {
            token: params.rewardToken.address,
            amount: params.rewardToken.amount,
            vmType: params.sourceChain.vmType,
          },
        ],
      },
    };
  }

  calculateIntentHash(intent: TokenTransferIntent): string {
    // Create a deterministic hash of the intent
    const intentData = {
      sourceVM: intent.sourceVM,
      destinationVM: intent.destinationVM,
      chainId: intent.destinationChainId.toString(),
      route: {
        salt: intent.route.salt,
        deadline: intent.route.deadline.toString(),
        portal: intent.route.portal,
        requiredTokens: intent.route.requiredTokens.map((token) => ({
          token: token.token,
          amount: token.amount.toString(),
          vmType: token.vmType,
        })),
        calls: intent.route.calls.map((call) => ({
          target: call.target,
          value: call.value.toString(),
          callData: call.callData,
          vmType: call.vmType,
        })),
      },
      reward: {
        deadline: intent.reward.deadline.toString(),
        creator: intent.reward.creator,
        prover: intent.reward.prover,
        nativeValue: intent.reward.nativeValue.toString(),
        tokens: intent.reward.tokens.map((token) => ({
          token: token.token,
          amount: token.amount.toString(),
          vmType: token.vmType,
        })),
      },
    };

    const intentString = JSON.stringify(intentData);
    return keccak256(toHex(intentString));
  }

  private encodeTransferCall(token: TokenInfo, recipient: string, vmType: VMType): TransferCall {
    switch (vmType) {
      case 'EVM':
        return this.encodeEVMTransfer(token, recipient);
      case 'TVM':
        return this.encodeTVMTransfer(token, recipient);
      case 'SVM':
        return this.encodeSVMTransfer(token, recipient);
      default:
        throw new Error(`Unsupported VM type: ${vmType}`);
    }
  }

  private encodeEVMTransfer(token: TokenInfo, recipient: string): TransferCall {
    // Standard ERC20 transfer function
    const erc20TransferAbi = [
      {
        name: 'transfer',
        type: 'function',
        inputs: [
          { name: 'to', type: 'address' },
          { name: 'amount', type: 'uint256' },
        ],
        outputs: [{ name: '', type: 'bool' }],
        stateMutability: 'nonpayable',
      },
    ];

    const callData = encodeFunctionData({
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, token.amount],
    });

    return {
      target: token.address,
      value: BigInt(0),
      callData,
      vmType: 'EVM',
    };
  }

  private encodeTVMTransfer(token: TokenInfo, recipient: string): TransferCall {
    // TVM uses different encoding - simplified for demo
    const functionSelector = 'transfer(address,uint256)';
    const parameters = [
      { type: 'address', value: recipient },
      { type: 'uint256', value: token.amount.toString() },
    ];

    // In a real implementation, this would use TronWeb's encoding
    const callData = this.encodeTronTransaction(functionSelector, parameters);

    return {
      target: token.address,
      value: BigInt(0),
      callData,
      vmType: 'TVM',
    };
  }

  private encodeSVMTransfer(token: TokenInfo, recipient: string): TransferCall {
    // Solana uses instruction data - simplified for demo
    const instruction = {
      programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // SPL Token Program
      keys: [
        { pubkey: token.address, isSigner: false, isWritable: true },
        { pubkey: recipient, isSigner: false, isWritable: true },
      ],
      data: Buffer.from([
        3, // Transfer instruction
        ...this.serializeU64(token.amount), // Amount as u64 little-endian
      ]),
    };

    const callData = this.serializeInstruction(instruction);

    return {
      target: token.address,
      value: BigInt(0),
      callData,
      vmType: 'SVM',
    };
  }

  private encodeTronTransaction(functionSelector: string, parameters: any[]): string {
    // Simplified Tron transaction encoding
    // In a real implementation, this would use TronWeb's ABI encoding
    const encoded = {
      function: functionSelector,
      params: parameters,
    };
    return JSON.stringify(encoded);
  }

  private serializeInstruction(instruction: any): string {
    // Simplified Solana instruction serialization
    // In a real implementation, this would use proper Solana serialization
    return JSON.stringify(instruction);
  }

  private serializeU64(value: bigint): number[] {
    // Convert bigint to u64 little-endian bytes
    const bytes = [];
    let num = value;
    for (let i = 0; i < 8; i++) {
      bytes.push(Number(num & BigInt(0xff)));
      num = num >> BigInt(8);
    }
    return bytes;
  }

  private getChainId(chain: { chainId: string | number; vmType: VMType }): string | bigint {
    if (chain.vmType === 'EVM') {
      return BigInt(chain.chainId as number);
    }
    return chain.chainId as string;
  }
}
