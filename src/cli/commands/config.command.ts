import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { Injectable } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';

import { ConfigService } from '@/config/config.service';
import { ChainType } from '@/shared/types';

import { PromptService } from '../services/prompt.service';

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

interface ConfigOptions {
  interactive?: boolean;
  profile?: string;
  force?: boolean;
}

const CONFIG_DIR = path.join(os.homedir(), '.eco-routes');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const PROFILES_DIR = path.join(CONFIG_DIR, 'profiles');

@Injectable()
@Command({
  name: 'config',
  description: 'Manage CLI configuration settings',
  arguments: '[subcommand] [key] [value]',
})
export class ConfigCommand extends CommandRunner {
  constructor(
    private readonly configService: ConfigService,
    private readonly prompt: PromptService
  ) {
    super();
  }

  async run(inputs: string[], options: ConfigOptions): Promise<void> {
    const [subcommand, key, value] = inputs;

    switch (subcommand) {
      case 'list':
        this.runList(options.profile);
        break;
      case 'set':
        await this.runSet(key, value, options);
        break;
      case 'get':
        this.runGet(key, options.profile);
        break;
      case 'unset':
        this.runUnset(key, options.profile);
        break;
      case 'reset':
        await this.runReset(options);
        break;
      case 'profile':
        await this.runProfile(key, value, options);
        break;
      default:
        console.log('Usage: config <list|set|get|unset|reset|profile> [args]');
        console.log('  list                      Show current configuration');
        console.log('  set <key> <value>         Set a configuration value');
        console.log('  set --interactive         Interactive guided setup');
        console.log('  get <key>                 Get a configuration value');
        console.log('  unset <key>               Remove a configuration key');
        console.log('  reset                     Reset configuration to defaults');
        console.log('  profile <create|switch|delete|list> [name]');
    }
  }

  private runList(profileName?: string): void {
    const config = this.loadConfig();
    if (profileName) {
      if (!config.profiles?.[profileName]) {
        console.error(`Profile '${profileName}' not found`);
        process.exit(1);
      }
      console.log(`📋 Profile: ${profileName}`);
      this.displayConfig(config.profiles[profileName]);
    } else {
      console.log('📋 Current Configuration');
      if (config.currentProfile) console.log(`Active Profile: ${config.currentProfile}\n`);
      this.displayConfig(config);
      if (config.profiles && Object.keys(config.profiles).length > 0) {
        console.log('\nAvailable Profiles:');
        for (const name of Object.keys(config.profiles)) {
          console.log(`  • ${name}${name === config.currentProfile ? ' (active)' : ''}`);
        }
      }
    }
  }

  private async runSet(
    key: string | undefined,
    value: string | undefined,
    options: ConfigOptions
  ): Promise<void> {
    if (options.interactive || (!key && !value)) {
      await this.setConfigInteractive(options.profile);
    } else if (key && value !== undefined) {
      this.setConfigValue(key, value, options.profile);
    } else {
      console.error('Please provide both key and value, or use --interactive mode');
      process.exit(1);
    }
  }

  private runGet(key: string | undefined, profileName?: string): void {
    if (!key) {
      console.error('Key is required');
      process.exit(1);
    }
    const config = this.loadConfig();
    const target = profileName ? (config.profiles?.[profileName] ?? {}) : config;
    const val = this.getNestedValue(target, key);
    if (val !== undefined) {
      console.log(key.toLowerCase().includes('private') ? '***[HIDDEN]***' : String(val));
    } else {
      console.warn(`Configuration key '${key}' not found`);
      process.exit(1);
    }
  }

  private runUnset(key: string | undefined, profileName?: string): void {
    if (!key) {
      console.error('Key is required');
      process.exit(1);
    }
    this.unsetConfigValue(key, profileName);
    console.log(`Configuration key '${key}' removed`);
  }

  private async runReset(options: ConfigOptions): Promise<void> {
    if (!options.force) {
      const target = options.profile ? `profile '${options.profile}'` : 'entire configuration';
      const ok = await this.prompt.confirm(`Reset ${target}?`);
      if (!ok) {
        console.log('Reset cancelled');
        return;
      }
    }
    this.resetConfig(options.profile);
    console.log(options.profile ? `Profile '${options.profile}' reset` : 'Configuration reset');
  }

