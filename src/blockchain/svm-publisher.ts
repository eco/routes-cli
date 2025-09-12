/**
 * SVM (Solana) Chain Publisher
 */

import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  Transaction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import { Program, AnchorProvider, Wallet, BN } from '@coral-xyz/anchor';
import {
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { BasePublisher, PublishResult } from './base-publisher';
import { Intent, ChainType } from '../core/interfaces/intent';
import { AddressNormalizer } from '../core/utils/address-normalizer';
import { PortalEncoder } from '../core/utils/portal-encoder';
import { getChainById } from '../config/chains';
import { logger } from '../utils/logger';
import { portalIdl } from '../commons/idls/portal.idl';
import { Hex, keccak256 } from 'viem';

export class SvmPublisher extends BasePublisher {
  private connection: Connection;

  constructor(rpcUrl: string) {
    super(rpcUrl);
    this.connection = new Connection(rpcUrl, {
      commitment: 'confirmed',
      disableRetryOnRateLimit: true,
      wsEndpoint: undefined,
      confirmTransactionInitialTimeout: 60000,
    });
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
    } catch (error: any) {
      logger.stopSpinner();
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  async getBalance(address: string, chainId?: bigint): Promise<bigint> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return BigInt(balance);
    } catch (error) {
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
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Validation failed',
      };
    }
  }

  private parsePrivateKey(privateKey: string): Keypair {
    if (privateKey.startsWith('[') && privateKey.endsWith(']')) {
      const bytes = JSON.parse(privateKey);
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    } else if (privateKey.includes(',')) {
      // Comma-separated format: 1,2,3,...
      const bytes = privateKey.split(',').map(b => parseInt(b.trim()));
      return Keypair.fromSecretKey(new Uint8Array(bytes));
    } else {
      // Base58 format
      const bs58 = require('bs58');
      const bytes = bs58.decode(privateKey);
      return Keypair.fromSecretKey(bytes);
    }
  }

  private async confirmTransactionPolling(
    signature: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
  ): Promise<void> {
    const maxRetries = 30; // 30 seconds with 1 second intervals
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const result = await this.connection.getSignatureStatus(signature, {
          searchTransactionHistory: true,
        });

        if (
          result?.value?.confirmationStatus === commitment ||
          result?.value?.confirmationStatus === 'finalized'
        ) {
          if (result.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
          }
          logger.info(`Transaction confirmed with ${result.value.confirmationStatus} commitment`);
          return;
        }

        if (result?.value?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
        }
      } catch (error) {
        if (retries === maxRetries - 1) {
          throw error;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
      retries++;
    }

    throw new Error(`Transaction confirmation timeout after ${maxRetries} seconds`);
  }

  private encodeRouteForDestination(intent: Intent): Buffer {
    const destChain = getChainById(intent.destination);
    if (!destChain) {
      throw new Error(`Unknown destination chain: ${intent.destination}`);
    }

    // Use PortalEncoder to encode route for the destination chain type
    return PortalEncoder.encodeRoute(intent.route, destChain.type);
  }
  
  async publish(intent: Intent, privateKey: string): Promise<PublishResult> {
    try {
      const keypair = this.parsePrivateKey(privateKey);
      const chainConfig = getChainById(intent.sourceChainId);
      if (!chainConfig?.portalAddress) {
        throw new Error(`No Portal address configured for chain ${intent.sourceChainId}`);
      }
      
      const portalProgramId = new PublicKey(
        AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.SVM)
      );

      logger.info(`Using Portal Program: ${portalProgramId.toString()}`);
      logger.info(`Creator: ${keypair.publicKey.toString()}`);
      logger.info(`Destination Chain: ${intent.destination}`);
      
      const wallet = new Wallet(keypair);
      const provider = new AnchorProvider(this.connection, wallet, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 3,
      });

      logger.info('Setting up Anchor program...');
      let program: Program = new Program(portalIdl, provider);
      

      const routeBytes = this.encodeRouteForDestination(intent);
      const routeHash = keccak256(routeBytes);
      console.log("MADDEN: Route hash: ", routeHash)

      const portalReward = {
        deadline: new BN(intent.reward.deadline),
        creator: new PublicKey(AddressNormalizer.denormalize(intent.reward.creator, ChainType.SVM)),
        prover: new PublicKey(AddressNormalizer.denormalize(intent.reward.prover, ChainType.SVM)),
        nativeAmount: new BN(intent.reward.nativeAmount),
        tokens: intent.reward.tokens.map((token) => ({
          token: new PublicKey(AddressNormalizer.denormalize(token.token, ChainType.SVM)),
          amount: new BN(token.amount),
        })),
      };

      logger.info('Building publish transaction...');
      const transaction = await program.methods
        .publish({
          destination: new BN(intent.destination),
          route: routeBytes,
          reward: portalReward,
        })
        .accounts({})
        .transaction();

      logger.spinner('Publishing intent to Solana network...');
      
      const signature = await this.connection.sendTransaction(transaction, [keypair], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      logger.info(`Intent published! Transaction signature: ${signature}`);
      
      await this.confirmTransactionPolling(signature, 'confirmed');
      
      logger.succeed('Transaction confirmed');

      // add funding
      const fundingResult = await this.fundIntent(intent, privateKey, intent.intentHash!, routeHash);
      if (fundingResult.success) logger.info(`Funding successful: ${fundingResult.transactionHash}`);
      
      return {
        success: true,
        transactionHash: signature,
        intentHash: intent.intentHash,
      };
    } catch (error: any) {
      logger.stopSpinner();
      logger.error(`Transaction failed: ${error.message}`);
      
      let errorMessage = error.message || 'Unknown error';
      if (error.logs) {
        errorMessage += `\nLogs: ${error.logs.join('\n')}`;
      }
      if (error.err) {
        errorMessage += `\nError: ${JSON.stringify(error.err)}`;
      }
    }
  }

  /**
   * Fund an intent on Solana (optional functionality)
   */
  async fundIntent(
    intent: Intent, 
    privateKey: string,
    intentHash: string,
    routeHash: Hex,
  ): Promise<PublishResult> {
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

      // Set up Anchor Provider and Portal Program
      const wallet = new Wallet(keypair);
      const provider = new AnchorProvider(this.connection, wallet, {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 3,
      });

      const program = new Program(portalIdl, provider);
      console.log("ARGS: ", portalProgramId, intentHash);

      // Calculate vault PDA from intent hash
      const intentHashBytes = new Uint8Array(Buffer.from(intentHash.slice(2), 'hex'));
      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault'), intentHashBytes],
        portalProgramId
      );

      logger.info(`Vault PDA: ${vaultPda.toString()}`);

      // Get token accounts for funding
      if (intent.reward.tokens.length === 0) {
        throw new Error('No reward tokens to fund');
      }

      const tokenMint = new PublicKey(
        AddressNormalizer.denormalize(intent.reward.tokens[0].token, ChainType.SVM)
      );
      const funderTokenAccount = await getAssociatedTokenAddress(tokenMint, keypair.publicKey);
      const vaultTokenAccount = await getAssociatedTokenAddress(
        tokenMint,
        vaultPda,
        true, // allowOwnerOffCurve for PDA
      );

      // Check if funder token account exists, if not create it first
      const funderAccountInfo = await this.connection.getAccountInfo(funderTokenAccount);
      if (!funderAccountInfo) {
        logger.info("Creating funder token account...");
        
        const createFunderTokenAccountIx = createAssociatedTokenAccountInstruction(
          keypair.publicKey, // payer
          funderTokenAccount, // associated token account
          keypair.publicKey, // owner
          tokenMint, // mint
        );

        const createAccountTx = new Transaction().add(createFunderTokenAccountIx);
        const createAccountSig = await this.connection.sendTransaction(createAccountTx, [keypair], {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });

        logger.info(`Created funder token account: ${createAccountSig}`);
        await this.confirmTransactionPolling(createAccountSig, 'confirmed');
      }
      
      const portalReward = {
        deadline: new BN(intent.reward.deadline),
        creator: new PublicKey(AddressNormalizer.denormalize(intent.reward.creator, ChainType.SVM)),
        prover: new PublicKey(AddressNormalizer.denormalize(intent.reward.prover, ChainType.SVM)),
        nativeAmount: new BN(intent.reward.nativeAmount),
        tokens: intent.reward.tokens.map((token) => ({
          token: new PublicKey(AddressNormalizer.denormalize(token.token, ChainType.SVM)),
          amount: new BN(token.amount),
        })),
      };

      console.log("MADDEN: Route hash bytes: ", Buffer.from(routeHash.slice(2), 'hex'))
      const fundArgs = {
        destination: new BN(intent.destination),
        route_hash: Array.from(Buffer.from(routeHash.slice(2), 'hex')), // Convert to array for Borsh
        reward: portalReward,
        allow_partial: false,
      };

      // Prepare token transfer accounts
      const tokenTransferAccounts = [
        { pubkey: funderTokenAccount, isWritable: true, isSigner: false },
        { pubkey: vaultTokenAccount, isWritable: true, isSigner: false },
        { pubkey: tokenMint, isWritable: false, isSigner: false },
      ];

      logger.info('Building funding transaction...');

      // Build the funding transaction
      const fundingTransaction = await program.methods
        .fund(fundArgs)
        .accountsStrict({
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
          systemProgram: new PublicKey('11111111111111111111111111111111'),
          token2022Program: TOKEN_2022_PROGRAM_ID,
          tokenProgram: TOKEN_PROGRAM_ID,
          vault: vaultPda,
          payer: keypair.publicKey,
          funder: keypair.publicKey,
        })
        .remainingAccounts(tokenTransferAccounts)
        .transaction();

      logger.spinner('Funding intent on Solana network...');

      const instructionData = Buffer.from(fundingTransaction.instructions[0].data)
      Buffer.from(routeHash.slice(2), 'hex').copy(instructionData, 16)
      fundingTransaction.instructions[0].data = instructionData


      // Send the funding transaction
      logger.info('Sending funding transaction...');
      const fundingSignature = await this.connection.sendTransaction(fundingTransaction, [keypair], {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      logger.info(`Intent funding transaction signature: ${fundingSignature}`);
      
      // Confirm the funding transaction
      await this.confirmTransactionPolling(fundingSignature, 'confirmed');
      
      logger.succeed('Intent funded and confirmed!');

      return {
        success: true,
        transactionHash: fundingSignature,
        intentHash: intentHash,
      };
    } catch (error: any) {
      logger.stopSpinner();
      logger.error(`Funding failed: ${error.message}`);
      
      return {
        success: false,
        error: error.message || 'Funding failed',
      };
    }
  }
  
  async getBalance(address: string, chainId?: bigint): Promise<bigint> {
    try {
      const publicKey = new PublicKey(address);
      const balance = await this.connection.getBalance(publicKey);
      return BigInt(balance);
    } catch (error) {
      return 0n;
    }
  }
  
  async validate(intent: Intent, senderAddress: string): Promise<{ valid: boolean; error?: string }> {
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

      try {
        const proverAddress = AddressNormalizer.denormalize(intent.reward.prover, ChainType.SVM);
        new PublicKey(proverAddress);
      } catch {
        return {
          valid: false,
          error: 'Invalid Solana prover address',
        };
      }

      // Validate token addresses if any
      for (const token of intent.reward.tokens) {
        try {
          const tokenAddress = AddressNormalizer.denormalize(token.token, ChainType.SVM);
          new PublicKey(tokenAddress);
        } catch {
          return {
            valid: false,
            error: `Invalid Solana token address: ${token.token}`,
          };
        }
      }
      
      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || 'Validation failed',
      };
    }
  }
}
