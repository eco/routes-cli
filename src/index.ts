#!/usr/bin/env node

/**
 * Intent Publisher CLI
 * Main entry point
 */

import { Command } from "commander";
import chalk from "chalk";
import { createPublishCommand } from "@/commands/publish";
import { createStatusCommand } from "@/commands/status";
import { createConfigCommand } from "@/commands/config";
import { updatePortalAddresses } from "@/config/chains";
import { logger } from "@/utils/logger";
import { setupGlobalErrorHandlers, handleCliError } from "@/utils/error-handler";

// Setup global error handling
setupGlobalErrorHandlers();

// Load environment variables and update configuration
try {
  updatePortalAddresses(process.env);
} catch (error) {
  handleCliError(error);
}

// Create main program
const program = new Command();

program
  .name("intent-cli")
  .description("CLI tool for publishing intents to EVM, TVM, and SVM chains")
  .version("1.0.0");

// Add commands
program.addCommand(createPublishCommand());
program.addCommand(createStatusCommand());
program.addCommand(createConfigCommand());

// List chains command
program
  .command("chains")
  .description("List supported chains")
  .action(() => {
    const { listChains } = require("@/config/chains");
    const chains = listChains();

    logger.title("📋 Supported Chains");

    const headers = ["Name", "ID", "Type", "Native Currency"];
    const rows = chains.map((chain: any) => [
      chalk.yellow(chain.name),
      chain.id,
      chain.type,
      chain.nativeCurrency.symbol
    ]);

    logger.displayTable(headers, rows);
  });

// List tokens command
program
  .command("tokens")
  .description("List configured tokens")
  .action(() => {
    const { listTokens } = require("@/config/tokens");
    const tokens = listTokens();

    logger.title("💰 Configured Tokens");

    const headers = ["Symbol", "Name", "Decimals", "Available Chains"];
    const rows = tokens.map((token: any) => [
      chalk.yellow(token.symbol),
      token.name,
      token.decimals,
      Object.keys(token.addresses).join(", ")
    ]);

    logger.displayTable(headers, rows, {
      colWidths: [10, 25, 10, 35],
      wordWrap: true
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
