import { Intent } from '@/core/interfaces/intent';
import { Hex } from 'viem';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { UniversalAddress } from '@/core/types/universal-address';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { web3 } from '@coral-xyz/anchor';
import { portalBorshCoder } from '@/commons/utils/portal-borsh-coder';
import { CalldataWithAccountsInstruction } from '@/commons/types/portal-idl-coder.type';
import { ChainConfig } from '@/config/chains';

export async function svmCallsBuilder(
  destination: ChainConfig,
  route: Intent['route'],
  recipient: UniversalAddress
): Promise<Intent['route']['calls']> {
  const { token, amount } = route.tokens[0];

  const portalProgramAddr = destination.portalAddress;
  if (!portalProgramAddr) {
    throw new Error('Portal address is not defined');
  }

  const portalProgramAddrSvmAddr = AddressNormalizer.denormalizeToSvm(portalProgramAddr);
  const tokenSvmAddr = AddressNormalizer.denormalizeToSvm(token);
  const recipientSvmAddr = AddressNormalizer.denormalizeToSvm(recipient);

  const portalProgramKey = new web3.PublicKey(portalProgramAddrSvmAddr);
  const tokenMint = new web3.PublicKey(tokenSvmAddr);
  const recipientKey = new web3.PublicKey(recipientSvmAddr);

  const svmCall = await getTransferCall(portalProgramKey, tokenMint, recipientKey, amount);

  return [
    {
      target: AddressNormalizer.normalizeSvm(svmCall.target),
      data: svmCall.data,
      value: svmCall.value,
    },
  ];
}

async function getTransferCall(
  portalProgramId: web3.PublicKey,
  tokenMint: web3.PublicKey,
  recipient: web3.PublicKey,
  amount: bigint
) {
  // Get executor PDA for call accounts
  const EXECUTOR_SEED = Buffer.from('executor');
  const [executorPda] = web3.PublicKey.findProgramAddressSync([EXECUTOR_SEED], portalProgramId);

  const source = await getAssociatedTokenAddress(tokenMint, executorPda, true);
  const destination = await getAssociatedTokenAddress(tokenMint, recipient);

  // Create the Calldata struct exactly as in the integration test
  const calldata = createTransferCheckedInstruction(
    source,
    tokenMint,
    destination,
    executorPda,
    amount,
    6
  );

  // Since Portal's executor executes transfers and it's a Program. It's not an ix signer.
  calldata.keys[3].isSigner = false;

  const serializedCalldata = portalBorshCoder.types.encode<CalldataWithAccountsInstruction>(
    'CalldataWithAccounts',
    {
      calldata: { data: calldata.data, account_count: calldata.keys.length },
      accounts: calldata.keys.map(account => ({
        pubkey: account.pubkey,
        is_writable: account.isWritable,
        is_signer: account.isSigner,
      })),
    }
  );

  return {
    target: TOKEN_PROGRAM_ID, // SPL Token program
    data: `0x${serializedCalldata.toString('hex')}` as Hex,
    value: 0n, // No SOL value for SPL token transfers
  };
}
