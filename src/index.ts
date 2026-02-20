#!/usr/bin/env node

const [major] = process.versions.node.split('.').map(Number);
if (major < 18) {
  console.error('routes-cli requires Node.js >= 18.0.0');
  process.exit(1);
}

/**
 * Intent Publisher CLI
 * Main entry point
 *
 * Import ordering in this file is intentional and must not be changed by auto-sort.
 * Chain handler side-effect imports MUST precede all @/ named imports because
 * chains.ts / tokens.ts call AddressNormalizer.normalize() at module load time,
 * which requires the chainRegistry to be populated first.
 */

/* eslint-disable simple-import-sort/imports */
import chalk from 'chalk';
import { Command } from 'commander';

import '@/blockchain/evm/evm-chain-handler';
import '@/blockchain/tvm/tvm-chain-handler';
import '@/blockchain/svm/svm-chain-handler';

import { createConfigCommand } from '@/commands/config';
import { createPublishCommand } from '@/commands/publish';
import { createStatusCommand } from '@/commands/status';
import { listChains, type ChainConfig } from '@/config/chains';
import { ConfigService } from '@/config/config-service';
import { chainRegistry } from '@/core/chain';
import { type TokenConfig } from '@/config/tokens';
import { handleCliError, setupGlobalErrorHandlers } from '@/utils/error-handler';
import { logger } from '@/utils/logger';
/* eslint-enable simple-import-sort/imports */

// Setup global error handling
setupGlobalErrorHandlers();

// Initialize configuration — single initialization point for all config
try {
  ConfigService.fromEnvironment();
} catch (error) {
  handleCliError(error);
}

// Register all configured chain IDs in the allowlist
listChains().forEach(chain => chainRegistry.registerChainId(chain.id));

// Create main program
const program = new Command();

program
  .name('intent-cli')
  .description('CLI tool for publishing intents to EVM, TVM, and SVM chains')
  .version('1.0.0');

// Add commands
program.addCommand(createPublishCommand());
program.addCommand(createStatusCommand());
program.addCommand(createConfigCommand());

// List chains command
program
  .command('chains')
  .description('List supported chains')
  .action(async () => {
    const { listChains } = await import('@/config/chains');
    const chains = listChains();

    logger.title('📋 Supported Chains');

    const headers = ['Name', 'ID', 'Type', 'Native Currency'];
    const rows = chains.map((chain: ChainConfig) => [
      chalk.yellow(chain.name),
      chain.id.toString(),
      chain.type,
      chain.nativeCurrency.symbol,
    ]);

    logger.displayTable(headers, rows);
  });

// List tokens command
program
  .command('tokens')
  .description('List configured tokens')
  .action(async () => {
    const { listTokens } = await import('@/config/tokens');
    const tokens = listTokens();

    logger.title('💰 Configured Tokens');

    const headers = ['Symbol', 'Name', 'Decimals', 'Available Chains'];
    const rows = tokens.map((token: TokenConfig) => [
      chalk.yellow(token.symbol),
      token.name,
      token.decimals,
      Object.keys(token.addresses).join(', '),
    ]);

    logger.displayTable(headers, rows, {
      colWidths: [10, 25, 10, 35],
      wordWrap: true,
    });
  });

// Parse arguments with error handling
try {
  program.parse(process.argv);
} catch (error) {
  handleCliError(error);
}

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
