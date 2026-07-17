import { Injectable } from '@nestjs/common';

import { Connection, PublicKey } from '@solana/web3.js';
import { Chain, createPublicClient, decodeEventLog, erc20Abi, getAddress, Hex, http } from 'viem';
import * as viemChains from 'viem/chains';

import { RpcService } from '@/blockchain/rpc.service';
import { ChainConfig, ChainType } from '@/shared/types';

import { computeOwnerDeltas, isNativeReward, SvmTokenBalanceEntry } from './matrix.util';

export interface DeliveryFacts {
  deliveredAmount: bigint;
  recipient: string;
}

@Injectable()
export class DeliveryVerifierService {
  constructor(private readonly rpc: RpcService) {}

  async verify(
    chain: ChainConfig,
    fulfillmentTxHash: string,
    outputToken: string,
    recipient: string
  ): Promise<DeliveryFacts | { error: string }> {
    try {
      if (chain.type === ChainType.SVM) {
        return await this.verifySvm(chain, fulfillmentTxHash, outputToken, recipient);
      }
      if (chain.type === ChainType.EVM) {
        return await this.verifyEvm(chain, fulfillmentTxHash, outputToken, recipient);
      }
      return { error: `delivery verification not supported for ${chain.type}` };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private async verifySvm(
    chain: ChainConfig,
    txHash: string,
    outputToken: string,
    recipient: string
  ): Promise<DeliveryFacts | { error: string }> {
    const connection = new Connection(this.rpc.getUrl(chain), 'confirmed');
    const tx = await connection.getTransaction(txHash, { maxSupportedTransactionVersion: 0 });
    if (!tx?.meta) return { error: 'SVM fulfillment tx meta unavailable' };

    if (isNativeReward(chain.type, outputToken)) {
      const accountKeys = tx.transaction.message.getAccountKeys({
        accountKeysFromLookups: tx.meta.loadedAddresses,
      });
      let recipientIndex = -1;
      for (let index = 0; index < accountKeys.length; index++) {
        if (accountKeys.get(index)?.equals(new PublicKey(recipient))) {
          recipientIndex = index;
          break;
        }
      }
      if (recipientIndex < 0) {
        return { error: `recipient ${recipient} not in fulfillment tx` };
      }
      const before = tx.meta.preBalances[recipientIndex];
      const after = tx.meta.postBalances[recipientIndex];
      if (before === undefined || after === undefined || after <= before) {
        return { error: `recipient ${recipient} native balance did not increase` };
      }
      return { deliveredAmount: BigInt(after - before), recipient };
    }

    const pre = (tx.meta.preTokenBalances ?? []) as unknown as SvmTokenBalanceEntry[];
    const post = (tx.meta.postTokenBalances ?? []) as unknown as SvmTokenBalanceEntry[];
    const delta = computeOwnerDeltas(outputToken, pre, post).find(
      entry => entry.owner === recipient && entry.delta > 0n
    );
    if (!delta) return { error: `recipient ${recipient} did not receive mint ${outputToken}` };
    return { deliveredAmount: delta.delta, recipient };
  }

  private async verifyEvm(
    chain: ChainConfig,
    txHash: string,
    outputToken: string,
    recipient: string
  ): Promise<DeliveryFacts | { error: string }> {
    const viemChain = Object.values(viemChains).find(
      (candidate: Chain) => candidate.id === Number(chain.id)
    ) as Chain | undefined;
    if (!viemChain) return { error: `chain ${chain.id} not in viem/chains` };
    const client = createPublicClient({
      chain: viemChain,
      transport: http(this.rpc.getUrl(chain)),
    });
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    const recipientAddress = getAddress(recipient as Hex);

    if (isNativeReward(chain.type, outputToken)) {
      if (receipt.blockNumber === 0n) return { error: 'cannot verify delivery at genesis block' };
      const before = await client.getBalance({
        address: recipientAddress,
        blockNumber: receipt.blockNumber - 1n,
      });
      const after = await client.getBalance({
        address: recipientAddress,
        blockNumber: receipt.blockNumber,
      });
      const deliveredAmount = after > before ? after - before : null;
      if (deliveredAmount === null) {
        return { error: `recipient ${recipientAddress} native balance did not increase` };
      }
      return { deliveredAmount, recipient: recipientAddress };
    }

    const token = getAddress(outputToken as Hex);
    let deliveredAmount = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== token.toLowerCase()) continue;
      try {
        const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics });
        if (decoded.eventName !== 'Transfer') continue;
        const args = decoded.args as { to: string; value: bigint };
        if (args.to.toLowerCase() === recipientAddress.toLowerCase()) {
          deliveredAmount += args.value;
        }
      } catch {
        continue;
      }
    }
    if (deliveredAmount === 0n) {
      return { error: `recipient ${recipientAddress} did not receive token ${token}` };
    }
    return { deliveredAmount, recipient: recipientAddress };
  }
}
