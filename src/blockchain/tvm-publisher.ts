/**
 * TVM (Tron) Chain Publisher
 */

import { TronWeb } from 'tronweb';
import { erc20Abi } from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';
import { getChainById } from '@/config/chains';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { PortalEncoder } from '@/core/utils/portal-encoder';
import { logger } from '@/utils/logger';

import { BasePublisher, PublishResult } from './base-publisher';

export class TvmPublisher extends BasePublisher {
  private tronWeb: TronWeb;

  constructor(rpcUrl: string) {
    super(rpcUrl);
    this.tronWeb = new TronWeb({
      fullHost: rpcUrl,
    });
  }

  async publish(intent: Intent, privateKey: string): Promise<PublishResult> {
    try {
      // Set private key
      this.tronWeb.setPrivateKey(privateKey);
      const senderAddress = this.tronWeb.address.fromPrivateKey(privateKey);

      // Get Portal address
      const chainConfig = getChainById(intent.sourceChainId);
      if (!chainConfig?.portalAddress) {
        throw new Error(`No Portal address configured for chain ${intent.sourceChainId}`);
      }

      const portalAddress = AddressNormalizer.denormalize(chainConfig.portalAddress, ChainType.TVM);

      // Encode route for destination chain type
      const destChainConfig = getChainById(BigInt(intent.destination));
      if (!destChainConfig) {
        throw new Error(`Unknown destination chain: ${intent.destination}`);
      }
      const destChainType = destChainConfig.type;
      const routeHash = PortalEncoder.encode(intent.route, destChainType);

      // Get Portal contract with ABI
      const sourceToken = intent.reward.tokens[0];
      const tokenContract = this.tronWeb.contract(
        erc20Abi,
        AddressNormalizer.denormalizeToTvm(sourceToken.token)
      );

      logger.spinner('Approving tokens...');

      const approvalTxId = await tokenContract
        .approve(portalAddress, sourceToken.amount)
        .send({ from: senderAddress });

      logger.updateSpinner('Waiting for approval confirmation...');

      const approvalSuccessful = await this.waitForTransaction(approvalTxId);

      if (!approvalSuccessful) {
        logger.fail('Token approval failed');
        throw new Error('Approval failed');
      }

      logger.succeed('Tokens approved');

      const portalContract = this.tronWeb.contract(portalAbi, portalAddress);

      // Prepare parameters - TronWeb expects strings for numbers
      const destination = intent.destination;
      const reward: Parameters<typeof portalContract.publishAndFund>[0][2] = [
        intent.reward.deadline,
        AddressNormalizer.denormalize(intent.reward.creator, ChainType.TVM),
        AddressNormalizer.denormalize(intent.reward.prover, ChainType.TVM),
        intent.reward.nativeAmount,
        intent.reward.tokens.map(
          t => [AddressNormalizer.denormalize(t.token, ChainType.TVM), t.amount] as const
        ),
      ];

      // Call publish function
      // Pass parameters as separate arguments
      const publishSpinner = logger.spinner('Publishing intent to Portal contract...');
      const tx = await portalContract.publishAndFund(destination, routeHash, reward, false).send({
        from: senderAddress,
        callValue: Number(intent.reward.nativeAmount), // TRX amount in sun
      });

      logger.updateSpinner('Waiting for transaction confirmation...');

      if (tx) {
        logger.succeed('Transaction confirmed');
        return {
          success: true,
          transactionHash: tx,
          intentHash: intent.intentHash,
        };
      } else {
        logger.fail('Transaction failed');
        return {
          success: false,
          error: 'Transaction failed',
        };
      }
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
      const balance = await this.tronWeb.trx.getBalance(address);
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
          error: `Insufficient TRX balance. Required: ${intent.reward.nativeAmount}, Available: ${balance}`,
        };
      }

      // Check if addresses are valid Tron addresses
      const creatorAddress = AddressNormalizer.denormalize(intent.reward.creator, ChainType.TVM);
      if (!TronWeb.isAddress(creatorAddress)) {
        return {
          valid: false,
          error: `Invalid Tron creator address: ${creatorAddress}`,
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

  /**
   * Waits for a transaction to be confirmed on the blockchain
   * @param txId - Transaction ID to wait for
   * @returns true if confirmed, false if timeout
   */
  async waitForTransaction(txId: string): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      const txInfo = await this.tronWeb.trx.getTransactionInfo(txId);
      if (txInfo && txInfo.blockNumber && txInfo.receipt?.result === 'SUCCESS') {
        return true;
      }

      if (txInfo?.receipt?.result === 'FAILED') {
        throw new Error(
          `Transaction failed: ${txInfo.receipt.result || 'Unknown error'}. txId: ${txId}. Received: ${JSON.stringify(txInfo.receipt)}`
        );
      }

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, 4_000)); // Wait 4s
    }
    return false;
  }
}
