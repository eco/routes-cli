/**
 * Sentinel Command
 *
 * CLI command for running Sentinel locally
 */

import { Command } from 'commander';

import { startSentinel } from '@/sentinel';

export function createSentinelCommand(): Command {
  const command = new Command('sentinel');

  command
    .description('Start Sentinel route health monitor')
    .option('-c, --config <path>', 'Path to config file')
    .action(async options => {
      await startSentinel(options.config);
    });

  return command;
}
