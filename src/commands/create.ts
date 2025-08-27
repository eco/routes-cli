import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { MultiVMChainManager } from '@/services';
import { ChainConfig, TokenEntry, TokenInfo, VMType } from '@/types';
import { loggers, validateDeadlineHours, validateTokenAmount } from '@/utils';
import { loadConfig } from '@/config';

interface CreateCommandOptions {
  sourceChain?: string;
  destinationChain?: string;
  routeToken?: string;
  routeAmount?: string;
  rewardToken?: string;
  rewardAmount?: string;
  recipient?: string;
  routeDeadline?: string;
  refundDeadline?: string;
}

export async function createCommand(options: CreateCommandOptions = {}): Promise<void> {
  const logger = loggers.command;
  logger.command('create', options);

  try {
    console.log(chalk.blue.bold('\n🌉 Creating Cross-Chain Token Transfer Intent\n'));

    // Load configuration and initialize chain manager
    const config = await loadConfig();
    const privateKey = getPrivateKey();
    const chainManager = new MultiVMChainManager(config, privateKey, config.tokenRegistry);

    // Get available chains
    const availableChains = chainManager.getAvailableChains();
    if (availableChains.length === 0) {
      console.error(
        chalk.red('❌ No chains available. Please check your configuration and private key.')
      );
      return;
    }

    // Interactive flow to gather all required information
    const intentParams = await gatherIntentParameters(chainManager, availableChains, options);

    // Display summary and confirm
    await displayIntentSummary(intentParams);
    const confirmed = await confirmIntentCreation();

    if (!confirmed) {
      console.log(chalk.yellow('❌ Intent creation cancelled.'));
      return;
    }

    // Create the intent
    const spinner = ora('Preparing cross-chain intent...').start();

    try {
      // Show approval status if reward tokens are involved
      if (intentParams.rewardToken.amount > 0n) {
        spinner.text = `Checking token approvals for ${intentParams.rewardToken.symbol}...`;

        // The EVMAdapter will handle approvals internally and log progress
        // We just update the spinner text to keep user informed
        spinner.text = 'Approving tokens and creating intent...';
      }

      const intentInfo = await chainManager.createCrossVMIntent(
        intentParams.sourceChain.name,
        intentParams.destinationChain.name,
        intentParams.routeToken,
        intentParams.rewardToken,
        intentParams.recipient,
        intentParams.deadlines
      );

      spinner.succeed('Intent created successfully! ✨');

      // Display result
      await displayIntentResult(intentInfo);

      logger.intent(intentInfo.intentHash, 'created', {
        sourceChain: intentInfo.sourceChain,
        destinationChain: intentInfo.destinationChain,
        isCrossVM: intentInfo.isCrossVM,
      });
    } catch (error) {
      spinner.fail('Failed to create intent');
      throw error;
    }
  } catch (error) {
    logger.error('Intent creation failed', error);
    console.error(
      chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    );
    process.exit(1);
  }
}

