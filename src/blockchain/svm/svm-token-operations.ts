/**
 * SVM (Solana) Token Operations
 * Handles all token-related operations for Solana blockchain
 */

import {
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';

import { logger } from '@/utils/logger';

import { SVM_CONFIRMATION_CONFIG, SVM_ERROR_MESSAGES, SVM_LOG_MESSAGES } from './svm-constants';
import { SvmError, SvmErrorType, TokenAccountResult, TokenTransferAccount } from './svm-types';

/**
 * Creates a token account if it doesn't exist
 */
export async function createTokenAccountIfNeeded(
  connection: Connection,
  tokenMint: PublicKey,
  owner: PublicKey,
  payer: Keypair
): Promise<TokenAccountResult> {
  try {
    const tokenAccount = await getAssociatedTokenAddress(tokenMint, owner, true);

    // Check if account already exists
    const accountInfo = await connection.getAccountInfo(tokenAccount);
    if (accountInfo) {
      return {
        success: true,
        accountAddress: tokenAccount,
      };
    }

    logger.info(SVM_LOG_MESSAGES.CREATE_TOKEN_ACCOUNT);

    // Create the token account
    const createAccountIx = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      tokenAccount,
      owner,
      tokenMint
    );

    const transaction = new Transaction().add(createAccountIx);

    const signature = await connection.sendTransaction(transaction, [payer], {
      skipPreflight: SVM_CONFIRMATION_CONFIG.SKIP_PREFLIGHT,
      preflightCommitment: SVM_CONFIRMATION_CONFIG.PREFLIGHT_COMMITMENT,
      maxRetries: SVM_CONFIRMATION_CONFIG.MAX_SEND_RETRIES,
    });

    logger.info(SVM_LOG_MESSAGES.TOKEN_ACCOUNT_CREATED(signature));

    // Wait for confirmation
    await waitForConfirmation(connection, signature);

    return {
      success: true,
      accountAddress: tokenAccount,
      signature,
    };
  } catch (error: any) {
    throw new SvmError(
      SvmErrorType.TOKEN_ACCOUNT_ERROR,
      SVM_ERROR_MESSAGES.TOKEN_ACCOUNT_CREATION_FAILED,
      error
    );
  }
}

/**
 * Gets or creates associated token account for a vault PDA
 */
export async function getOrCreateVaultTokenAccount(
  connection: Connection,
  tokenMint: PublicKey,
  vaultPda: PublicKey,
  funderKeypair: Keypair
): Promise<PublicKey> {
  try {
    const vaultTokenAccount = await getAssociatedTokenAddress(
      tokenMint,
      vaultPda,
      true // allowOwnerOffCurve for PDA
    );

    // Check if vault token account exists, create if needed
    const vaultAccountInfo = await connection.getAccountInfo(vaultTokenAccount);
    if (!vaultAccountInfo) {
      const result = await createTokenAccountIfNeeded(
        connection,
        tokenMint,
        vaultPda,
        funderKeypair
      );

      if (!result.success || !result.accountAddress) {
        throw new Error(result.error || 'Failed to create vault token account');
      }

      return result.accountAddress;
    }

    return vaultTokenAccount;
  } catch (error: any) {
    throw new SvmError(
      SvmErrorType.TOKEN_ACCOUNT_ERROR,
      'Failed to get or create vault token account',
      error
    );
  }
}

/**
 * Prepares token transfer accounts for a transaction
 */
export function prepareTokenTransferAccounts(
  funderTokenAccount: PublicKey,
  vaultTokenAccount: PublicKey,
  tokenMint: PublicKey
): TokenTransferAccount[] {
  return [
    {
      pubkey: funderTokenAccount,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: vaultTokenAccount,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: tokenMint,
      isWritable: false,
      isSigner: false,
    },
  ];
}

/**
 * Gets the appropriate token program ID for a mint
 */
export async function getTokenProgramId(
  connection: Connection,
  tokenMint: PublicKey
): Promise<PublicKey> {
  try {
    const accountInfo = await connection.getAccountInfo(tokenMint);

    if (!accountInfo) {
      throw new Error('Token mint account not found');
    }

    // Check if it's a Token-2022 mint by looking at the owner
    // Token-2022 has a different program ID
    // For now, default to TOKEN_PROGRAM_ID
    // This can be extended to support Token-2022 in the future

    return TOKEN_PROGRAM_ID;
  } catch (error: any) {
    throw new SvmError(
      SvmErrorType.TOKEN_ACCOUNT_ERROR,
      'Failed to determine token program ID',
      error
    );
  }
}

/**
 * Waits for transaction confirmation with polling
 */
async function waitForConfirmation(
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
