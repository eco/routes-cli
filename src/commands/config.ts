/**
 * Config Command
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Command } from 'commander';
import inquirer from 'inquirer';

import { ChainType } from '@/core/interfaces/intent';
import { logger } from '@/utils/logger';

interface ConfigSettings {
  defaultSourceChain?: string;
  defaultDestinationChain?: string;
  defaultPrivateKeys?: {
    [ChainType.EVM]?: string;
    [ChainType.TVM]?: string;
    [ChainType.SVM]?: string;
  };
  rpcUrls?: Record<string, string>;
  profiles?: Record<string, ConfigSettings>;
  currentProfile?: string;
}

const CONFIG_DIR = path.join(os.homedir(), '.eco-routes');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');

export function createConfigCommand(): Command {
  const command = new Command('config');

  command.description('Manage CLI configuration settings');

  // List all configuration
  command
    .command('list')
    .description('List current configuration')
    .option('--profile <name>', 'Show configuration for specific profile')
    .action(async options => {
      try {
        const config = loadConfig();

        if (options.profile) {
          if (!config.profiles?.[options.profile]) {
            logger.error(`Profile '${options.profile}' not found`);
            process.exit(1);
          }

          logger.title(`📋 Profile: ${options.profile}`);
          displayConfig(config.profiles[options.profile]);
        } else {
          logger.title('📋 Current Configuration');
          if (config.currentProfile) {
            logger.info(`Active Profile: ${config.currentProfile}`);
            logger.info('');
          }
          displayConfig(config);

          if (config.profiles && Object.keys(config.profiles).length > 0) {
            logger.section('Available Profiles');
            Object.keys(config.profiles).forEach(name => {
              const isActive = name === config.currentProfile ? ' (active)' : '';
              logger.info(`• ${name}${isActive}`);
            });
          }
        }
      } catch (error) {
        logger.error(
          `Error reading configuration: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Set configuration values
  command
    .command('set')
    .description('Set configuration values')
    .argument('[key]', 'Configuration key (e.g., defaultSourceChain)')
    .argument('[value]', 'Configuration value')
    .option('--profile <name>', 'Set value for specific profile')
    .option('-i, --interactive', 'Interactive mode')
    .action(async (key, value, options) => {
      try {
        if (options.interactive || (!key && !value)) {
          await setConfigInteractive(options.profile);
        } else if (key && value !== undefined) {
          await setConfigValue(key, value, options.profile);
        } else {
          logger.error('Please provide both key and value, or use --interactive mode');
          process.exit(1);
        }
      } catch (error) {
        logger.error(
          `Error setting configuration: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Get configuration value
  command
    .command('get')
    .description('Get configuration value')
    .argument('<key>', 'Configuration key')
    .option('--profile <name>', 'Get value from specific profile')
    .action((key, options) => {
      try {
        const config = loadConfig();
        const targetConfig = options.profile ? config.profiles?.[options.profile] || {} : config;

        const value = getNestedValue(targetConfig, key);

        if (value !== undefined) {
          // Mask private keys for security
          if (key.toLowerCase().includes('private')) {
            console.log('***[HIDDEN]***');
          } else {
            console.log(value);
          }
        } else {
          logger.warn(`Configuration key '${key}' not found`);
          process.exit(1);
        }
      } catch (error) {
        logger.error(
          `Error getting configuration: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Remove configuration key
  command
    .command('unset')
    .description('Remove configuration key')
    .argument('<key>', 'Configuration key to remove')
    .option('--profile <name>', 'Remove from specific profile')
    .action(async (key, options) => {
      try {
        await unsetConfigValue(key, options.profile);
        logger.success(`Configuration key '${key}' removed`);
      } catch (error) {
        logger.error(
          `Error removing configuration: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Profile management - create profile subcommand
  const profileCommand = command.command('profile').description('Manage configuration profiles');

  profileCommand
    .command('create <name>')
    .description('Create a new profile')
    .action(async name => {
      try {
        await createProfile(name);
        logger.success(`Profile '${name}' created`);
      } catch (error) {
        logger.error(
          `Error creating profile: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  profileCommand
    .command('switch <name>')
    .description('Switch to a profile')
    .action(async name => {
      try {
        await switchProfile(name);
        logger.success(`Switched to profile '${name}'`);
      } catch (error) {
        logger.error(
          `Error switching profile: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  profileCommand
    .command('delete <name>')
    .description('Delete a profile')
    .option('--force', 'Skip confirmation')
    .action(async (name, options) => {
      try {
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to delete profile '${name}'?`,
              default: false,
            },
          ]);

          if (!confirm) {
            logger.info('Profile deletion cancelled');
            return;
          }
        }

        await deleteProfile(name);
        logger.success(`Profile '${name}' deleted`);
      } catch (error) {
        logger.error(
          `Error deleting profile: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  profileCommand
    .command('list')
    .description('List available profiles')
    .action(() => {
      try {
        const config = loadConfig();
        if (!config.profiles || Object.keys(config.profiles).length === 0) {
          logger.info('No profiles found');
          return;
        }

        logger.title('📋 Available Profiles');
        Object.keys(config.profiles).forEach(name => {
          const isActive = name === config.currentProfile ? ' (active)' : '';
          logger.info(`• ${name}${isActive}`);
        });
      } catch (error) {
        logger.error(
          `Error listing profiles: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  // Reset configuration
  command
    .command('reset')
    .description('Reset configuration to defaults')
    .option('--profile <name>', 'Reset specific profile')
    .option('--force', 'Skip confirmation')
    .action(async options => {
      try {
        if (!options.force) {
          const target = options.profile ? `profile '${options.profile}'` : 'entire configuration';
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `Are you sure you want to reset ${target}?`,
              default: false,
            },
          ]);

          if (!confirm) {
            logger.info('Reset cancelled');
            return;
          }
        }

        await resetConfig(options.profile);
        logger.success(
          options.profile ? `Profile '${options.profile}' reset` : 'Configuration reset'
        );
      } catch (error) {
        logger.error(
          `Error resetting configuration: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });

  return command;
}

function loadConfig(): ConfigSettings {
  if (!fs.existsSync(CONFIG_FILE)) {
    return {};
  }

  try {
    const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    throw new Error(
      `Failed to parse config file: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function saveConfig(config: ConfigSettings): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }
}

function displayConfig(config: ConfigSettings): void {
  const data: Record<string, any> = {};

  if (config.defaultSourceChain) data['Default Source Chain'] = config.defaultSourceChain;
  if (config.defaultDestinationChain)
    data['Default Destination Chain'] = config.defaultDestinationChain;

  // Show RPC URLs
  if (config.rpcUrls && Object.keys(config.rpcUrls).length > 0) {
    Object.entries(config.rpcUrls).forEach(([chain, url]) => {
      data[`RPC URL (${chain})`] = url;
    });
  }

  // Show private key status (masked)
  if (config.defaultPrivateKeys) {
    Object.entries(config.defaultPrivateKeys).forEach(([chainType, key]) => {
      if (key) {
        data[`Private Key (${chainType})`] = '***[SET]***';
      }
    });
  }

  if (Object.keys(data).length === 0) {
    logger.info('No configuration set');
  } else {
    logger.displayKeyValue(data);
  }
}

async function setConfigInteractive(profileName?: string): Promise<void> {
  const config = loadConfig();
  const targetConfig = profileName ? config.profiles?.[profileName] || {} : config;

  logger.title('🔧 Interactive Configuration Setup');

  if (profileName) {
    logger.info(`Configuring profile: ${profileName}`);
  }

  const questions = [
    {
      type: 'input',
      name: 'defaultSourceChain',
      message: 'Default source chain (name or ID):',
      default: targetConfig.defaultSourceChain,
    },
    {
      type: 'input',
      name: 'defaultDestinationChain',
      message: 'Default destination chain (name or ID):',
      default: targetConfig.defaultDestinationChain,
    },
    {
      type: 'password',
      name: 'evmPrivateKey',
      message: 'EVM private key (optional):',
      mask: '*',
    },
    {
      type: 'password',
      name: 'tvmPrivateKey',
      message: 'TVM private key (optional):',
      mask: '*',
    },
    {
      type: 'password',
      name: 'svmPrivateKey',
      message: 'SVM private key (optional):',
      mask: '*',
    },
  ];

  const answers = await inquirer.prompt(questions);

  // Update configuration
  if (answers.defaultSourceChain) targetConfig.defaultSourceChain = answers.defaultSourceChain;
  if (answers.defaultDestinationChain)
    targetConfig.defaultDestinationChain = answers.defaultDestinationChain;

  if (!targetConfig.defaultPrivateKeys) targetConfig.defaultPrivateKeys = {};
  if (answers.evmPrivateKey) targetConfig.defaultPrivateKeys[ChainType.EVM] = answers.evmPrivateKey;
  if (answers.tvmPrivateKey) targetConfig.defaultPrivateKeys[ChainType.TVM] = answers.tvmPrivateKey;
  if (answers.svmPrivateKey) targetConfig.defaultPrivateKeys[ChainType.SVM] = answers.svmPrivateKey;

  if (profileName) {
    if (!config.profiles) config.profiles = {};
    config.profiles[profileName] = targetConfig;
  } else {
    Object.assign(config, targetConfig);
  }

  saveConfig(config);
  logger.success('Configuration updated successfully');
}

async function setConfigValue(key: string, value: string, profileName?: string): Promise<void> {
  const config = loadConfig();
  const targetConfig = profileName ? config.profiles?.[profileName] || {} : config;

  setNestedValue(targetConfig, key, value);

  if (profileName) {
    if (!config.profiles) config.profiles = {};
    config.profiles[profileName] = targetConfig;
  } else {
    Object.assign(config, targetConfig);
  }

  saveConfig(config);
  logger.success(`Configuration key '${key}' set to '${value}'`);
}

async function unsetConfigValue(key: string, profileName?: string): Promise<void> {
  const config = loadConfig();
  const targetConfig = profileName ? config.profiles?.[profileName] || {} : config;

  deleteNestedValue(targetConfig, key);

  if (profileName) {
    if (!config.profiles) config.profiles = {};
    config.profiles[profileName] = targetConfig;
  } else {
    Object.assign(config, targetConfig);
  }

  saveConfig(config);
}

async function createProfile(name: string): Promise<void> {
  const config = loadConfig();

  if (!config.profiles) config.profiles = {};
  if (config.profiles[name]) {
    throw new Error(`Profile '${name}' already exists`);
  }

  config.profiles[name] = {};
  saveConfig(config);
}

async function switchProfile(name: string): Promise<void> {
  const config = loadConfig();

  if (!config.profiles?.[name]) {
    throw new Error(`Profile '${name}' does not exist`);
  }

  config.currentProfile = name;
  saveConfig(config);
}

async function deleteProfile(name: string): Promise<void> {
  const config = loadConfig();

  if (!config.profiles?.[name]) {
    throw new Error(`Profile '${name}' does not exist`);
  }

  delete config.profiles[name];
  if (config.currentProfile === name) {
    delete config.currentProfile;
  }

  saveConfig(config);
}

async function resetConfig(profileName?: string): Promise<void> {
  if (profileName) {
    const config = loadConfig();
    if (config.profiles?.[profileName]) {
      config.profiles[profileName] = {};
      saveConfig(config);
    }
  } else {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  }
}

// Utility functions for nested object operations
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNestedValue(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => {
    if (!current[key] || typeof current[key] !== 'object') {
      current[key] = {};
    }
    return current[key];
  }, obj);
  target[lastKey] = value;
}

function deleteNestedValue(obj: any, path: string): void {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  const target = keys.reduce((current, key) => current?.[key], obj);
  if (target) {
    delete target[lastKey];
  }
}
