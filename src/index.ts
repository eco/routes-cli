#!/usr/bin/env node

/**
 * Intent Publisher CLI
 * Main entry point
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { createPublishCommand } from './commands/publish';
import { createCreateCommand } from './commands/create';
import { updatePortalAddresses } from './config/chains';

// Load environment variables and update configuration
updatePortalAddresses(process.env);

// Create main program
const program = new Command();

program
  .name('intent-cli')
  .description('CLI tool for publishing intents to EVM, TVM, and SVM chains')
  .version('1.0.0');

// Add commands
program.addCommand(createCreateCommand());
program.addCommand(createPublishCommand());

// List chains command
program
  .command('chains')
  .description('List supported chains')
  .action(() => {
    const { listChains } = require('./config/chains');
    const chains = listChains();
    
    console.log(chalk.blue('\n📋 Supported Chains:\n'));
    
    chains.forEach((chain: any) => {
      console.log(chalk.yellow(`${chain.name}`));
      console.log(chalk.gray(`  ID: ${chain.id}`));
      console.log(chalk.gray(`  Type: ${chain.type}`));
      console.log(chalk.gray(`  Native: ${chain.nativeCurrency.symbol}`));
      console.log();
    });
  });

// List tokens command
program
  .command('tokens')
  .description('List configured tokens')
  .action(() => {
    const { listTokens } = require('./config/tokens');
    const tokens = listTokens();
    
    console.log(chalk.blue('\n💰 Configured Tokens:\n'));
    
    tokens.forEach((token: any) => {
      console.log(chalk.yellow(`${token.symbol} - ${token.name}`));
      console.log(chalk.gray(`  Decimals: ${token.decimals}`));
      console.log(chalk.gray(`  Chains: ${Object.keys(token.addresses).join(', ')}`));
      console.log();
    });
  });

// Parse arguments
program.parse(process.argv);

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}