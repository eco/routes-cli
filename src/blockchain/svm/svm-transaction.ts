/**
 * SVM (Solana) Transaction Building and Management
 * Handles transaction construction, sending, and confirmation for Solana
 */

import { AnchorProvider, BN, Program, Wallet } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';

import { getPortalIdl } from '@/commons/idls/portal.idl';
import { PortalIdl } from '@/commons/types/portal-idl.type';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { PublishResult } from '../base-publisher';

import { createPdaSeedBuffer, hexToArray, hexToBuffer } from './svm-buffer-utils';
import {
  SVM_CONFIRMATION_CONFIG,
  SVM_ERROR_MESSAGES,
  SVM_LOG_MESSAGES,
  SVM_PDA_SEEDS,
  SVM_PROVIDER_CONFIG,
} from './svm-constants';
import { extractIntentPublishedEvent, logTransactionDetails } from './svm-decode';
import {
  createTokenAccountIfNeeded,
  getOrCreateVaultTokenAccount,
  prepareTokenTransferAccounts,
} from './svm-token-operations';
import {
  AnchorSetupResult,
  PublishContext,
  SvmError,
  SvmErrorType,
  TransactionResultWithDecoding,
} from './svm-types';

/**
 * Sets up Anchor provider and program for Solana interactions
 */
export function setupAnchorProgram(
  connection: Connection,
  context: PublishContext
): AnchorSetupResult {
  const wallet = new Wallet(context.keypair);
  const provider = new AnchorProvider(connection, wallet, SVM_PROVIDER_CONFIG);

  const idl = getPortalIdl(context.portalProgramId.toBase58());
  const program = new Program(idl, provider);

  return { program, provider };
}

/**
 * Converts Intent reward to Solana-specific format
 */
export function buildPortalReward(reward: Intent['reward']) {
  return {
    deadline: new BN(reward.deadline),
    creator: new PublicKey(AddressNormalizer.denormalize(reward.creator, ChainType.SVM)),
    prover: new PublicKey(AddressNormalizer.denormalize(reward.prover, ChainType.SVM)),
    nativeAmount: new BN(reward.nativeAmount),
    tokens: reward.tokens.map(token => ({
      token: new PublicKey(AddressNormalizer.denormalize(token.token, ChainType.SVM)),
      amount: new BN(token.amount),
    })),
  };
}

/**
 * Calculates the vault PDA for an intent
 */
export function calculateVaultPDA(intentHash: string, portalProgramId: PublicKey): PublicKey {
  const intentHashBytes = hexToBuffer(intentHash);
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [createPdaSeedBuffer(SVM_PDA_SEEDS.VAULT), intentHashBytes],
    portalProgramId
  );

  return vaultPda;
}

/**
 * Builds a publish transaction for Solana
 */
export async function buildPublishTransaction(
  program: Program,
  context: PublishContext
): Promise<Transaction> {
  const routeBytes = hexToBuffer(context.encodedRoute);
  const portalReward = buildPortalReward(context.reward);

  logger.info(SVM_LOG_MESSAGES.BUILD_PUBLISH_TX);

  const transaction = await program.methods
    .publish({
      destination: new BN(context.destination),
      route: routeBytes,
      reward: portalReward,
    })
    .accounts({})
    .transaction();

  return transaction;
}

/**
 * Builds a funding transaction for Solana
 */
export async function buildFundingTransaction(
  connection: Connection,
  program: Program<PortalIdl>,
  context: PublishContext
): Promise<Transaction> {
  if (context.reward.tokens.length === 0) {
    throw new SvmError(SvmErrorType.INVALID_CONFIG, SVM_ERROR_MESSAGES.NO_REWARD_TOKENS);
  }

  // Calculate vault PDA
  const vaultPda = calculateVaultPDA(context.intentHash, context.portalProgramId);
  logger.info(SVM_LOG_MESSAGES.VAULT_PDA(vaultPda.toString()));

  // Get token mint and accounts
  const tokenMint = new PublicKey(
    AddressNormalizer.denormalizeToSvm(context.reward.tokens[0].token)
  );
  const funderTokenAccount = await getAssociatedTokenAddress(tokenMint, context.keypair.publicKey);

  // Ensure funder token account exists
  await createTokenAccountIfNeeded(
    connection,
    tokenMint,
    context.keypair.publicKey,
    context.keypair
  );

  // Get or create a vault token account
  const vaultTokenAccount = await getOrCreateVaultTokenAccount(
    connection,
    tokenMint,
    vaultPda,
    context.keypair
  );

  // Build portal reward
  // const portalReward = buildPortalReward(context.reward);

  // Prepare token transfer accounts
  const tokenTransferAccounts = prepareTokenTransferAccounts(
    funderTokenAccount,
    vaultTokenAccount,
    tokenMint
  );

  logger.info(SVM_LOG_MESSAGES.BUILD_FUNDING_TX);

  // Build the funding transaction
  const transaction = await program.methods
    .fund({
      destination: new BN(context.destination),
      routeHash: { 0: hexToArray(context.routeHash) },
      reward: {
        deadline: new BN(context.reward.deadline),
        creator: new PublicKey(AddressNormalizer.denormalizeToSvm(context.reward.creator)),
        prover: new PublicKey(AddressNormalizer.denormalizeToSvm(context.reward.prover)),
        nativeAmount: new BN(context.reward.nativeAmount),
        tokens: context.reward.tokens.map(token => ({
          token: new PublicKey(AddressNormalizer.denormalizeToSvm(token.token)),
          amount: new BN(token.amount),
        })),
      },
      allowPartial: false,
    })
    .accounts({
      vault: vaultPda,
      payer: context.keypair.publicKey,
      funder: context.keypair.publicKey,
    })
    .remainingAccounts(tokenTransferAccounts)
    .transaction();

  // Fix route hash encoding in instruction data
  // const instructionData = Buffer.from(transaction.instructions[0].data);
  // copyBufferAt(hexToBuffer(context.routeHash), instructionData, 16);
  // transaction.instructions[0].data = instructionData;

  return transaction;
}