async function gatherIntentParameters(
  chainManager: MultiVMChainManager,
  availableChains: ChainConfig[],
  options: CreateCommandOptions
) {
  // Step 1: Select source chain
  const sourceChain = options.sourceChain
    ? availableChains.find((c) => c.name.toLowerCase() === options.sourceChain!.toLowerCase())
    : await selectChain(availableChains, 'Select source chain (where intent is created):');

  if (!sourceChain) {
    throw new Error(`Source chain not found: ${options.sourceChain}`);
  }

  // Step 2: Select destination chain
  const destinationChainOptions = availableChains.filter((c) => c.chainId !== sourceChain.chainId);
  const destinationChain = options.destinationChain
    ? destinationChainOptions.find(
        (c) => c.name.toLowerCase() === options.destinationChain!.toLowerCase()
      )
    : await selectChain(
        destinationChainOptions,
        'Select destination chain (where tokens will be sent):'
      );

  if (!destinationChain) {
    throw new Error(`Destination chain not found: ${options.destinationChain}`);
  }

  // Step 3: Select route token (from destination chain)
  const destinationTokens = chainManager.getTokensForChain(destinationChain.name);
  if (destinationTokens.length === 0) {
    throw new Error(`No tokens available for destination chain: ${destinationChain.name}`);
  }

  const routeTokenEntry = options.routeToken
    ? findTokenBySymbolOrAddress(destinationTokens, options.routeToken)
    : await selectToken(
        destinationTokens,
        `Select token to send
                                            from ${destinationChain.name}:`
      );

  if (!routeTokenEntry) {
    throw new Error(`Route token not found: ${options.routeToken}`);
  }

  // Step 4: Enter route amount
  const routeAmountString = options.routeAmount
    ? options.routeAmount
    : await promptTokenAmount(
        `Enter amount of ${routeTokenEntry.symbol} to send:`,
        routeTokenEntry.decimals
      );

  // Create TokenInfo for route token
  const routeToken: TokenInfo = {
    address: routeTokenEntry.address,
    amount: BigInt(
      Math.floor(parseFloat(routeAmountString) * Math.pow(10, routeTokenEntry.decimals))
    ),
    decimals: routeTokenEntry.decimals,
    symbol: routeTokenEntry.symbol,
    vmType: routeTokenEntry.vmType,
    chainId: routeTokenEntry.chainId,
  };

  // Step 5: Select reward token (from source chain)
  const sourceTokens = chainManager.getTokensForChain(sourceChain.name);
  if (sourceTokens.length === 0) {
    throw new Error(`No tokens available for source chain: ${sourceChain.name}`);
  }

  const rewardTokenEntry = options.rewardToken
    ? findTokenBySymbolOrAddress(sourceTokens, options.rewardToken)
    : await selectToken(
        sourceTokens,
        `Select reward token
                                       from ${sourceChain.name}:`
      );

  if (!rewardTokenEntry) {
    throw new Error(`Reward token not found: ${options.rewardToken}`);
  }

  // Step 6: Enter reward amount
  const rewardAmountString = options.rewardAmount
    ? options.rewardAmount
    : await promptTokenAmount(
        `Enter reward amount of ${rewardTokenEntry.symbol}:`,
        rewardTokenEntry.decimals
      );

  // Create TokenInfo for reward token
  const rewardToken: TokenInfo = {
    address: rewardTokenEntry.address,
    amount: BigInt(
      Math.floor(parseFloat(rewardAmountString) * Math.pow(10, rewardTokenEntry.decimals))
    ),
    decimals: rewardTokenEntry.decimals,
    symbol: rewardTokenEntry.symbol,
    vmType: rewardTokenEntry.vmType,
    chainId: rewardTokenEntry.chainId,
  };

  // Step 7: Enter recipient address
  const recipient = options.recipient
    ? options.recipient
    : await promptRecipientAddress(destinationChain);

  // Step 8: Set deadlines
  const routeDeadlineHours = options.routeDeadline
    ? parseInt(options.routeDeadline)
    : await promptDeadline('route', 'How many hours until route expires?', 2);

  const refundDeadlineHours = options.refundDeadline
    ? parseInt(options.refundDeadline)
    : await promptDeadline(
        'refund',
        'How many hours until refund becomes available?',
        3,
        routeDeadlineHours
      );

  const deadlines = {
    route: routeDeadlineHours,
    refund: refundDeadlineHours,
  };

  return {
    sourceChain,
    destinationChain,
    routeToken,
    rewardToken,
    recipient,
    deadlines,
  };
}

async function selectChain(chains: ChainConfig[], message: string): Promise<ChainConfig> {
  const choices = chains.map((chain) => ({
    name: `${chain.name} (${chain.vmType})`,
    value: chain,
    short: chain.name,
  }));

  const { selectedChain } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedChain',
      message,
      choices,
      pageSize: 10,
    },
  ]);

  return selectedChain;
}

async function selectToken(tokens: TokenEntry[], message: string): Promise<TokenEntry> {
  // Group tokens by category
  const stablecoins = tokens.filter((t) => t.tags?.includes('stablecoin'));
  const wrapped = tokens.filter((t) => t.tags?.includes('wrapped'));
  const native = tokens.filter((t) => t.tags?.includes('native'));
  const others = tokens.filter(
    (t) =>
      !t.tags?.includes('stablecoin') && !t.tags?.includes('wrapped') && !t.tags?.includes('native')
  );

  const choices = [
    ...(stablecoins.length > 0 ? [new inquirer.Separator('--- Stablecoins ---')] : []),
    ...stablecoins.map((token) => ({
      name: `${token.symbol} - ${token.name}`,
      value: token,
      short: token.symbol,
    })),

    ...(wrapped.length > 0 ? [new inquirer.Separator('--- Wrapped Tokens ---')] : []),
    ...wrapped.map((token) => ({
      name: `${token.symbol} - ${token.name}`,
      value: token,
      short: token.symbol,
    })),

    ...(native.length > 0 ? [new inquirer.Separator('--- Native Tokens ---')] : []),
    ...native.map((token) => ({
      name: `${token.symbol} - ${token.name}`,
      value: token,
      short: token.symbol,
    })),

    ...(others.length > 0 ? [new inquirer.Separator('--- Other Tokens ---')] : []),
    ...others.map((token) => ({
      name: `${token.symbol} - ${token.name}`,
      value: token,
      short: token.symbol,
    })),
  ];

  const { selectedToken } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedToken',
      message,
      choices,
      pageSize: 15,
    },
  ]);

  return selectedToken;
}

async function promptTokenAmount(message: string, decimals: number): Promise<string> {
  const { amount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'amount',
      message,
      default: '0.01',
      validate: (input: string) => {
        const validation = validateTokenAmount(input, decimals);
        return validation.valid || validation.error!;
      },
    },
  ]);

  return amount;
}

