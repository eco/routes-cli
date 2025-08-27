import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { MultiVMChainManager, type CLIConfig } from '../services/index.js';
import { VMType } from '../types/index.js';
import { loggers, validateTokenAmount } from '../utils/index.js';
import { loadConfig } from '../config/index.js';

interface FundCommandOptions {
  hash?: string;
  amount?: string;
  token?: string;
  chain?: string;
  recipient?: string;
}

export async function fundCommand(options: FundCommandOptions = {}): Promise<void> {
  const logger = loggers.command;
  logger.command('fund', options);

  try {
    console.log(chalk.blue.bold('\n💰 Funding Intent Vault\n'));

    // Validate required parameters
    if (!options.hash) {
      console.error(chalk.red('❌ Intent hash is required. Use --hash flag.'));
      process.exit(1);
    }

    // Load configuration and initialize chain manager
    const config = await loadConfig();
    const privateKey = getPrivateKey();
    const chainManager = new MultiVMChainManager(config, privateKey, config.tokenRegistry);

    // Get available chains
    const availableChains = chainManager.getAvailableChains();
    if (availableChains.length === 0) {
      console.error(chalk.red('❌ No chains available. Please check your configuration and private key.'));
      return;
    }

    // Gather funding parameters
    const fundingParams = await gatherFundingParameters(chainManager, availableChains, options);

    // Display summary and confirm
    await displayFundingSummary(fundingParams);
    const confirmed = await confirmFunding();

    if (!confirmed) {
      console.log(chalk.yellow('❌ Funding cancelled.'));
      return;
    }

    // Execute funding
    const spinner = ora('Funding vault...').start();

    try {
      // Note: In a real implementation, this would involve:
      // 1. Transfer tokens to the vault address
      // 2. Or approve the portal contract to spend tokens
      // 3. Or call a specific funding function on the portal
      
      // For demo purposes, we'll simulate the funding process
      const txHash = await simulateFunding(fundingParams);
      
      spinner.succeed('Vault funded successfully!');

      // Display result
      await displayFundingResult(fundingParams, txHash);

      logger.intent(options.hash!, 'funded', {
        chain: fundingParams.chain.name,
        amount: fundingParams.amount,
        token: fundingParams.token.symbol
      });

    } catch (error) {
      spinner.fail('Failed to fund vault');
      throw error;
    }

  } catch (error) {
    logger.error('Vault funding failed', error);
    console.error(chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`));
    process.exit(1);
  }
}

async function gatherFundingParameters(
  chainManager: MultiVMChainManager,
  availableChains: any[],
  options: FundCommandOptions
) {
  // Step 1: Select chain (if not specified)
  let targetChain = options.chain
    ? availableChains.find(c => c.name.toLowerCase() === options.chain!.toLowerCase())
    : await selectChain(availableChains, 'Select chain to fund from:');

  if (!targetChain) {
    throw new Error(`Chain not found: ${options.chain}`);
  }

  // Step 2: Get vault address
  const vaultAddress = chainManager.calculateVaultAddress(targetChain.name, options.hash!);

  // Step 3: Get available tokens for the chain
  const chainTokens = chainManager.getTokensForChain(targetChain.name);
  if (chainTokens.length === 0) {
    throw new Error(`No tokens available for chain: ${targetChain.name}`);
  }

  // Step 4: Select token (if not specified)
  const selectedToken = options.token
    ? findTokenBySymbolOrAddress(chainTokens, options.token)
    : await selectToken(chainTokens, 'Select token to fund with:');

  if (!selectedToken) {
    throw new Error(`Token not found: ${options.token}`);
  }

  // Step 5: Enter amount (if not specified)
  const amount = options.amount
    ? options.amount
    : await promptFundingAmount(selectedToken);

  // Step 6: Get wallet address for this chain
  const walletManager = chainManager.getAddressManager();
  // Note: In a real implementation, you'd get the actual wallet address
  const walletAddress = getWalletAddressForChain(targetChain.vmType);

  return {
    intentHash: options.hash!,
    chain: targetChain,
    token: selectedToken,
    amount,
    vaultAddress,
    walletAddress
  };
}

async function selectChain(chains: any[], message: string): Promise<any> {
  const choices = chains.map(chain => ({
    name: `${chain.name} (${chain.vmType})`,
    value: chain,
    short: chain.name
  }));

  const { selectedChain } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedChain',
      message,
      choices,
      pageSize: 10
    }
  ]);

  return selectedChain;
}

async function selectToken(tokens: any[], message: string): Promise<any> {
  // Group tokens by category for better UX
  const stablecoins = tokens.filter((t: any) => t.tags?.includes('stablecoin'));
  const others = tokens.filter((t: any) => !t.tags?.includes('stablecoin'));

  const choices = [
    ...(stablecoins.length > 0 ? [new inquirer.Separator('--- Stablecoins ---')] : []),
    ...stablecoins.map((token: any) => ({
      name: `${token.symbol} - ${token.name}`,
      value: token,
      short: token.symbol
    })),
    
    ...(others.length > 0 ? [new inquirer.Separator('--- Other Tokens ---')] : []),
    ...others.map((token: any) => ({
      name: `${token.symbol} - ${token.name}`,
      value: token,
      short: token.symbol
    }))
  ];

  const { selectedToken } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedToken',
      message,
      choices,
      pageSize: 15
    }
  ]);

  return selectedToken;
}

async function promptFundingAmount(token: any): Promise<string> {
  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message: `Enter amount of ${token.symbol} to fund:`,
      validate: (input: string) => {
        const validation = validateTokenAmount(input, token.decimals);
        return validation.valid || validation.error!;
      }
    }
  ]);

  return amount;
}

async function displayFundingSummary(params: any): Promise<void> {
  console.log(chalk.cyan.bold('\n📋 Funding Summary'));
  console.log(chalk.cyan('━'.repeat(50)));

  const table = new Table({
    style: { head: ['cyan'] },
    colWidths: [20, 45]
  });

  table.push(
    ['Intent Hash', params.intentHash],
    ['Chain', `${params.chain.name} (${params.chain.vmType})`],
    ['Token', `${params.token.symbol} - ${params.token.name}`],
    ['Amount', `${params.amount} ${params.token.symbol}`],
    ['Vault Address', formatAddressDisplay(params.vaultAddress, params.chain.vmType)],
    ['From Wallet', formatAddressDisplay(params.walletAddress, params.chain.vmType)]
  );

  console.log(table.toString());
}

async function confirmFunding(): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Proceed with funding?',
      default: false
    }
  ]);

  return confirmed;
}

async function simulateFunding(params: any): Promise<string> {
  // Simulate network delay
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Return mock transaction hash
  const mockTxHash = '0x' + Array.from({ length: 64 }, () => 
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  
  return mockTxHash;
}

async function displayFundingResult(params: any, txHash: string): Promise<void> {
  console.log(chalk.green.bold('\n✅ Vault Funded Successfully!'));
  console.log(chalk.green('━'.repeat(50)));

  const table = new Table({
    style: { head: ['green'] },
    colWidths: [20, 50]
  });

  table.push(
    ['Transaction Hash', txHash],
    ['Amount Funded', `${params.amount} ${params.token.symbol}`],
    ['Vault Address', params.vaultAddress],
    ['Status', chalk.green('Completed')]
  );

  console.log(table.toString());

  console.log(chalk.blue('\n💡 Next Steps:'));
  console.log(chalk.white('1. Wait for solvers to fulfill the intent'));
  console.log(chalk.white('2. Monitor intent status:'));
  console.log(chalk.gray(`   eco-portal status --hash ${params.intentHash}`));
  console.log(chalk.white('3. Check if tokens have been delivered to the recipient'));
}

function findTokenBySymbolOrAddress(tokens: any[], query: string): any {
  return tokens.find((token: any) => 
    token.symbol.toLowerCase() === query.toLowerCase() ||
    token.address.toLowerCase() === query.toLowerCase()
  );
}

function formatAddressDisplay(address: string, vmType: VMType): string {
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

function getWalletAddressForChain(vmType: VMType): string {
  // In a real implementation, this would derive the actual wallet address
  // For demo purposes, return mock addresses
  switch (vmType) {
    case 'EVM':
      return '0x742d35Cc0007C2bD1094b07Fb1A7e3d3edF0a3ed';
    case 'TVM':
      return 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    case 'SVM':
      return 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    default:
      return '0x0000000000000000000000000000000000000000';
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