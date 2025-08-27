import chalk from 'chalk';
import Table from 'cli-table3';
import ora from 'ora';
import { MultiVMChainManager } from '@/services';
import { VMType } from '@/types';
import { loggers } from '@/utils';
import { loadConfig } from '@/config';

interface ListChainsOptions {
  vm?: VMType;
  available?: boolean;
  health?: boolean;
  json?: boolean;
}

export async function listChainsCommand(options: ListChainsOptions = {}): Promise<void> {
  const logger = loggers.command;
  logger.command('list-chains', options);

  try {
    console.log(chalk.blue.bold('\n⛓️  Supported Chains\n'));

    // Load configuration and initialize chain manager
    const config = await loadConfig();
    const privateKey = getPrivateKey();
    const chainManager = new MultiVMChainManager(config, privateKey, config.tokenRegistry);

    let chains = chainManager.getSupportedChains();

    // Apply VM filter
    if (options.vm) {
      chains = chains.filter((chain) => chain.vmType === options.vm);
      console.log(chalk.cyan(`${options.vm} chains:`));
    } else {
      console.log(chalk.cyan('All supported chains:'));
    }

    // Apply availability filter
    if (options.available) {
      const availableChains = chainManager.getAvailableChains();
      chains = chains.filter((chain) =>
        availableChains.some((available) => available.chainId === chain.chainId)
      );
    }

    if (chains.length === 0) {
      console.log(chalk.yellow('No chains found matching the criteria.'));
      return;
    }

    // Get health information if requested
    let healthResults: any[] = [];
    if (options.health) {
      const spinner = ora('Checking chain health...').start();
      healthResults = await Promise.all(
        chains.map(async (chain) => ({
          chainId: chain.chainId,
          health: true,
        }))
      );
      spinner.stop();
    }

    if (options.json) {
      // JSON output
      const output = await prepareJsonOutput(chains, chainManager, healthResults);
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    // Pretty output
    await displayChains(chains, chainManager, healthResults, options);

    logger.info('Listed chains', {
      count: chains.length,
      filters: options,
    });
  } catch (error) {
    logger.error('List chains failed', error);
    console.error(
      chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    );
    process.exit(1);
  }
}

async function displayChains(
  chains: any[],
  chainManager: MultiVMChainManager,
  healthResults: any[],
  options: ListChainsOptions
): Promise<void> {
  if (!options.vm) {
    // Group by VM type
    await displayChainsByVM(chains, chainManager, healthResults, options);
  } else {
    // Display as table for single VM
    await displayChainTable(chains, chainManager, healthResults, options);
  }
}

async function displayChainsByVM(
  chains: any[],
  chainManager: MultiVMChainManager,
  healthResults: any[],
  options: ListChainsOptions
): Promise<void> {
  const evmChains = chains.filter((c) => c.vmType === 'EVM');
  const tvmChains = chains.filter((c) => c.vmType === 'TVM');
  const svmChains = chains.filter((c) => c.vmType === 'SVM');

  if (evmChains.length > 0) {
    console.log(chalk.green.bold('\n🔷 EVM Chains'));
    console.log(chalk.green('━'.repeat(50)));
    await displayVMChainList(evmChains, chainManager, healthResults, options);
  }

  if (tvmChains.length > 0) {
    console.log(chalk.red.bold('\n🔺 TVM Chains'));
    console.log(chalk.red('━'.repeat(50)));
    await displayVMChainList(tvmChains, chainManager, healthResults, options);
  }

  if (svmChains.length > 0) {
    console.log(chalk.magenta.bold('\n🟣 SVM Chains'));
    console.log(chalk.magenta('━'.repeat(50)));
    await displayVMChainList(svmChains, chainManager, healthResults, options);
  }
}

async function displayVMChainList(
  chains: any[],
  chainManager: MultiVMChainManager,
  healthResults: any[],
  _options: ListChainsOptions
): Promise<void> {
  for (const chain of chains) {
    const tokenCount = chainManager.getTokensForChain(chain.name).length;
    const health = healthResults.find((h) => h.chainId === chain.chainId)?.health;

    // Chain name and basic info
    const statusIcon = health?.available ? chalk.green('●') : chalk.red('●');
    const availabilityText = health
      ? health.available
        ? chalk.green('Available')
        : chalk.red('Unavailable')
      : '';

    console.log(`  ${statusIcon} ${chalk.white.bold(chain.name)}`);
    console.log(chalk.gray(`    Chain ID: ${chain.chainId}`));
    console.log(chalk.gray(`    RPC: ${formatUrl(chain.rpcUrl)}`));
    console.log(chalk.gray(`    Portal: ${formatAddress(chain.portalAddress, chain.vmType)}`));
    console.log(chalk.gray(`    Tokens: ${tokenCount}`));
    console.log(chalk.gray(`    Native: ${chain.nativeCurrency.symbol}`));

    if (health) {
      console.log(chalk.gray(`    Status: ${availabilityText}`));
      if (health.error) {
        console.log(chalk.gray(`    Error: ${health.error}`));
      }
    }

    if (chain.blockExplorer) {
      console.log(chalk.gray(`    Explorer: ${formatUrl(chain.blockExplorer)}`));
    }

    console.log(); // Empty line for spacing
  }
}

async function displayChainTable(
  chains: any[],
  chainManager: MultiVMChainManager,
  healthResults: any[],
  options: ListChainsOptions
): Promise<void> {
  const headers = ['Name', 'Chain ID', 'Native Currency', 'Tokens'];
  const colWidths = [15, 12, 15, 8];

  if (options.health) {
    headers.push('Status');
    colWidths.push(12);
  }

  const table = new Table({
    head: headers,
    style: { head: ['cyan'] },
    colWidths,
  });

  chains.forEach((chain) => {
    const tokenCount = chainManager.getTokensForChain(chain.name).length;
    const health = healthResults.find((h) => h.chainId === chain.chainId)?.health;

    const row = [
      chain.name,
      chain.chainId.toString(),
      chain.nativeCurrency.symbol,
      tokenCount.toString(),
    ];

    if (options.health) {
      const status = health?.available ? chalk.green('Available') : chalk.red('Unavailable');
      row.push(status);
    }

    table.push(row);
  });

  console.log(table.toString());

  // Show detailed info for each chain
  console.log(chalk.blue.bold('\n📋 Chain Details:'));
  console.log(chalk.blue('━'.repeat(30)));

  chains.forEach((chain) => {
    console.log(chalk.white.bold(`\n${chain.name}:`));
    console.log(chalk.gray(`  RPC URL: ${chain.rpcUrl}`));
    console.log(chalk.gray(`  Portal Address: ${chain.portalAddress}`));
    if (chain.blockExplorer) {
      console.log(chalk.gray(`  Block Explorer: ${chain.blockExplorer}`));
    }
  });
}

async function prepareJsonOutput(
  chains: any[],
  chainManager: MultiVMChainManager,
  healthResults: any[]
): Promise<any> {
  return chains.map((chain) => {
    const tokenCount = chainManager.getTokensForChain(chain.name).length;
    const health = healthResults.find((h) => h.chainId === chain.chainId)?.health;

    return {
      name: chain.name,
      chainId: chain.chainId,
      vmType: chain.vmType,
      rpcUrl: chain.rpcUrl,
      portalAddress: chain.portalAddress,
      blockExplorer: chain.blockExplorer,
      nativeCurrency: chain.nativeCurrency,
      tokenCount,
      vmConfig: chain.vmConfig,
      health: health
        ? {
            available: health.available,
            error: health.error,
          }
        : undefined,
    };
  });
}

function formatAddress(address: string, vmType: VMType): string {
  if (address.length <= 20) return address;

  switch (vmType) {
    case 'EVM':
      return `${address.slice(0, 6)}...${address.slice(-4)}`;
    case 'TVM':
    case 'SVM':
      return `${address.slice(0, 4)}...${address.slice(-4)}`;
    default:
      return `${address.slice(0, 8)}...${address.slice(-4)}`;
  }
}

function formatUrl(url: string): string {
  if (url.length <= 40) return url;

  try {
    const urlObj = new URL(url);
    return urlObj.hostname + (urlObj.pathname !== '/' ? '...' : '');
  } catch {
    return url.length > 40 ? `${url.slice(0, 37)}...` : url;
  }
}

function getPrivateKey(): string {
  const privateKey =
    process.env.PRIVATE_KEY ||
    process.env.EVM_PRIVATE_KEY ||
    process.env.TVM_PRIVATE_KEY ||
    process.env.SVM_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error('Private key required. Set PRIVATE_KEY environment variable.');
  }

  return privateKey;
}
