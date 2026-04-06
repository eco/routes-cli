/**
 * SVM PDA Manager
 * Consolidates all Program Derived Address (PDA) derivations for Solana operations.
 * All PDA seeds and derivation logic lives here.
 */

import { PublicKey } from '@solana/web3.js';

import { createPdaSeedBuffer, hexToBuffer } from './svm-buffer-utils';
import { SVM_PDA_SEEDS } from './svm-constants';

/**
 * Calculates the vault PDA for an intent.
 * Vault PDA: ["vault", intent_hash] — stores reward tokens.
 */
export function calculateVaultPDA(intentHash: string, portalProgramId: PublicKey): PublicKey {
  const intentHashBytes = hexToBuffer(intentHash);
  const [vaultPda] = PublicKey.findProgramAddressSync(
    [createPdaSeedBuffer(SVM_PDA_SEEDS.VAULT), intentHashBytes],
    portalProgramId
  );

  return vaultPda;
}
