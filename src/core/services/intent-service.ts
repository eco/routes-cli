/**
 * Intent Service
 *
 * Orchestrates quote fetching, route encoding, and intent construction.
 */

import * as crypto from 'crypto';

import inquirer from 'inquirer';
import { encodeFunctionData, erc20Abi, formatUnits, Hex, parseUnits } from 'viem';

import { ChainConfig } from '@/config/chains';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { PortalEncoder } from '@/core/utils/portal-encoder';
import { getQuote, QuoteResponse } from '@/core/utils/quote';
import { logger } from '@/utils/logger';

export interface IntentConfig {
  sourceChain: ChainConfig;
  destChain: ChainConfig;
  creator: UniversalAddress;
  recipient: UniversalAddress;
  rewardToken: { address: BlockchainAddress; decimals: number; symbol?: string };
  rewardAmount: bigint;
  rewardAmountStr: string;
  routeToken: { address: BlockchainAddress; decimals: number; symbol?: string };
}

export interface BuildIntentResult {
  reward: Intent['reward'];
  encodedRoute: Hex;
  sourcePortal: UniversalAddress;
}

interface QuoteOrFallbackResult {
  encodedRoute: Hex;
  sourcePortal: UniversalAddress;
  proverAddress: UniversalAddress;
  routeAmountDisplay: string;
  rewardDeadline: bigint;
}

