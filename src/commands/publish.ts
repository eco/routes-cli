/**
 * Publish Command
 *
 * Thin orchestrator that wires together prompts, intent building, and publishing.
 */

import { Command } from 'commander';

import { createPublisher } from '@/blockchain/publisher-factory';
import { getPrivateKey, getWalletAddress } from '@/cli/key-provider';
import {
  configureReward,
  selectDestinationChain,
  selectRecipient,
  selectSourceChain,
  selectToken,
} from '@/cli/prompts/intent-prompts';
import { serialize } from '@/commons/utils/serialize';
import { IntentService } from '@/core/services/intent-service';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

/** Options accepted by the `publish` CLI command. */
interface PublishCommandOptions {
  /** Source chain name or numeric ID (e.g. `"base"` or `"8453"`). */
  source?: string;
  /** Destination chain name or numeric ID. */
  destination?: string;
  /** Private key override — takes precedence over the corresponding env variable. */
  privateKey?: string;
  /** RPC URL override — takes precedence over the chain's default endpoint. */
  rpc?: string;
  /** Recipient address on the destination chain in chain-native format. */
  recipient?: string;
  /** When true, validates intent parameters but does not broadcast a transaction. */
  dryRun?: boolean;
}

/**
 * Creates the `publish` Commander command.
 *
 * Interactively collects chain selection, token configuration, and reward
 * parameters, then publishes an intent to the source-chain Portal contract.
 *
 * @returns A configured {@link Command} instance ready to be registered with the CLI.
 *
 * @example
 * ```ts
 * program.addCommand(createPublishCommand());
 * ```
 */
export function createPublishCommand(): Command {
  const command = new Command('publish');

  command
    .description('Publish an intent to the blockchain')
    .option('-s, --source <chain>', 'Source chain (name or ID)')
    .option('-d, --destination <chain>', 'Destination chain (name or ID)')
    .option('-k, --private-key <key>', 'Private key (overrides env)')
    .option('-r, --rpc <url>', 'RPC URL (overrides env)')
    .option('--recipient <address>', 'Recipient address on destination chain')
    .option('--dry-run', 'Validate without publishing')
    .action(async (options: PublishCommandOptions) => {
      try {
        logger.title('🎨 Interactive Intent Publishing');

        const sourceChain = await selectSourceChain(options);
        const destChain = await selectDestinationChain(sourceChain, options);

        logger.section('📏 Route Configuration (Destination Chain)');
        const routeToken = await selectToken(destChain, 'route');

        const rewardConfig = await configureReward(sourceChain, options);
        const recipient = await selectRecipient(destChain, options);

        const privateKey = getPrivateKey(sourceChain.type, options.privateKey);
        const senderNative = getWalletAddress(sourceChain.type, privateKey);
        const creator = AddressNormalizer.normalize(senderNative, sourceChain.type);

        logger.log(`Sender: ${senderNative}`);
        logger.log(`Source: ${sourceChain.name} (${sourceChain.id})`);
        logger.log(`Destination: ${destChain.name} (${destChain.id})`);

        const intentService = new IntentService();
        const { reward, encodedRoute, sourcePortal } = await intentService.buildIntent({
          sourceChain,
          destChain,
          creator,
          recipient,
          rewardToken: rewardConfig.token,
          rewardAmount: rewardConfig.amount,
          rewardAmountStr: rewardConfig.amountStr,
          routeToken,
        });

        if (process.env.DEBUG) {
          logger.log(`Reward: ${serialize(reward)}`);
        }

        if (options.dryRun) {
          logger.warning('Dry run - not publishing');
          return;
        }

        const rpcUrl = options.rpc || sourceChain.rpcUrl;
        const publisher = createPublisher(sourceChain.type, rpcUrl);

        logger.spinner('Publishing intent to blockchain...');
        const result = await publisher.publish(
          sourceChain.id,
          destChain.id,
          reward,
          encodedRoute,
          privateKey,
          sourcePortal
        );

        if (result.success) {
          logger.displayTransactionResult(result);
        } else {
          logger.fail('Publishing failed');
          throw new Error(result.error ?? 'Publishing failed');
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