async function promptRecipientAddress(destinationChain: ChainConfig): Promise<string> {
  const { recipient } = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipient',
      default: '0x256B70644f5D77bc8e2bb82C731Ddf747ecb1471',
      message: `Enter recipient address on ${destinationChain.name} (${destinationChain.vmType}):`,
      validate: async (input: string) => {
        const { AddressManager } = await import('../utils/AddressManager.js');
        const addressManager = new AddressManager();
        const isValid = addressManager.validateAddress(input, destinationChain.vmType);
        return isValid || `Invalid ${destinationChain.vmType} address format`;
      },
    },
  ]);

  return recipient;
}

async function promptDeadline(
  type: 'route' | 'refund',
  message: string,
  defaultHours: number,
  minHours?: number
): Promise<number> {
  const { hours } = await inquirer.prompt([
    {
      type: 'input',
      name: 'hours',
      message,
      default: defaultHours.toString(),
      validate: (input: string) => {
        const hours = parseInt(input);
        if (isNaN(hours)) {
          return 'Please enter a valid number';
        }

        if (minHours && hours < minHours) {
          return `${type} deadline must be longer than ${minHours} hours`;
        }

        const validation = validateDeadlineHours(hours, type);
        return validation.valid || validation.error!;
      },
      filter: (input: string) => parseInt(input),
    },
  ]);

  return hours;
}

async function displayIntentSummary(params: any): Promise<void> {
  console.log(chalk.cyan.bold('\n📋 Intent Summary'));
  console.log(chalk.cyan('━'.repeat(50)));

  const table = new Table({
    style: { head: ['cyan'] },
    colWidths: [25, 40],
  });

  const isCrossVM = params.sourceChain.vmType !== params.destinationChain.vmType;

  table.push(
    ['Source Chain', `${params.sourceChain.name} (${params.sourceChain.vmType})`],
    ['Destination Chain', `${params.destinationChain.name} (${params.destinationChain.vmType})`],
    ['Cross-VM Transfer', isCrossVM ? chalk.yellow('Yes') : chalk.green('No')],
    ['', ''],
    ['Route Token', `${params.routeToken.symbol} on ${params.destinationChain.name}`],
    [
      'Route Amount',
      formatTokenDisplay(
        params.routeToken.amount,
        params.routeToken.decimals,
        params.routeToken.symbol
      ),
    ],
    ['', ''],
    ['Reward Token', `${params.rewardToken.symbol} on ${params.sourceChain.name}`],
    [
      'Reward Amount',
      formatTokenDisplay(
        params.rewardToken.amount,
        params.rewardToken.decimals,
        params.rewardToken.symbol
      ),
    ],
    ['', ''],
    ['Recipient', formatAddressDisplay(params.recipient, params.destinationChain.vmType)],
    ['Route Deadline', `${params.deadlines.route} hours`],
    ['Refund Deadline', `${params.deadlines.refund} hours`]
  );

  console.log(table.toString());

  if (isCrossVM) {
    console.log(
      chalk.yellow('⚠️  This is a cross-VM transfer. Please verify all details carefully.')
    );
  }
}

async function confirmIntentCreation(): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message: 'Create this intent?',
      default: true,
    },
  ]);

  return confirmed;
}

async function displayIntentResult(intentInfo: any): Promise<void> {
  console.log(chalk.green.bold('\n✅ Intent Created Successfully!'));
  console.log(chalk.green('━'.repeat(50)));

  const table = new Table({
    style: { head: ['green'] },
    colWidths: [20, 50],
  });

  table.push(
    ['Intent Hash', intentInfo.intentHash],
    ['Vault Address', intentInfo.vaultAddress],
    ['Transaction', intentInfo.transactionHash],
    ['Status', chalk.green(intentInfo.status)],
    ['Cross-VM', intentInfo.isCrossVM ? chalk.yellow('Yes') : chalk.green('No')]
  );

  console.log(table.toString());

  console.log(chalk.blue('\n💡 Next Steps:'));
  console.log(chalk.white('1. Fund the vault with reward tokens:'));
  console.log(chalk.gray(`   eco-portal fund --hash ${intentInfo.intentHash}`));
  console.log(chalk.white('2. Check intent status:'));
  console.log(chalk.gray(`   eco-portal status --hash ${intentInfo.intentHash}`));
}

function findTokenBySymbolOrAddress(tokens: TokenEntry[], query: string): TokenEntry | undefined {
  return tokens.find(
    (token) =>
      token.symbol.toLowerCase() === query.toLowerCase() ||
      token.address.toLowerCase() === query.toLowerCase()
  );
}

function formatTokenDisplay(amount: bigint, decimals: number, symbol: string): string {
  const divisor = BigInt(10 ** decimals);
  const wholePart = amount / divisor;
  const fractionalPart = amount % divisor;

  if (fractionalPart === BigInt(0)) {
    return `${wholePart} ${symbol}`;
  }

  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
  const formatted = `${wholePart}.${fractionalStr.replace(/0+$/, '')}`;
  return `${formatted} ${symbol}`;
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
