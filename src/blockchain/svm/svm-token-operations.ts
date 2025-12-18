/**
 * SVM (Solana) Token Operations
 * Handles all token-related operations for Solana blockchain
 */

import { PublicKey } from '@solana/web3.js';

import { TokenTransferAccount } from './svm-types';

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