export class IntentService {
  async buildIntent(config: IntentConfig): Promise<BuildIntentResult> {
    const {
      sourceChain,
      destChain,
      creator,
      recipient,
      rewardToken,
      rewardAmount,
      rewardAmountStr,
      routeToken,
    } = config;

    const { encodedRoute, sourcePortal, proverAddress, routeAmountDisplay, rewardDeadline } =
      await this.getQuoteOrFallback(config);

    const reward: Intent['reward'] = {
      deadline: rewardDeadline,
      prover: proverAddress,
      creator,
      nativeAmount: 0n,
      tokens: [
        {
          token: AddressNormalizer.normalize(rewardToken.address, sourceChain.type),
          amount: rewardAmount,
        },
      ],
    };

    logger.displayIntentSummary({
      source: `${sourceChain.name} (${sourceChain.id})`,
      destination: `${destChain.name} (${destChain.id})`,
      creator: AddressNormalizer.denormalize(creator, sourceChain.type),
      recipient,
      rewardDeadline: new Date(Number(rewardDeadline) * 1000).toLocaleString(),
      routeToken: `${routeToken.address}${routeToken.symbol ? ` (${routeToken.symbol})` : ''}`,
      routeAmount: routeAmountDisplay,
      rewardToken: `${rewardToken.address}${rewardToken.symbol ? ` (${rewardToken.symbol})` : ''}`,
      rewardAmount: `${rewardAmountStr} (${rewardAmount.toString()} units)`,
    });

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Publish this intent?',
        default: true,
      },
    ]);

    if (!confirm) throw new Error('Publication cancelled by user');

    return { reward, encodedRoute, sourcePortal };
  }

  async getQuoteOrFallback(config: IntentConfig): Promise<QuoteOrFallbackResult> {
    const { sourceChain, destChain, creator, recipient, rewardToken, rewardAmount, routeToken } =
      config;

    const now = Math.floor(Date.now() / 1000);
    let rewardDeadline = BigInt(now + 2.5 * 60 * 60);

    let quote: QuoteResponse | null = null;
    logger.spinner('Getting quote...');

    try {
      quote = await getQuote({
        source: sourceChain.id,
        destination: destChain.id,
        funder: AddressNormalizer.denormalize(creator, sourceChain.type),
        recipient: AddressNormalizer.denormalize(recipient, destChain.type),
        amount: rewardAmount,
        routeToken: routeToken.address,
        rewardToken: rewardToken.address,
      });

      logger.succeed('Quote fetched');

      if (quote && (!quote.contracts?.sourcePortal || !quote.contracts?.prover)) {
        logger.warning('Quote response missing required contract addresses');
        quote = null;
      }
    } catch (error: unknown) {
      logger.stopSpinner();
      if (process.env.DEBUG) {
        console.error(error instanceof Error ? error.stack : String(error));
      }
      logger.warning('Quote service unavailable');
      quote = null;
    }

    if (quote) {
      const quoteData = quote.quoteResponse;
      if (!quoteData) {
        logger.warning('Quote response missing quote data');
        quote = null;
      } else {
        const encodedRoute = quoteData.encodedRoute as Hex;
        const sourcePortal = AddressNormalizer.normalize(
          quote.contracts.sourcePortal,
          sourceChain.type
        );
        const proverAddress = AddressNormalizer.normalize(quote.contracts.prover, sourceChain.type);
        const routeAmountDisplay = formatUnits(
          BigInt(quoteData.destinationAmount),
          routeToken.decimals
        );
        rewardDeadline = BigInt(quoteData.deadline);

        if (quoteData.estimatedFulfillTimeSec) {
          logger.info(`Estimated fulfillment time: ${quoteData.estimatedFulfillTimeSec} seconds`);
        }
        if (quoteData.intentExecutionType) {
          logger.info(`Execution type: ${quoteData.intentExecutionType}`);
        }

        return { encodedRoute, sourcePortal, proverAddress, routeAmountDisplay, rewardDeadline };
      }
    }

    return this.buildManualFallback(config, rewardDeadline);
  }

  private async buildManualFallback(
    config: IntentConfig,
    rewardDeadline: bigint
  ): Promise<QuoteOrFallbackResult> {
    const { sourceChain, destChain, recipient, routeToken } = config;

    logger.section('⚠️  Manual Configuration Required');
    logger.warning('Quote service is unavailable. Manual configuration is required.');
    logger.log('');
    logger.log('⚠️  Important:');
    logger.log('   • You must provide the route amount manually');
    logger.log('   • Portal and prover addresses will be needed');
    logger.log('   • Routing may not be optimal without quote service');
    logger.log('');

    const { proceedManual } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceedManual',
        message: 'Do you want to proceed with manual configuration?',
        default: true,
      },
    ]);

    if (!proceedManual) throw new Error('Publication cancelled by user');

    const { routeAmountStr } = await inquirer.prompt([
      {
        type: 'input',
        name: 'routeAmountStr',
        message: `Enter expected route amount (tokens to receive on ${destChain.name}):`,
        validate: (input: string) => {
          const num = parseFloat(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a positive number';
        },
      },
    ]);

    const routeAmount = parseUnits(routeAmountStr as string, routeToken.decimals);

    let sourcePortal: UniversalAddress;
    if (sourceChain.portalAddress) {
      sourcePortal = sourceChain.portalAddress;
      logger.log(`Using portal address from config: ${sourcePortal}`);
    } else {
      const { portalAddressInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'portalAddressInput',
          message: `Enter source portal address for ${sourceChain.name}:`,
          validate: (input: string) => {
            try {
              AddressNormalizer.normalize(input as BlockchainAddress, sourceChain.type);
              return true;
            } catch {
              return 'Invalid address format';
            }
          },
        },
      ]);
      sourcePortal = AddressNormalizer.normalize(
        portalAddressInput as BlockchainAddress,
        sourceChain.type
      );
    }

    let proverAddress: UniversalAddress;
    if (sourceChain.proverAddress) {
      proverAddress = sourceChain.proverAddress;
      logger.log(`Using prover address from config: ${proverAddress}`);
    } else {
      const { proverAddressInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'proverAddressInput',
          message: `Enter prover address for ${sourceChain.name}:`,
          validate: (input: string) => {
            try {
              AddressNormalizer.normalize(input as BlockchainAddress, sourceChain.type);
              return true;
            } catch {
              return 'Invalid address format';
            }
          },
        },
      ]);
      proverAddress = AddressNormalizer.normalize(
        proverAddressInput as BlockchainAddress,
        sourceChain.type
      );
    }

    logger.spinner('Building route manually...');

    const routeNow = Math.floor(Date.now() / 1000);
    const routeDeadline = BigInt(routeNow + 2 * 60 * 60);

    const transferCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [
        AddressNormalizer.denormalize(recipient, destChain.type) as `0x${string}`,
        routeAmount,
      ],
    });

    const route: Intent['route'] = {
      salt: `0x${crypto.randomBytes(32).toString('hex')}` as Hex,
      deadline: routeDeadline,
      portal: sourcePortal,
      nativeAmount: 0n,
      tokens: [
        {
          token: AddressNormalizer.normalize(routeToken.address, destChain.type),
          amount: routeAmount,
        },
      ],
      calls: [
        {
          target: AddressNormalizer.normalize(routeToken.address, destChain.type),
          data: transferCallData,
          value: 0n,
        },
      ],
    };

    const encodedRoute = this.encodeRoute(route, destChain.type);
    logger.succeed('Route built and encoded');

    return {
      encodedRoute,
      sourcePortal,
      proverAddress,
      routeAmountDisplay: routeAmountStr as string,
      rewardDeadline,
    };
  }

  private encodeRoute(route: Intent['route'], chainType: ChainType): Hex {
    return PortalEncoder.encode(route, chainType);
  }
}
