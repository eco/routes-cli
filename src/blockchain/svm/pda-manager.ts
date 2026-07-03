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

/**
 * Fulfill-marker PDA: ["fulfill_marker", intent_hash]. Created by the Portal
 * `fulfill` instruction and persists — its existence means the intent was
 * fulfilled on this (destination) chain.
 */
export function calculateFulfillMarkerPDA(
  intentHash: string,
  portalProgramId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [createPdaSeedBuffer(SVM_PDA_SEEDS.FULFILL_MARKER), hexToBuffer(intentHash)],
    portalProgramId
  );

  return pda;
}

/**
 * Claimed-marker PDA: ["claimed_marker", intent_hash]. Created by the Portal
 * `withdraw` instruction — its existence means the reward was claimed (withdrawn).
 */
export function calculateClaimedMarkerPDA(
  intentHash: string,
  portalProgramId: PublicKey
): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [createPdaSeedBuffer(SVM_PDA_SEEDS.CLAIMED_MARKER), hexToBuffer(intentHash)],
    portalProgramId
  );

  return pda;
}
