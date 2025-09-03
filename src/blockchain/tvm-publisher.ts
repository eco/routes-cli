/**
 * TVM (Tron) Chain Publisher
 */

import { TronWeb } from 'tronweb';
import { BasePublisher, PublishResult } from './base-publisher';
import { Intent, ChainType } from '../core/interfaces/intent';
import { AddressNormalizer } from '../core/utils/address-normalizer';
import { PortalEncoder } from '../core/utils/portal-encoder';
import { getChainById } from '../config/chains';

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
      const destChainType = chainConfig.type;
      const routeEncoded = PortalEncoder.encodeRoute(intent.route, destChainType);
      
      // Get Portal contract
      const contract = await this.tronWeb.contract().at(portalAddress);
      
      // Prepare parameters
      const destination = Number(intent.destination);
      const route = '0x' + routeEncoded.toString('hex');
      const reward = {
        deadline: Number(intent.reward.deadline),
        creator: AddressNormalizer.denormalize(intent.reward.creator, ChainType.TVM),
        prover: AddressNormalizer.denormalize(intent.reward.prover, ChainType.TVM),
        nativeAmount: intent.reward.nativeAmount.toString(),
        tokens: intent.reward.tokens.map(t => ({
          token: AddressNormalizer.denormalize(t.token, ChainType.TVM),
          amount: t.amount.toString(),
        })),
      };
      
      // Call publish function
      const tx = await contract.publish(destination, route, reward).send({
        from: senderAddress,
        callValue: Number(intent.reward.nativeAmount), // TRX amount in sun
      });
      
      if (tx) {
        return {
          success: true,
          transactionHash: tx,
          intentHash: intent.intentHash,
        };
      } else {
        return {
          success: false,
          error: 'Transaction failed',
        };
      }
    } catch (error: any) {
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
  
  async validate(intent: Intent, senderAddress: string): Promise<{ valid: boolean; error?: string }> {
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
}