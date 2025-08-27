#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createCommand,
  statusCommand,
  fundCommand,
  listTokensCommand,
  listChainsCommand,
} from './commands/index.js';
import { loggers } from './utils/index.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get version from package.json
let version = '1.0.0';
try {
  const packagePath = resolve(__dirname, '../package.json');
  const packageData = JSON.parse(readFileSync(packagePath, 'utf-8'));
  version = packageData.version;
} catch {
  // Fallback version if package.json not found
}

// Create CLI program
const program = new Command();

program
  .name('eco-portal')
  .description('Multi-VM CLI for creating cross-chain token transfer intents using Eco Protocol')
  .version(version)
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--debug', 'Enable debug logging')
  .hook('preAction', (thisCommand) => {
    // Set log level based on options
    const opts = thisCommand.opts();
    if (opts.debug) {
      process.env.LOG_LEVEL = 'debug';
    } else if (opts.verbose) {
      process.env.LOG_LEVEL = 'info';
    }
  });

// Create command
program
  .command('create')
  .description('Create a new cross-chain token transfer intent')
  .option('-s, --source-chain <chain>', 'Source chain name')
  .option('-d, --destination-chain <chain>', 'Destination chain name')
  .option('-rt, --route-token <token>', 'Route token symbol or address')
  .option('-ra, --route-amount <amount>', 'Route token amount')
  .option('-rwt, --reward-token <token>', 'Reward token symbol or address')
  .option('-rwa, --reward-amount <amount>', 'Reward token amount')
  .option('-r, --recipient <address>', 'Recipient address on destination chain')
  .option('--route-deadline <hours>', 'Route deadline in hours')
  .option('--refund-deadline <hours>', 'Refund deadline in hours')
  .action(async (options) => {
    await handleCommand(() => createCommand(options));
  });

// Status command
program
  .command('status')
  .description('Check intent status')
  .requiredOption('-h, --hash <hash>', 'Intent hash to check')
  .option('-c, --chain <chain>', 'Specific chain to check (default: all chains)')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    await handleCommand(() => statusCommand(options));
  });

// Fund command
program
  .command('fund')
  .description('Fund an intent vault')
  .requiredOption('-h, --hash <hash>', 'Intent hash')
  .option('-a, --amount <amount>', 'Amount to fund')
  .option('-t, --token <token>', 'Token to fund with (symbol or address)')
  .option('-c, --chain <chain>', 'Chain to fund from')
  .option('-r, --recipient <address>', 'Recipient address (for verification)')
  .action(async (options) => {
    await handleCommand(() => fundCommand(options));
  });

// List tokens command
program
  .command('list-tokens')
  .description('List available tokens')
  .option('-c, --chain <chain>', 'Filter by chain name')
  .option('--vm <vmType>', 'Filter by VM type (EVM, TVM, SVM)')
  .option('-s, --symbol <symbol>', 'Filter by token symbol')
  .option('--verified', 'Show only verified tokens')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    await handleCommand(() => listTokensCommand(options));
  });

// List chains command
program
  .command('list-chains')
  .description('List all supported chains')
  .option('--vm <vmType>', 'Filter by VM type (EVM, TVM, SVM)')
  .option('--available', 'Show only available chains')
  .option('--health', 'Check chain health status')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    await handleCommand(() => listChainsCommand(options));
  });

// Config command for managing configuration
program
  .command('config')
  .description('Manage CLI configuration')
  .option('--show', 'Show current configuration')
  .option('--validate', 'Validate configuration files')
  .action(async (options) => {
    await handleCommand(() => configCommand(options));
  });

// Wallet command for wallet management
program
  .command('wallet')
  .description('Manage wallet information')
  .option('--info', 'Show wallet addresses for all VMs')
  .option('--balance <chain>', 'Show token balances on specified chain')
  .action(async (options) => {
    await handleCommand(() => walletCommand(options));
  });