  private async runProfile(
    op: string | undefined,
    name: string | undefined,
    options: ConfigOptions
  ): Promise<void> {
    switch (op) {
      case 'create':
        if (!name) {
          console.error('Profile name is required');
          process.exit(1);
        }
        this.createProfile(name);
        console.log(`Profile '${name}' created`);
        break;
      case 'switch':
        if (!name) {
          console.error('Profile name is required');
          process.exit(1);
        }
        this.switchProfile(name);
        console.log(`Switched to profile '${name}'`);
        break;
      case 'delete':
        if (!name) {
          console.error('Profile name is required');
          process.exit(1);
        }
        if (!options.force) {
          const ok = await this.prompt.confirm(`Delete profile '${name}'?`);
          if (!ok) {
            console.log('Cancelled');
            return;
          }
        }
        this.deleteProfile(name);
        console.log(`Profile '${name}' deleted`);
        break;
      case 'list': {
        const config = this.loadConfig();
        if (!config.profiles || Object.keys(config.profiles).length === 0) {
          console.log('No profiles found');
          return;
        }
        console.log('📋 Available Profiles:');
        for (const n of Object.keys(config.profiles)) {
          console.log(`  • ${n}${n === config.currentProfile ? ' (active)' : ''}`);
        }
        break;
      }
      default:
        console.log('Usage: config profile <create|switch|delete|list> [name]');
    }
  }

