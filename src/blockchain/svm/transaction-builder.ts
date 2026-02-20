/**
 * SVM Transaction Builder
 * Builds and executes Solana transactions for the Portal program.
 * Depends on solana-client.ts (program setup) and pda-manager.ts (PDA derivations).
 */

import { BN, Program } from '@coral-xyz/anchor';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';

import { ChainType, Intent } from '@/core/interfaces/intent';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

import { PublishResult } from '../base-publisher';

import { calculateVaultPDA } from './pda-manager';
import { setupAnchorProgram } from './solana-client';
import { hexToArray, hexToBuffer } from './svm-buffer-utils';
import { SVM_CONFIRMATION_CONFIG, SVM_ERROR_MESSAGES, SVM_LOG_MESSAGES } from './svm-constants';
import { extractIntentPublishedEvent, logTransactionDetails } from './svm-decode';
import { prepareTokenTransferAccounts } from './svm-token-operations';
import { PublishContext, SvmError, SvmErrorType, TransactionResultWithDecoding } from './svm-types';

/**
 * Converts Intent reward to Solana-specific format.
 */
export function buildPortalReward(reward: Intent['reward']): {
  deadline: BN;
  creator: PublicKey;
  prover: PublicKey;
  nativeAmount: BN;
  tokens: { token: PublicKey; amount: BN }[];
} {
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
 * Builds a publish transaction for Solana.
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
 * Builds a funding transaction for Solana.
 */
export async function buildFundingTransaction(
  _connection: Connection,
  program: Program,
  context: PublishContext
): Promise<Transaction> {
  if (context.reward.tokens.length === 0) {
    throw new SvmError(SvmErrorType.INVALID_CONFIG, SVM_ERROR_MESSAGES.NO_REWARD_TOKENS);
  }

  const vaultPda = calculateVaultPDA(context.intentHash, context.portalProgramId);
  logger.info(SVM_LOG_MESSAGES.VAULT_PDA(vaultPda.toString()));

  const tokenMint = new PublicKey(
    AddressNormalizer.denormalizeToSvm(context.reward.tokens[0].token)
  );
  const funderTokenAccount = await getAssociatedTokenAddress(tokenMint, context.keypair.publicKey);
  const vaultTokenAccount = await getAssociatedTokenAddress(
    tokenMint,
    vaultPda,
    true // allowOwnerOffCurve for PDA
  );

  const tokenTransferAccounts = prepareTokenTransferAccounts(
    funderTokenAccount,
    vaultTokenAccount,
    tokenMint
  );

  logger.info(SVM_LOG_MESSAGES.BUILD_FUNDING_TX);

  const transaction = await program.methods
    .fund({
      destination: new BN(context.destination),
      routeHash: { 0: hexToArray(context.routeHash) },
      reward: {
        deadline: new BN(context.reward.deadline),
        creator: new PublicKey(AddressNormalizer.denormalizeToSvm(context.reward.creator)),
        prover: new PublicKey(
          AddressNormalizer.denormalizeToSvm(context.proverAddress ?? context.reward.prover)
        ),
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

  return transaction;
}

/**
 * Sends and confirms a transaction on Solana.
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

    await waitForTransactionConfirmation(connection, signature);

    const result: TransactionResultWithDecoding = { signature };

    if (program) {
      try {
        await logTransactionDetails(connection, signature, program);
        const intentPublished = await extractIntentPublishedEvent(connection, signature, program);
        if (intentPublished) {
          result.intentPublished = intentPublished;
          logger.info(`Decoded IntentPublished event: ${JSON.stringify(intentPublished, null, 2)}`);
        }
      } catch (decodeError: unknown) {
        const message = decodeError instanceof Error ? decodeError.message : String(decodeError);
        logger.warn(`Failed to decode transaction events: ${message}`);
      }
    }

    return result;
  } catch (error: unknown) {
    logger.stopSpinner();
    const message = error instanceof Error ? error.message : String(error);
    throw new SvmError(SvmErrorType.TRANSACTION_FAILED, `Transaction failed: ${message}`, error);
  }
}

/**
 * Waits for transaction confirmation with improved error handling.
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
 * Executes a funding operation for an intent.
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
  } catch (error: unknown) {
    logger.stopSpinner();

    if (error instanceof SvmError) {
      throw error;
    }

    throw new SvmError(SvmErrorType.TRANSACTION_FAILED, SVM_ERROR_MESSAGES.FUNDING_FAILED, error);
  }
}

/**
 * Executes a publish operation for an intent.
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
  } catch (error: unknown) {
    logger.stopSpinner();

    if (error instanceof SvmError) {
      throw error;
    }

    throw new SvmError(SvmErrorType.TRANSACTION_FAILED, SVM_ERROR_MESSAGES.PUBLISH_FAILED, error);
  }
}
