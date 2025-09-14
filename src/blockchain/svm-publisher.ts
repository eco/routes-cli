/**
 * SVM (Solana) Chain Publisher
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';

import { getChainById } from '@/config/chains';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { PortalEncoder } from '@/core/utils/portal-encoder';
import { logger } from '@/utils/logger';

import { BasePublisher, PublishResult } from './base-publisher';

export class SvmPublisher extends BasePublisher {
  private connection: Connection;

  constructor(rpcUrl: string) {
    super(rpcUrl);
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  async publish(intent: Intent, privateKey: string): Promise<PublishResult> {
    try {
      const keypair = this.parsePrivateKey(privateKey);

      // Get Portal program ID
      const chainConfig = getChainById(intent.sourceChainId);
      if (!chainConfig?.portalAddress) {
        throw new Error(`No Portal address configured for chain ${intent.sourceChainId}`);
      }

      const portalProgramId = new PublicKey(
        AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.SVM)
      );

      // Encode route for destination chain type
      const destChainType = chainConfig.type;
      const routeEncoded = PortalEncoder.encode(intent.route, destChainType);

      // Create instruction data
      // Note: This is a simplified version - actual implementation would need proper Borsh serialization
      const instructionData = Buffer.concat([
        Buffer.from([0]), // Instruction index for 'publish'
        Buffer.from(intent.destination.toString(16).padStart(16, '0'), 'hex'), // destination
        Buffer.from([routeEncoded.length]), // route length
        Buffer.from(routeEncoded), // route data
        this.encodeReward(intent.reward), // reward data
      ]);

      // Create instruction
      const instruction = new TransactionInstruction({
        keys: [
          { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
          // Add other required accounts (Portal PDA, vault, etc.)
        ],
        programId: portalProgramId,
        data: instructionData,
      });

      // Create and send transaction
      const transaction = new Transaction().add(instruction);

      logger.spinner('Publishing intent to Solana network...');
      const signature = await sendAndConfirmTransaction(this.connection, transaction, [keypair], {
        commitment: 'confirmed',
      });

      logger.succeed('Transaction confirmed');

      return {
        success: true,
        transactionHash: signature,
        intentHash: intent.intentHash,
      };
    } catch (error: unknown) {
      logger.stopSpinner();
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  async getBalance(address: string, _chainId?: bigint): Promise<bigint> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return BigInt(balance);
    } catch {
      return 0n;
    }
  }

  async validate(
    intent: Intent,
    senderAddress: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if sender has enough balance for reward native amount
      const balance = await this.getBalance(senderAddress);

      if (balance < intent.reward.nativeAmount) {
        return {
          valid: false,
          error: `Insufficient SOL balance. Required: ${intent.reward.nativeAmount}, Available: ${balance}`,
        };
      }

      // Validate addresses
      try {
        const creatorAddress = AddressNormalizer.denormalize(intent.reward.creator, ChainType.SVM);
        new PublicKey(creatorAddress);
      } catch {
        return {
          valid: false,
          error: 'Invalid Solana creator address',
        };
      }

      return { valid: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return {
        valid: false,
        error: errorMessage,
      };
    }
  }

  private parsePrivateKey(privateKey: string): Keypair {
    // Handle different private key formats
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
      // Array format: [1,2,3,...]
      const bytes = JSON.parse(privateKey);
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    } else if (privateKey.includes(',')) {
      // Comma-separated format: 1,2,3,...
      const bytes = privateKey.split(',').map(b => parseInt(b.trim()));
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    } else {
      // Base58 format
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const bs58 = require('bs58');
      const bytes = bs58.decode(privateKey);
      return Keypair.fromSecretKey(bytes);
    }
  }

  private encodeReward(reward: Intent['reward']): Buffer {
    // Simplified encoding - actual implementation would use Borsh
    const parts: Buffer[] = [];

    // Deadline
    parts.push(Buffer.from(reward.deadline.toString(16).padStart(16, '0'), 'hex'));

    // Creator
    const creator = AddressNormalizer.denormalize(reward.creator, ChainType.SVM);
    parts.push(new PublicKey(creator).toBuffer());

    // Prover
    const prover = AddressNormalizer.denormalize(reward.prover, ChainType.SVM);
    parts.push(new PublicKey(prover).toBuffer());

    // Native amount
    parts.push(Buffer.from(reward.nativeAmount.toString(16).padStart(16, '0'), 'hex'));

    // Tokens (simplified)
    parts.push(Buffer.from([reward.tokens.length]));
    for (const token of reward.tokens) {
      const tokenAddress = AddressNormalizer.denormalize(token.token, ChainType.SVM);
      parts.push(new PublicKey(tokenAddress).toBuffer());
      parts.push(Buffer.from(token.amount.toString(16).padStart(16, '0'), 'hex'));
    }

    return Buffer.concat(parts);
  }
}
