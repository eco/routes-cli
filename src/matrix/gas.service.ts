/**
 * Fetches the gas/economics of a settlement transaction, per VM family.
 *
 * Uses the same RPC access the publishers use (RpcService.getUrl(chain)),
 * building a short-lived viem PublicClient (EVM) or Solana Connection (SVM).
 * Never throws: on any failure it returns a GasCost with `unavailable` set so
 * a matrix row is never failed just because gas could not be read.
 */

import { Injectable } from '@nestjs/common';

import { Connection } from '@solana/web3.js';
import { Chain, createPublicClient, Hex, http } from 'viem';
import * as viemChains from 'viem/chains';

import { RpcService } from '@/blockchain/rpc.service';
import { ChainConfig, ChainType } from '@/shared/types';

import { GasCost } from './matrix.types';
import { evmGasCost, svmGasCost } from './matrix.util';

@Injectable()
export class GasService {
  constructor(private readonly rpc: RpcService) {}

  async getSettlementGas(chain: ChainConfig, txHash: string): Promise<GasCost> {
    try {
      if (chain.type === ChainType.EVM) return await this.evmGas(chain, txHash);
      if (chain.type === ChainType.SVM) return await this.svmGas(chain, txHash);
      return { unavailable: `gas not supported for ${chain.type}` };
    } catch (error) {
      return { unavailable: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * On-chain block timestamp (unix seconds) of a tx, or undefined if unavailable.
   * Used to measure settlement latency from block times (fund block -> fulfill
   * block) rather than wall-clock, which is submit-phase-biased in the harness.
   */
  async getTxTimestamp(chain: ChainConfig, txHash: string): Promise<number | undefined> {
    try {
      if (chain.type === ChainType.EVM) {
        const viemChain = Object.values(viemChains).find(
          (c: Chain) => c.id === Number(chain.id)
        ) as Chain | undefined;
        if (!viemChain) return undefined;
        const client = createPublicClient({
          chain: viemChain,
          transport: http(this.rpc.getUrl(chain)),
        });
        const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
        const block = await client.getBlock({ blockNumber: receipt.blockNumber });
        return Number(block.timestamp);
      }
      if (chain.type === ChainType.SVM) {
        const connection = new Connection(this.rpc.getUrl(chain), 'confirmed');
        const tx = await connection.getTransaction(txHash, { maxSupportedTransactionVersion: 0 });
        return tx?.blockTime ?? undefined;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  private async evmGas(chain: ChainConfig, txHash: string): Promise<GasCost> {
    const viemChain = Object.values(viemChains).find((c: Chain) => c.id === Number(chain.id)) as
      | Chain
      | undefined;
    if (!viemChain) return { unavailable: `chain ${chain.id} not in viem/chains` };

    const client = createPublicClient({
      chain: viemChain,
      transport: http(this.rpc.getUrl(chain)),
    });
    const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
    return evmGasCost(
      receipt.gasUsed,
      receipt.effectiveGasPrice,
      chain.nativeCurrency.symbol,
      chain.nativeCurrency.decimals
    );
  }

  private async svmGas(chain: ChainConfig, txHash: string): Promise<GasCost> {
    const connection = new Connection(this.rpc.getUrl(chain), 'confirmed');
    const tx = await connection.getTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
    });
    const fee = tx?.meta?.fee;
    if (fee === undefined || fee === null) {
      return { unavailable: 'transaction meta.fee unavailable' };
    }
    return svmGasCost(BigInt(fee), chain.nativeCurrency.symbol);
  }
}
