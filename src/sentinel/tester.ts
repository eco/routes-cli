/**
 * Sentinel Route Tester
 *
 * Executes a single route test (publish intent, watch for fulfillment)
 */

import { parseUnits } from 'viem';

import { BasePublisher } from '@/blockchain/base-publisher';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { createScanner, isScanningSupported, ScanEventType } from '@/blockchain/scanner';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { getChainByName } from '@/config/chains';
import { getTokenAddress, getTokenBySymbol } from '@/config/tokens';
import { ChainType } from '@/core/interfaces/intent';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { getQuote } from '@/core/utils/quote';

import { SentinelConfig, TestResult } from './types';
import { WalletManager } from './wallet';

export class RouteTester {
  private config: SentinelConfig;
  private walletManager: WalletManager;

  constructor(config: SentinelConfig, walletManager: WalletManager) {
    this.config = config;
    this.walletManager = walletManager;
  }

  async test(
    source: string,
    destination: string,
    token: string,
    amount: string
  ): Promise<TestResult> {
    const startTime = Date.now();
    const timestamp = new Date();

    try {
      const sourceChain = getChainByName(source);
      const destChain = getChainByName(destination);

      if (!sourceChain) throw new Error(`Unknown source chain: ${source}`);
      if (!destChain) throw new Error(`Unknown destination chain: ${destination}`);

      const tokenConfig = getTokenBySymbol(token);
      if (!tokenConfig) throw new Error(`Unknown token: ${token}`);

      const rewardTokenAddr = getTokenAddress(token, sourceChain.id);
      const routeTokenAddr = getTokenAddress(token, destChain.id);

      if (!rewardTokenAddr) throw new Error(`Token ${token} not available on ${source}`);
      if (!routeTokenAddr) throw new Error(`Token ${token} not available on ${destination}`);

      // Get wallet address for source chain
      const walletAddr = this.walletManager.getAddress(sourceChain.type);
      const normalizedWallet = AddressNormalizer.normalize(walletAddr, sourceChain.type);
      const denormalizedWallet = AddressNormalizer.denormalize(normalizedWallet, sourceChain.type);

      // Parse amount
      const amountUnits = parseUnits(amount, tokenConfig.decimals);

      // Get quote
      const quote = await getQuote({
        source: sourceChain.id,
        destination: destChain.id,
        funder: denormalizedWallet,
        recipient: AddressNormalizer.denormalize(normalizedWallet, destChain.type),
        amount: amountUnits,
        routeToken: AddressNormalizer.denormalize(routeTokenAddr, destChain.type),
        rewardToken: AddressNormalizer.denormalize(rewardTokenAddr, sourceChain.type),
      });

      if (!quote?.quoteResponse?.encodedRoute || !quote?.contracts?.sourcePortal) {
        throw new Error('Invalid quote response');
      }

      // Build reward
      const reward = {
        deadline: BigInt(quote.quoteResponse.deadline),
        prover: AddressNormalizer.normalize(quote.contracts.prover, sourceChain.type),
        creator: normalizedWallet,
        nativeAmount: 0n,
        tokens: [
          {
            token: rewardTokenAddr,
            amount: amountUnits,
          },
        ],
      };

      // Create publisher
      let publisher: BasePublisher;
      switch (sourceChain.type) {
        case ChainType.EVM:
          publisher = new EvmPublisher(sourceChain.rpcUrl);
          break;
        case ChainType.SVM:
          publisher = new SvmPublisher(sourceChain.rpcUrl);
          break;
        default:
          throw new Error(`Unsupported chain type: ${sourceChain.type}`);
      }

      // Dry run check
      if (this.config.execution.dryRun) {
        return {
          source,
          destination,
          token,
          success: true,
          publishTimeMs: Date.now() - startTime,
          timestamp,
        };
      }

      // Publish
      const sourcePortal = AddressNormalizer.normalize(
        quote.contracts.sourcePortal,
        sourceChain.type
      );
      const publishResult = await publisher.publish(
        sourceChain.id,
        destChain.id,
        reward,
        quote.quoteResponse.encodedRoute as `0x${string}`,
        this.walletManager.getPrivateKey(sourceChain.type),
        sourcePortal
      );

      const publishTimeMs = Date.now() - startTime;

      if (!publishResult.success) {
        return {
          source,
          destination,
          token,
          success: false,
          error: publishResult.error ?? 'Publish failed',
          publishTimeMs,
          timestamp,
        };
      }

      // Watch for fulfillment
      let fulfillTimeMs: number | undefined;

      if (publishResult.intentHash && quote.contracts.destinationPortal) {
        if (isScanningSupported(destChain.type)) {
          const scanner = createScanner({
            intentHash: publishResult.intentHash,
            portalAddress: quote.contracts.destinationPortal,
            rpcUrl: destChain.rpcUrl,
            chainId: destChain.id,
            chainType: destChain.type,
            chainName: destChain.name,
            timeoutMs: this.config.execution.timeoutMs,
          });

          const scanResult = await scanner.scan(ScanEventType.FULFILLMENT);

          if (scanResult.found) {
            fulfillTimeMs = scanResult.elapsedMs;
          } else if (scanResult.timedOut) {
            return {
              source,
              destination,
              token,
              success: false,
              intentHash: publishResult.intentHash,
              txHash: publishResult.transactionHash,
              error: 'Fulfillment timeout',
              publishTimeMs,
              timestamp,
            };
          }
        }
      }

      return {
        source,
        destination,
        token,
        success: true,
        intentHash: publishResult.intentHash,
        txHash: publishResult.transactionHash,
        publishTimeMs,
        fulfillTimeMs,
        timestamp,
      };
    } catch (error) {
      return {
        source,
        destination,
        token,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        publishTimeMs: Date.now() - startTime,
        timestamp,
      };
    }
  }
}
