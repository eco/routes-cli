/**
 * Status Command
 */

import { Command } from 'commander';
import { Address, createPublicClient, getContract, Hex, http } from 'viem';

import { portalAbi } from '@/commons/abis/portal.abi';
import { ChainConfig, getChainById, getChainByName } from '@/config/chains';
import { ChainType } from '@/core/interfaces/intent';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { chalk, logger } from '@/utils/logger';

interface IntentStatus {
  intentHash: string;
  isFulfilled: boolean;
  claimant?: string;
  transactionHash?: string;
  blockNumber?: bigint;
  timestamp?: Date;
}

interface StatusCommandOptions {
  chain?: string;
  watch?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export function createStatusCommand(): Command {
  const command = new Command('status');

  command
    .description('Check the fulfillment status of an intent')
    .argument('<intentHash>', 'Intent hash to check (0x-prefixed hex string)')
    .option('-c, --chain <chain>', 'Destination chain (name or ID)')
    .option('-w, --watch', 'Watch for status updates (poll every 30 seconds)')
    .option('--json', 'Output in JSON format')
    .option('--verbose', 'Show detailed information')
    .action(async (intentHashArg: string, options) => {
      try {
        // Validate intent hash format
        if (!intentHashArg.startsWith('0x') || intentHashArg.length !== 66) {
          throw new Error('Intent hash must be a 0x-prefixed 64-character hex string');
        }

        const intentHash = intentHashArg as Hex;

        // Get destination chain
        let destChain: ChainConfig | undefined;
        if (options.chain) {
          // Try to get by name first, then by ID
          destChain = getChainByName(options.chain) || getChainById(options.chain);
          if (!destChain) {
            throw new Error(`Unknown chain: ${options.chain}`);
          }
        } else {
          throw new Error('Destination chain is required. Use --chain option.');
        }

        // Only EVM chains are supported for now
        if (destChain.type !== ChainType.EVM) {
          throw new Error('Status checking is currently only supported for EVM chains');
        }

        if (!options.json && !options.watch) {
          logger.title(`🔍 Checking Intent Status`);
          logger.info(`Intent Hash: ${intentHash}`);
          logger.info(`Chain: ${destChain.name} (${destChain.id})`);
          logger.info('');
        }

        if (options.watch) {
          await watchIntentStatus(intentHash, destChain, options);
        } else {
          const status = await getIntentStatus(intentHash, destChain, options.verbose);
          displayStatus(status, options);
        }
      } catch (error) {
        if (options.json) {
          logger.log(
            JSON.stringify(
              { error: error instanceof Error ? error.message : String(error) },
              null,
              2
            )
          );
        } else {
          logger.error(
            `Error checking intent status: ${error instanceof Error ? error.message : String(error)}`
          );
        }
        process.exit(1);
      }
    });

  return command;
}

async function getIntentStatus(
  intentHash: Hex,
  chain: ChainConfig,
  verbose: boolean = false
): Promise<IntentStatus> {
  // Create public client for the destination chain
  const client = createPublicClient({
    chain: {
      id: Number(chain.id),
      name: chain.name,
      network: chain.name.toLowerCase(),
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: {
        default: { http: [chain.rpcUrl] },
        public: { http: [chain.rpcUrl] },
      },
    },
    transport: http(chain.rpcUrl),
  });

  // Get the portal address (denormalized for EVM)
  if (!chain.portalAddress) {
    throw new Error(`No portal address configured for chain ${chain.name}`);
  }

  const portalAddress = AddressNormalizer.denormalize(
    chain.portalAddress,
    ChainType.EVM
  ) as Address;

  if (verbose) {
    logger.info(`Querying Portal contract: ${portalAddress}`);
  }

  // Create contract instance
  const portalContract = getContract({
    address: portalAddress,
    abi: portalAbi,
    client,
  });

  try {
    // TODO: Must query the last 10k blocks in 1k intervals
    // Query for IntentFulfilled events
    const [event] = await portalContract.getEvents.IntentFulfilled({
      intentHash,
    });

    if (process.env.DEBUG) {
      logger.log(`Event: ${JSON.stringify({ event, portalAddress, client: client.chain.name })}`);
    }

    const status: IntentStatus = {
      intentHash,
      isFulfilled: Boolean(event),
    };

    if (status.isFulfilled) {
      // Get the most recent fulfillment event

      status.claimant = event.args.claimant;
      status.transactionHash = event.transactionHash;
      status.blockNumber = event.blockNumber;

      // Get block timestamp
      if (event.blockNumber) {
        const block = await client.getBlock({ blockNumber: event.blockNumber });
        status.timestamp = new Date(Number(block.timestamp) * 1000);
      }

      if (verbose && event.transactionHash) {
        logger.info(`Fulfillment transaction: ${event.transactionHash}`);
        logger.info(`Block number: ${event.blockNumber}`);
      }
    }

    return status;
  } catch (error) {
    throw new Error(
      `Failed to query Portal contract: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function watchIntentStatus(
  intentHash: Hex,
  chain: ChainConfig,
  options: StatusCommandOptions
): Promise<void> {
  const POLL_INTERVAL = 10_000; // 30 seconds

  if (!options.json) {
    logger.title(`👀 Watching Intent Status`);
    logger.info(`Polling every 10 seconds... (Press Ctrl+C to stop)`);
    logger.info('');
  }

  let lastStatus: IntentStatus | null = null;

  while (true) {
    try {
      const status = await getIntentStatus(intentHash, chain, options.verbose);

      // Only display if status changed or it's the first check
      if (!lastStatus || status.isFulfilled !== lastStatus.isFulfilled) {
        if (options.json) {
          logger.log(
            JSON.stringify(
              {
                timestamp: new Date().toISOString(),
                ...status,
              },
              null,
              2
            )
          );
        } else {
          if (lastStatus) {
            logger.info(`Status changed at ${new Date().toLocaleTimeString()}`);
          }
          displayStatus(status, options);

          if (status.isFulfilled) {
            logger.succeed('Intent fulfilled! Stopping watch...');
            break;
          }
        }
        lastStatus = status;
      }

      if (!options.json && !status.isFulfilled) {
        process.stdout.write(
          `\rLast checked: ${new Date().toLocaleTimeString()} - Status: Pending...`
        );
      }

      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    } catch (error) {
      if (options.json) {
        logger.log(
          JSON.stringify(
            {
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : String(error),
            },
            null,
            2
          )
        );
      } else {
        logger.error(
          `Error during watch: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
    }
  }
}

function displayStatus(status: IntentStatus, options: StatusCommandOptions): void {
  if (options.json) {
    logger.log(
      JSON.stringify(
        status,
        (key, value) => {
          // Convert BigInt to string for JSON serialization
          return typeof value === 'bigint' ? value.toString() : value;
        },
        2
      )
    );
    return;
  }

  // Human-readable display
  const statusText = status.isFulfilled ? chalk.green('✅ Fulfilled') : chalk.yellow('⏳ Pending');

  logger.info(`Status: ${statusText}`);

  if (status.isFulfilled && status.claimant) {
    logger.info(`Solver (Claimant): ${status.claimant}`);

    if (status.transactionHash) {
      logger.info(`Fulfillment Transaction: ${status.transactionHash}`);
    }

    if (status.blockNumber) {
      logger.info(`Block Number: ${status.blockNumber.toString()}`);
    }

    if (status.timestamp) {
      logger.info(`Fulfilled At: ${status.timestamp.toLocaleString()}`);
    }
  } else if (!status.isFulfilled) {
    logger.info('The intent has not been fulfilled yet.');
    logger.info('Solvers are still working to execute this intent.');
  }
}