/**
 * Sends and confirms a transaction on Solana
 */
export async function sendAndConfirmTransaction(
  connection: Connection,
  transaction: Transaction,
  signers: Keypair[],
  description: string,
  program?: Program
): Promise<TransactionResultWithDecoding> {
  logger.spinner(description);

  try {
    const signature = await connection.sendTransaction(transaction, signers, {
      skipPreflight: SVM_CONFIRMATION_CONFIG.SKIP_PREFLIGHT,
      preflightCommitment: SVM_CONFIRMATION_CONFIG.PREFLIGHT_COMMITMENT,
      maxRetries: SVM_CONFIRMATION_CONFIG.MAX_SEND_RETRIES,
    });

    logger.info(SVM_LOG_MESSAGES.TX_SIGNATURE(signature));

    // Wait for confirmation
    await waitForTransactionConfirmation(connection, signature);

    // Decode transaction data if program is provided
    const result: TransactionResultWithDecoding = { signature };

    if (program) {
      try {
        // Log detailed transaction information
        await logTransactionDetails(connection, signature, program);

        // Extract IntentPublished event if present
        const intentPublished = await extractIntentPublishedEvent(connection, signature, program);
        if (intentPublished) {
          result.intentPublished = intentPublished;
          logger.info(`Decoded IntentPublished event: ${JSON.stringify(intentPublished, null, 2)}`);
        }
      } catch (decodeError: any) {
        // Decoding is non-critical, log but don't fail
        logger.warn(`Failed to decode transaction events: ${decodeError.message}`);
      }
    }

    return result;
  } catch (error: any) {
    logger.stopSpinner();
    throw new SvmError(
      SvmErrorType.TRANSACTION_FAILED,
      `Transaction failed: ${error.message}`,
      error
    );
  }
}

/**
 * Waits for transaction confirmation with improved error handling
 */
export async function waitForTransactionConfirmation(
  connection: Connection,
  signature: string,
  commitment = SVM_CONFIRMATION_CONFIG.DEFAULT_COMMITMENT
): Promise<void> {
  const maxRetries = SVM_CONFIRMATION_CONFIG.MAX_CONFIRMATION_RETRIES;
  let retries = 0;

  while (retries < maxRetries) {
    try {
      const result = await connection.getSignatureStatus(signature, {
        searchTransactionHistory: true,
      });

      if (
        result?.value?.confirmationStatus === commitment ||
        result?.value?.confirmationStatus === 'finalized'
      ) {
        if (result.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
        }
        logger.info(SVM_LOG_MESSAGES.TX_CONFIRMED(result.value.confirmationStatus));
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

    await new Promise(resolve =>
      setTimeout(resolve, SVM_CONFIRMATION_CONFIG.CONFIRMATION_POLLING_INTERVAL_MS)
    );
    retries++;
  }

  throw new SvmError(
    SvmErrorType.CONFIRMATION_TIMEOUT,
    SVM_ERROR_MESSAGES.CONFIRMATION_TIMEOUT(maxRetries),
    { signature }
  );
}

/**
 * Executes a funding operation for an intent
 */
export async function executeFunding(
  connection: Connection,
  context: PublishContext
): Promise<PublishResult> {
  try {
    const { program } = setupAnchorProgram(connection, context);

    const fundingTransaction = await buildFundingTransaction(connection, program, context);

    const result = await sendAndConfirmTransaction(
      connection,
      fundingTransaction,
      [context.keypair],
      SVM_LOG_MESSAGES.FUNDING_INTENT,
      program
    );

    logger.succeed(SVM_LOG_MESSAGES.FUNDING_CONFIRMED);

    return {
      success: true,
      transactionHash: result.signature,
      intentHash: context.intentHash,
    };
  } catch (error: any) {
    logger.stopSpinner();

    if (error instanceof SvmError) {
      throw error;
    }

    throw new SvmError(SvmErrorType.TRANSACTION_FAILED, SVM_ERROR_MESSAGES.FUNDING_FAILED, error);
  }
}

/**
 * Executes a publish operation for an intent
 */
export async function executePublish(
  connection: Connection,
  context: PublishContext
): Promise<PublishResult> {
  try {
    const { program } = setupAnchorProgram(connection, context);

    const publishTransaction = await buildPublishTransaction(program, context);

    const result = await sendAndConfirmTransaction(
      connection,
      publishTransaction,
      [context.keypair],
      SVM_LOG_MESSAGES.PUBLISHING_INTENT,
      program
    );

    logger.succeed(SVM_LOG_MESSAGES.PUBLISH_SUCCESS);

    // Log decoded event data if available
    if (result.intentPublished) {
      logger.info('Intent Published Successfully with data:');
      logger.info(`  Intent Hash: ${result.intentPublished.intentHash}`);
      logger.info(`  Destination: ${result.intentPublished.destination}`);
      logger.info(`  Creator: ${result.intentPublished.reward.creator}`);
      logger.info(`  Deadline: ${result.intentPublished.reward.deadline}`);
    }

    return {
      success: true,
      transactionHash: result.signature,
      intentHash: context.intentHash,
      decodedData: result.intentPublished,
    };
  } catch (error: any) {
    logger.stopSpinner();

    if (error instanceof SvmError) {
      throw error;
    }

    throw new SvmError(SvmErrorType.TRANSACTION_FAILED, SVM_ERROR_MESSAGES.PUBLISH_FAILED, error);
  }
}
