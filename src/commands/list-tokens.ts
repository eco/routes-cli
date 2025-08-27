import chalk from 'chalk';
import Table from 'cli-table3';
import { MultiVMChainManager, type CLIConfig } from '../services/index.js';
import { TokenEntry, VMType } from '../types/index.js';
import { loggers } from '../utils/index.js';
import { loadConfig } from '../config/index.js';

interface ListTokensOptions {
  chain?: string;
  vm?: VMType;
  symbol?: string;
  verified?: boolean;
  json?: boolean;
}

export async function listTokensCommand(options: ListTokensOptions = {}): Promise<void> {
  const logger = loggers.command;
  logger.command('list-tokens', options);

  try {
    console.log(chalk.blue.bold('\n🪙 Token Registry\n'));

    // Load configuration and initialize chain manager
    const config = await loadConfig();
    const privateKey = getPrivateKey();
    const chainManager = new MultiVMChainManager(config, privateKey, config.tokenRegistry);
    const tokenRegistry = chainManager.getTokenRegistry();

    let tokens: TokenEntry[] = [];

    // Apply filters based on options
    if (options.chain) {
      // Get tokens for specific chain
      const chainConfig = chainManager.getChainConfig(options.chain);
      if (!chainConfig) {
        console.error(chalk.red(`❌ Unknown chain: ${options.chain}`));
        process.exit(1);
      }
      tokens = tokenRegistry.getTokensByChain(chainConfig.chainId);
      console.log(chalk.cyan(`Tokens on ${chainConfig.name} (${chainConfig.vmType}):`));
    } else if (options.vm) {
      // Get tokens for specific VM type
      tokens = tokenRegistry.getTokensByVM(options.vm);
      console.log(chalk.cyan(`Tokens on ${options.vm} chains:`));
    } else if (options.symbol) {
      // Get tokens by symbol
      tokens = tokenRegistry.getTokensBySymbol(options.symbol);
      console.log(chalk.cyan(`${options.symbol} tokens across all chains:`));
    } else {
      // Get all tokens
      tokens = tokenRegistry.getRegistryInfo().tokenCount > 0 
        ? tokenRegistry.getTokensByVM('EVM').concat(
            tokenRegistry.getTokensByVM('TVM'),
            tokenRegistry.getTokensByVM('SVM')
          )
        : [];
      console.log(chalk.cyan('All registered tokens:'));
    }

    // Apply verified filter
    if (options.verified !== undefined) {
      tokens = tokens.filter(token => token.verified === options.verified);
    }

    if (tokens.length === 0) {
      console.log(chalk.yellow('No tokens found matching the criteria.'));
      return;
    }

    if (options.json) {
      // JSON output
      console.log(JSON.stringify(tokens, null, 2));
      return;
    }

    // Pretty output
    await displayTokens(tokens, options);

    // Display summary
    displaySummary(tokens, tokenRegistry);

    logger.info('Listed tokens', { 
      count: tokens.length,
      filters: options 
    });

  } catch (error) {
    logger.error('List tokens failed', error);
    console.error(chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

async function displayTokens(tokens: TokenEntry[], options: ListTokensOptions): Promise<void> {
  // Group tokens by category if showing all tokens
  if (!options.chain && !options.vm && !options.symbol) {
    await displayTokensByCategory(tokens);
  } else {
    await displayTokenTable(tokens, options.chain ? 'detailed' : 'standard');
  }
}

async function displayTokensByCategory(tokens: TokenEntry[]): Promise<void> {
  // Group by VM type first, then by category
  const evmTokens = tokens.filter(t => t.vmType === 'EVM');
  const tvmTokens = tokens.filter(t => t.vmType === 'TVM');
  const svmTokens = tokens.filter(t => t.vmType === 'SVM');

  if (evmTokens.length > 0) {
    console.log(chalk.green.bold('\n🔷 EVM Chains'));
    console.log(chalk.green('━'.repeat(50)));
    await displayVMTokens(evmTokens);
  }

  if (tvmTokens.length > 0) {
    console.log(chalk.red.bold('\n🔺 TVM Chains'));
    console.log(chalk.red('━'.repeat(50)));
    await displayVMTokens(tvmTokens);
  }

  if (svmTokens.length > 0) {
    console.log(chalk.magenta.bold('\n🟣 SVM Chains'));
    console.log(chalk.magenta('━'.repeat(50)));
    await displayVMTokens(svmTokens);
  }
}

async function displayVMTokens(tokens: TokenEntry[]): Promise<void> {
  // Group by chain
  const tokensByChain = tokens.reduce((acc, token) => {
    const key = `${token.chainName}-${token.chainId}`;
    if (!acc[key]) {
      acc[key] = {
        chainName: token.chainName,
        chainId: token.chainId,
        vmType: token.vmType,
        tokens: []
      };
    }
    acc[key].tokens.push(token);
    return acc;
  }, {} as Record<string, { chainName: string; chainId: string | number; vmType: VMType; tokens: TokenEntry[] }>);

  for (const [, chainInfo] of Object.entries(tokensByChain)) {
    console.log(chalk.white.bold(`\n  ${chainInfo.chainName}`));
    
    // Group tokens by category
    const categorizedTokens = categorizeTokens(chainInfo.tokens);
    
    if (categorizedTokens.stablecoins.length > 0) {
      console.log(chalk.cyan('    Stablecoins:'));
      categorizedTokens.stablecoins.forEach(token => {
        const verified = token.verified ? chalk.green('✓') : chalk.gray('◦');
        console.log(`      ${verified} ${chalk.white(token.symbol)} - ${token.name}`);
        console.log(chalk.gray(`        ${formatAddress(token.address, token.vmType)}`));
      });
    }

    if (categorizedTokens.wrapped.length > 0) {
      console.log(chalk.yellow('    Wrapped Tokens:'));
      categorizedTokens.wrapped.forEach(token => {
        const verified = token.verified ? chalk.green('✓') : chalk.gray('◦');
        console.log(`      ${verified} ${chalk.white(token.symbol)} - ${token.name}`);
        console.log(chalk.gray(`        ${formatAddress(token.address, token.vmType)}`));
      });
    }

    if (categorizedTokens.native.length > 0) {
      console.log(chalk.blue('    Native Tokens:'));
      categorizedTokens.native.forEach(token => {
        const verified = token.verified ? chalk.green('✓') : chalk.gray('◦');
        console.log(`      ${verified} ${chalk.white(token.symbol)} - ${token.name}`);
        console.log(chalk.gray(`        ${formatAddress(token.address, token.vmType)}`));
      });
    }

    if (categorizedTokens.others.length > 0) {
      console.log(chalk.white('    Other Tokens:'));
      categorizedTokens.others.forEach(token => {
        const verified = token.verified ? chalk.green('✓') : chalk.gray('◦');
        console.log(`      ${verified} ${chalk.white(token.symbol)} - ${token.name}`);
        console.log(chalk.gray(`        ${formatAddress(token.address, token.vmType)}`));
      });
    }
  }
}

async function displayTokenTable(tokens: TokenEntry[], style: 'standard' | 'detailed' = 'standard'): Promise<void> {
  if (style === 'detailed') {
    // Detailed view for single chain
    const table = new Table({
      head: ['Symbol', 'Name', 'Address', 'Decimals', 'Verified'],
      style: { head: ['cyan'] },
      colWidths: [8, 25, 25, 10, 10]
    });

    tokens.forEach(token => {
      table.push([
        token.symbol,
        token.name,
        formatAddress(token.address, token.vmType),
        token.decimals.toString(),
        token.verified ? chalk.green('✓') : chalk.gray('◦')
      ]);
    });

    console.log(table.toString());
  } else {
    // Standard view for multiple chains
    const table = new Table({
      head: ['Symbol', 'Name', 'Chain', 'VM', 'Verified'],
      style: { head: ['cyan'] },
      colWidths: [8, 25, 15, 6, 10]
    });

    tokens.forEach(token => {
      table.push([
        token.symbol,
        token.name,
        token.chainName,
        token.vmType,
        token.verified ? chalk.green('✓') : chalk.gray('◦')
      ]);
    });

    console.log(table.toString());
  }
}

function categorizeTokens(tokens: TokenEntry[]) {
  return {
    stablecoins: tokens.filter(t => t.tags?.includes('stablecoin')),
    wrapped: tokens.filter(t => t.tags?.includes('wrapped')),
    native: tokens.filter(t => t.tags?.includes('native')),
    others: tokens.filter(t => 
      !t.tags?.includes('stablecoin') && 
      !t.tags?.includes('wrapped') && 
      !t.tags?.includes('native')
    )
  };
}

function displaySummary(tokens: TokenEntry[], tokenRegistry: any): Promise<void> {
  const registryInfo = tokenRegistry.getRegistryInfo();
  
  console.log(chalk.blue.bold('\n📊 Registry Summary:'));
  console.log(chalk.blue('━'.repeat(30)));
  
  const summary = new Table({
    style: { head: ['blue'] },
    colWidths: [20, 15]
  });

  // Count by VM type
  const evmCount = tokens.filter(t => t.vmType === 'EVM').length;
  const tvmCount = tokens.filter(t => t.vmType === 'TVM').length;
  const svmCount = tokens.filter(t => t.vmType === 'SVM').length;
  
  // Count unique chains
  const uniqueChains = new Set(tokens.map(t => t.chainId)).size;
  
  // Count verified tokens
  const verifiedCount = tokens.filter(t => t.verified).length;

  summary.push(
    ['Total Tokens', tokens.length.toString()],
    ['EVM Tokens', evmCount.toString()],
    ['TVM Tokens', tvmCount.toString()],
    ['SVM Tokens', svmCount.toString()],
    ['Unique Chains', uniqueChains.toString()],
    ['Verified', verifiedCount.toString()],
    ['Registry Version', registryInfo.version]
  );

  console.log(summary.toString());

  return Promise.resolve();
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

function getPrivateKey(): string {
  const privateKey = process.env.PRIVATE_KEY || 
                   process.env.EVM_PRIVATE_KEY || 
                   process.env.TVM_PRIVATE_KEY || 
                   process.env.SVM_PRIVATE_KEY;
  
  if (!privateKey) {
    throw new Error('Private key required. Set PRIVATE_KEY environment variable.');
  }
  
  return privateKey;
}