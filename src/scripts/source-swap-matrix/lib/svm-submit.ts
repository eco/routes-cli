import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import type { Hex } from 'viem';

import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { executeFunding } from '@/blockchain/svm/transaction-builder';
import type { PublishContext } from '@/blockchain/svm/svm-types';
import { PortalHashUtils } from '@/commons/utils/portal-hash.utils';
import { ChainType, type Intent } from '@/shared/types';

import type { QuoteEnvelope } from './quote';

export interface SvmSubmitInput {
  connection: Connection;
  keypair: Keypair;
  quote: QuoteEnvelope;
  sourceChain: bigint;
  destChain: bigint;
  sourceToken: string;
  sourceAmount: bigint;
  proverPubkey?: string;
}

// SVM-source intents on Solana are fund-only — the `fund` ix references the
// route_hash (32 bytes) and never embeds the full route, so the route's size
// is irrelevant to Solana's tx limit. routes-cli's SvmPublisher.publish() uses
// this exact pattern (commit a872eff). publishSig and fundSig are the same
// signature here for shape compatibility with the EVM submit result.
export interface SvmSubmitResult {
  publishSig: string;
  fundSig: string;
  intentHash: Hex;
  portalProgramId: PublicKey;
}

export async function submitSvm(input: SvmSubmitInput): Promise<SvmSubmitResult> {
  // destChain on input is ignored — we use magenta's response destinationChainID below.
  const { connection, keypair, quote, sourceChain, sourceToken, sourceAmount } = input;
  const quoteResponse = quote.quoteResponses[0];

  const portalProgramId = new PublicKey(quote.contracts.sourcePortal as string);
  const proverUniversal = AddressNormalizer.normalize(
    quote.contracts.prover as string,
    ChainType.SVM
  );
  const creatorUniversal = AddressNormalizer.normalize(keypair.publicKey.toBase58(), ChainType.SVM);

  // Native SOL = System Program ID (32 zero bytes); see scenarios.ts and
  // routes-cli commit a872eff. Native rewards go in `nativeAmount` (lamports
  // moved by Portal's `fund` ix via system_program); SPL rewards go in
  // `tokens` with an associated-token-account transfer.
  const isNativeSol = sourceToken === '11111111111111111111111111111111';
  const reward: Intent['reward'] = {
    deadline: BigInt(quoteResponse.deadline),
    creator: creatorUniversal,
    prover: proverUniversal,
    nativeAmount: isNativeSol ? sourceAmount : 0n,
    tokens: isNativeSol
      ? []
      : [{ token: AddressNormalizer.normalize(sourceToken, ChainType.SVM), amount: sourceAmount }],
  };

  // Use magenta's response destinationChainID (LOCAL parent vs direct
  // cross-chain — see evm-submit.ts comment). For SS-7/SS-8 magenta returns
  // destinationChainID == sourceChain (any-to-any LOCAL parent on Solana),
  // but we still source it from the response to stay correct if magenta
  // ever flips a SVM-source to a direct cross-chain shape.
  const responseDestChain = quoteResponse.destinationChainID;
  if (responseDestChain === undefined) {
    throw new Error(`quote-shape-invalid: response missing quoteResponses[0].destinationChainID`);
  }
  const effectiveDestChain = BigInt(responseDestChain);

  const { intentHash, routeHash } = PortalHashUtils.getIntentHashFromReward(
    sourceChain,
    effectiveDestChain,
    quoteResponse.encodedRoute as Hex,
    reward
  );

  const context: PublishContext = {
    source: sourceChain,
    destination: effectiveDestChain,
    reward,
    encodedRoute: quoteResponse.encodedRoute,
    intentHash,
    routeHash,
    keypair,
    portalProgramId,
  };

  // Skip the publish ix entirely — see comment on SvmSubmitResult.
  const fundResult = await executeFunding(connection, context);
  if (!fundResult.success) {
    throw new Error(`svm-fund-failed: ${fundResult.error}`);
  }

  return {
    publishSig: fundResult.transactionHash!,
    fundSig: fundResult.transactionHash!,
    intentHash: intentHash as Hex,
    portalProgramId,
  };
}