// Global error handler
async function handleCommand(commandFn: () => Promise<void>): Promise<void> {
  try {
    await commandFn();
  } catch (error) {
    const logger = loggers.cli;
    logger.error('Command failed', error);

    if (error instanceof Error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));

      if (process.env.LOG_LEVEL === 'debug' && error.stack) {
        console.error(chalk.gray('\nStack trace:'));
        console.error(chalk.gray(error.stack));
      }
    } else {
      console.error(chalk.red('\n❌ An unknown error occurred'));
    }

    process.exit(1);
  }
}

// Config command implementation
async function configCommand(options: { show?: boolean; validate?: boolean }): Promise<void> {
  const { loadConfig } = await import('./config/index.js');

  try {
    const config = await loadConfig();

    if (options.show) {
      console.log(chalk.blue.bold('\n⚙️  Current Configuration\n'));
      console.log(chalk.cyan('Version:'), config.version);
      console.log(chalk.cyan('Default Chain:'), config.defaultChain);
      console.log(chalk.cyan('Token Registry:'), config.tokenRegistry);
      console.log(chalk.cyan('Networks:'), config.networks.length);

      config.networks.forEach((network) => {
        console.log(`  • ${network.name} (${network.vmType}) - Chain ID: ${network.chainId}`);
      });
    }

    if (options.validate) {
      console.log(chalk.blue.bold('\n✅ Configuration is valid'));
      console.log(chalk.green(`• Found ${config.networks.length} networks`));
      console.log(chalk.green(`• Token registry path: ${config.tokenRegistry}`));
    }
  } catch (error) {
    throw new Error(
      `Configuration error: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

// Wallet command implementation
async function walletCommand(options: { info?: boolean; balance?: string }): Promise<void> {
  const { WalletManager } = await import('./services/index.js');

  const privateKey =
    process.env.PRIVATE_KEY ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.TVM_PRIVATE_KEY ||
    process.env.SVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Private key required. Set PRIVATE_KEY environment variable.');
  }

  const walletManager = new WalletManager(privateKey);

  if (options.info) {
    console.log(chalk.blue.bold('\n👛 Wallet Information\n'));

    const walletSummary = walletManager.getWalletSummary();
    const wallets = walletManager.getAllWalletAddresses();

    console.log(chalk.cyan('Supported VMs:'), walletSummary.totalSupported);
    console.log();

    wallets.forEach((wallet) => {
      const status = wallet.isValid ? chalk.green('✓') : chalk.red('✗');
      const address = WalletManager.formatAddressForDisplay(wallet.address, wallet.vmType);
      console.log(`${status} ${wallet.vmType}: ${address}`);
    });
  }

  if (options.balance) {
    // TODO: Implement balance checking for specific chain
    console.log(chalk.yellow('Balance checking not yet implemented'));
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  loggers.cli.error('Uncaught exception', error);
  console.error(chalk.red('\n💥 Uncaught exception:'), error.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  loggers.cli.error('Unhandled rejection', reason);
  console.error(chalk.red('\n💥 Unhandled promise rejection:'), reason);
  process.exit(1);
});

// Add helpful information
program.addHelpText(
  'before',
  `
${chalk.blue.bold('Eco Portal CLI')} - Multi-VM Cross-Chain Intent Creation

${chalk.cyan('Supported Virtual Machines:')}
• EVM: Ethereum, Optimism, Base, Arbitrum, etc.
• TVM: Tron Network
• SVM: Solana Network

${chalk.cyan('Environment Variables:')}
• PRIVATE_KEY - Your private key (supports all VM types)
• *_RPC_URL - Custom RPC URLs (e.g., OPTIMISM_RPC_URL)
• TOKEN_REGISTRY_PATH - Custom token registry file
• LOG_LEVEL - Logging level (error, warn, info, debug)

${chalk.cyan('Examples:')}
  eco-portal create                    # Interactive intent creation
  eco-portal list-chains --health      # List chains with health check
  eco-portal list-tokens --chain base  # List tokens on Base chain
  eco-portal status --hash 0x123...    # Check intent status
`
);

program.addHelpText(
  'after',
  `
${chalk.yellow('Need help?')} Check the documentation or run a command with --help
`
);

// Parse command line arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
  process.exit(0);
}

export default program;