  private async setConfigInteractive(profileName?: string): Promise<void> {
    const config = this.loadConfig();
    const target: ConfigSettings = profileName ? (config.profiles?.[profileName] ?? {}) : config;
    const envConfig = this.configService;

    const { inquirer } = await import('inquirer').then(m => ({ inquirer: m.default }));
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'defaultSourceChain',
        message: 'Default source chain:',
        default: target.defaultSourceChain,
      },
      {
        type: 'input',
        name: 'defaultDestinationChain',
        message: 'Default destination chain:',
        default: target.defaultDestinationChain,
      },
      { type: 'password', name: 'evmKey', message: 'EVM private key (optional):', mask: '*' },
      { type: 'password', name: 'tvmKey', message: 'TVM private key (optional):', mask: '*' },
      { type: 'password', name: 'svmKey', message: 'SVM private key (optional):', mask: '*' },
    ]);

    void envConfig;

    if (answers.defaultSourceChain)
      target.defaultSourceChain = answers.defaultSourceChain as string;
    if (answers.defaultDestinationChain)
      target.defaultDestinationChain = answers.defaultDestinationChain as string;
    if (!target.defaultPrivateKeys) target.defaultPrivateKeys = {};
    if (answers.evmKey) target.defaultPrivateKeys[ChainType.EVM] = answers.evmKey as string;
    if (answers.tvmKey) target.defaultPrivateKeys[ChainType.TVM] = answers.tvmKey as string;
    if (answers.svmKey) target.defaultPrivateKeys[ChainType.SVM] = answers.svmKey as string;

    if (profileName) {
      if (!config.profiles) config.profiles = {};
      config.profiles[profileName] = target;
    } else {
      Object.assign(config, target);
    }

    this.saveConfig(config);
    console.log('✅ Configuration updated');
  }

  private loadConfig(): ConfigSettings {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) as ConfigSettings;
  }

  private saveConfig(config: ConfigSettings): void {
    this.ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  }

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    if (!fs.existsSync(PROFILES_DIR)) fs.mkdirSync(PROFILES_DIR, { recursive: true });
  }

  private displayConfig(config: ConfigSettings): void {
    if (config.defaultSourceChain)
      console.log(`  Default Source Chain: ${config.defaultSourceChain}`);
    if (config.defaultDestinationChain)
      console.log(`  Default Destination Chain: ${config.defaultDestinationChain}`);
    if (config.rpcUrls) {
      for (const [chain, url] of Object.entries(config.rpcUrls)) {
        console.log(`  RPC URL (${chain}): ${url}`);
      }
    }
    if (config.defaultPrivateKeys) {
      for (const [chainType, key] of Object.entries(config.defaultPrivateKeys)) {
        if (key) console.log(`  Private Key (${chainType}): ***[SET]***`);
      }
    }
    if (
      !config.defaultSourceChain &&
      !config.defaultDestinationChain &&
      !config.rpcUrls &&
      !config.defaultPrivateKeys
    ) {
      console.log('  No configuration set');
    }
  }

  private setConfigValue(key: string, value: string, profileName?: string): void {
    const config = this.loadConfig();
    const target: ConfigSettings = profileName ? (config.profiles?.[profileName] ?? {}) : config;
    this.setNestedValue(target, key, value);
    if (profileName) {
      if (!config.profiles) config.profiles = {};
      config.profiles[profileName] = target;
    } else {
      Object.assign(config, target);
    }
    this.saveConfig(config);
    console.log(`✅ '${key}' set to '${value}'`);
  }

  private unsetConfigValue(key: string, profileName?: string): void {
    const config = this.loadConfig();
    const target: ConfigSettings = profileName ? (config.profiles?.[profileName] ?? {}) : config;
    this.deleteNestedValue(target, key);
    if (profileName) {
      if (!config.profiles) config.profiles = {};
      config.profiles[profileName] = target;
    } else {
      Object.assign(config, target);
    }
    this.saveConfig(config);
  }

  private createProfile(name: string): void {
    const config = this.loadConfig();
    if (!config.profiles) config.profiles = {};
    if (config.profiles[name]) throw new Error(`Profile '${name}' already exists`);
    config.profiles[name] = {};
    this.saveConfig(config);
  }

  private switchProfile(name: string): void {
    const config = this.loadConfig();
    if (!config.profiles?.[name]) throw new Error(`Profile '${name}' does not exist`);
    config.currentProfile = name;
    this.saveConfig(config);
  }

  private deleteProfile(name: string): void {
    const config = this.loadConfig();
    if (!config.profiles?.[name]) throw new Error(`Profile '${name}' does not exist`);
    delete config.profiles[name];
    if (config.currentProfile === name) delete config.currentProfile;
    this.saveConfig(config);
  }

  private resetConfig(profileName?: string): void {
    if (profileName) {
      const config = this.loadConfig();
      if (config.profiles?.[profileName]) {
        config.profiles[profileName] = {};
        this.saveConfig(config);
      }
    } else if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  }

  private getNestedValue(obj: ConfigSettings | Record<string, unknown>, keyPath: string): unknown {
    return keyPath.split('.').reduce((cur: unknown, k) => {
      if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
        return (cur as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj);
  }

  private setNestedValue(
    obj: ConfigSettings | Record<string, unknown>,
    keyPath: string,
    value: unknown
  ): void {
    const keys = keyPath.split('.');
    const last = keys.pop()!;
    const target = keys.reduce(
      (cur: Record<string, unknown>, k) => {
        if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
        return cur[k] as Record<string, unknown>;
      },
      obj as Record<string, unknown>
    );
    target[last] = value;
  }

  private deleteNestedValue(obj: ConfigSettings | Record<string, unknown>, keyPath: string): void {
    const keys = keyPath.split('.');
    const last = keys.pop()!;
    const target = keys.reduce((cur: unknown, k) => {
      if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
        return (cur as Record<string, unknown>)[k];
      }
      return undefined;
    }, obj as unknown);
    if (target && typeof target === 'object' && last in (target as Record<string, unknown>)) {
      delete (target as Record<string, unknown>)[last];
    }
  }

  @Option({ flags: '-i, --interactive', description: 'Interactive mode' })
  parseInteractive(): boolean {
    return true;
  }

  @Option({ flags: '--profile <name>', description: 'Target profile' })
  parseProfile(val: string): string {
    return val;
  }

  @Option({ flags: '--force', description: 'Skip confirmation' })
  parseForce(): boolean {
    return true;
  }
}
