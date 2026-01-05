/**
 * Refund Command
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { Hex } from 'viem';

import { BasePublisher } from '@/blockchain/base-publisher';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { getChainById } from '@/config/chains';
import { loadEnvConfig } from '@/config/env';
import { ChainType } from '@/core/interfaces/intent';
import { IntentStorage } from '@/storage/intent-storage';
import { logger } from '@/utils/logger';

interface RefundCommandOptions {
  privateKey?: string;
  yes?: boolean;
  rpc?: string;
}

export function createRefundCommand(): Command {
  const command = new Command('refund');

  command
    .description('Refund an expired, unfulfilled intent')
    .argument('<intentHash>', 'Intent hash to refund (0x-prefixed hex string)')
    .option('-k, --private-key <key>', 'Private key (overrides env)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .option('-r, --rpc <url>', 'RPC URL (overrides env and config)')
    .action(async (intentHashArg: string, options: RefundCommandOptions) => {
      try {
        // Validate intent hash format
        if (!intentHashArg.startsWith('0x') || intentHashArg.length !== 66) {
          throw new Error('Intent hash must be a 0x-prefixed 64-character hex string');
        }

        const intentHash = intentHashArg as Hex;

        logger.title('💸 Intent Refund');
        logger.info(`Intent Hash: ${intentHash}`);
        logger.info('');

        // Load stored intent data
        logger.spinner('Loading intent data...');
        const storage = new IntentStorage();
        const storedIntent = storage.getIntent(intentHash);

        if (!storedIntent) {
          logger.fail('Intent not found in local storage');
          throw new Error(
            'Intent data not found. This intent may have been published from a different machine or before intent tracking was implemented.'
          );
        }

        logger.succeed('Intent data loaded');

        // Check if already refunded
        if (storedIntent.refunded) {
          logger.warning('This intent has already been refunded');
          logger.info(`Refunded at: ${storedIntent.refundedAt}`);
          logger.info(`Transaction: ${storedIntent.transactionHash}`);
          return;
        }

        // Get source chain
        const sourceChain = getChainById(storedIntent.sourceChainId);
        if (!sourceChain) {
          throw new Error(`Unknown source chain: ${storedIntent.sourceChainId}`);
        }

        // Get destination chain
        const destChain = getChainById(storedIntent.destinationChainId);
        if (!destChain) {
          throw new Error(`Unknown destination chain: ${storedIntent.destinationChainId}`);
        }

        logger.section('📋 Intent Details');
        logger.info(`Source Chain: ${sourceChain.name} (${sourceChain.id})`);
        logger.info(`Destination Chain: ${destChain.name} (${destChain.id})`);
        logger.info(`Published: ${new Date(storedIntent.publishedAt).toLocaleString()}`);

        // Check deadline
        const now = Math.floor(Date.now() / 1000);
        const deadline = Number(storedIntent.reward.deadline);
        const isPastDeadline = now > deadline;

        logger.info(
          `Deadline: ${new Date(deadline * 1000).toLocaleString()} ${isPastDeadline ? '(expired ✓)' : '(not yet expired)'}`
        );

        if (!isPastDeadline) {
          const timeRemaining = deadline - now;
          const hours = Math.floor(timeRemaining / 3600);
          const minutes = Math.floor((timeRemaining % 3600) / 60);
          logger.warning(`Cannot refund: deadline not passed (${hours}h ${minutes}m remaining)`);
          return;
        }

        logger.info('');

        // Confirmation prompt
        if (!options.yes) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: 'Execute refund transaction?',
              default: true,
            },
          ]);

          if (!confirm) {
            logger.info('Refund cancelled');
            return;
          }
        }

        // Get private key
        const env = loadEnvConfig();
        let privateKey = options.privateKey;

        if (!privateKey) {
          switch (sourceChain.type) {
            case ChainType.EVM:
              privateKey = env.evmPrivateKey;
              break;
            case ChainType.TVM:
              throw new Error('TVM refunds not yet supported');
            case ChainType.SVM:
              privateKey = env.svmPrivateKey;
              break;
          }
        }

        if (!privateKey) {
          throw new Error(`No private key configured for ${sourceChain.type} chain`);
        }

        // Determine RPC URL
        const rpcUrl = options.rpc || sourceChain.rpcUrl;

        // Create publisher
        let publisher: BasePublisher;
        switch (sourceChain.type) {
          case ChainType.EVM:
            publisher = new EvmPublisher(rpcUrl);
            break;
          case ChainType.SVM:
            publisher = new SvmPublisher(rpcUrl);
            break;
          case ChainType.TVM:
            throw new Error('TVM refunds not yet supported');
          default:
            throw new Error(`Unsupported chain type: ${sourceChain.type}`);
        }

        // Execute refund
        logger.section('🔄 Executing Refund');
        const result = await publisher.refund(
          storedIntent.sourceChainId,
          storedIntent.destinationChainId,
          storedIntent.routeHash,
          storedIntent.reward,
          privateKey,
          sourceChain.portalAddress
        );

        if (result.success) {
          logger.displayTransactionResult(result);

          // Mark as refunded in storage
          storage.markAsRefunded(intentHash, result.transactionHash!);
          logger.succeed('Intent marked as refunded in local storage');
        } else {
          logger.fail('Refund failed');
          throw new Error(result.error || 'Refund failed');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error: ${errorMessage}`);
        if (process.env.DEBUG && error instanceof Error) {
          logger.error(`Stack: ${error.stack}`);
        }
        process.exit(1);
      }
    });

  return command;
}
