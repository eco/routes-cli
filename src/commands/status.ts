import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { MultiVMChainManager } from '@/services';
import { loggers } from '@/utils';
import { loadConfig } from '@/config';

interface StatusCommandOptions {
  hash?: string;
  chain?: string;
  json?: boolean;
}

export async function statusCommand(options: StatusCommandOptions = {}): Promise<void> {
  const logger = loggers.command;
  logger.command('status', options);

  try {
    if (!options.hash) {
      console.error(chalk.red('❌ Intent hash is required. Use --hash flag.'));
      process.exit(1);
    }

    console.log(chalk.blue.bold('\n📊 Checking Intent Status\n'));

    // Load configuration and initialize chain manager
    const config = await loadConfig();
    const privateKey = getPrivateKey();
    const chainManager = new MultiVMChainManager(config, privateKey, config.tokenRegistry);

    // Determine which chain to check
    let targetChains: string[] = [];

    if (options.chain) {
      // Check specific chain
      const chainConfig = chainManager.getChainConfig(options.chain);
      if (!chainConfig) {
        console.error(chalk.red(`❌ Unknown chain: ${options.chain}`));
        process.exit(1);
      }
      targetChains = [options.chain];
    } else {
      // Check all available chains
      targetChains = chainManager.getAvailableChains().map((c) => c.name);
    }

    if (targetChains.length === 0) {
      console.error(chalk.red('❌ No chains available to check.'));
      process.exit(1);
    }

    // Check status across chains
    const spinner = ora('Checking intent status...').start();
    const results = await checkIntentStatusAcrossChains(chainManager, options.hash, targetChains);
    spinner.stop();

    if (options.json) {
      // JSON output
      console.log(JSON.stringify(results, null, 2));
    } else {
      // Pretty output
      await displayStatusResults(options.hash, results);
    }

    logger.intent(options.hash, 'status-checked', { results });
  } catch (error) {
    logger.error('Status check failed', error);
    console.error(
      chalk.red(`❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    );
    process.exit(1);
  }
}

async function checkIntentStatusAcrossChains(
  chainManager: MultiVMChainManager,
  intentHash: string,
  chains: string[]
): Promise<IntentStatusResult[]> {
  const results: IntentStatusResult[] = [];

  for (const chainName of chains) {
    try {
      const chainConfig = chainManager.getChainConfig(chainName);
      if (!chainConfig) {
        results.push({
          chainName,
          vmType: 'Unknown',
          available: false,
          error: 'Chain configuration not found',
        });
        continue;
      }

      // Check intent status
      const isFulfilled = await chainManager.getIntentStatus(chainName, intentHash);
      const vaultAddress = chainManager.calculateVaultAddress(chainName, intentHash);

      results.push({
        chainName,
        vmType: chainConfig.vmType,
        available: true,
        isFulfilled,
        vaultAddress,
        status: isFulfilled ? 'fulfilled' : 'pending',
      });
    } catch (error) {
      results.push({
        chainName,
        vmType: chainManager.getChainConfig(chainName)?.vmType || 'Unknown',
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

async function displayStatusResults(
  intentHash: string,
  results: IntentStatusResult[]
): Promise<void> {
  console.log(chalk.cyan.bold('🔍 Intent Status Results'));
  console.log(chalk.cyan('━'.repeat(60)));
  console.log(chalk.white(`Intent Hash: ${intentHash}\n`));

  // Create status table
  const table = new Table({
    head: ['Chain', 'VM Type', 'Status', 'Vault Address'],
    style: {
      head: ['cyan'],
      border: ['gray'],
    },
    colWidths: [15, 8, 15, 25],
  });

  let foundFulfilled = false;
  let foundPending = false;

  for (const result of results) {
    let status: string;
    let statusColor: keyof typeof chalk;

    if (!result.available) {
      status = 'Unavailable';
      statusColor = 'gray';
    } else if (result.isFulfilled) {
      status = '✅ Fulfilled';
      statusColor = 'green';
      foundFulfilled = true;
    } else {
      status = '⏳ Pending';
      statusColor = 'yellow';
      foundPending = true;
    }

    const vaultDisplay = result.vaultAddress
      ? formatAddressForDisplay(result.vaultAddress)
      : result.error || 'N/A';

    table.push([
      result.chainName,
      result.vmType,
      chalk[statusColor](status),
      result.available ? vaultDisplay : chalk.gray(result.error || 'Error'),
    ]);
  }

  console.log(table.toString());

  // Summary
  console.log(chalk.blue.bold('\n📈 Summary:'));

  if (foundFulfilled) {
    console.log(chalk.green('✅ Intent has been fulfilled on at least one chain'));
  } else if (foundPending) {
    console.log(chalk.yellow('⏳ Intent is pending fulfillment'));
  } else {
    console.log(chalk.red('❌ Intent not found or all chains unavailable'));
  }

  // Additional information
  const availableChains = results.filter((r) => r.available);
  const unavailableChains = results.filter((r) => !r.available);

  if (availableChains.length > 0) {
    console.log(chalk.white(`📡 Checked ${availableChains.length} available chain(s)`));
  }

  if (unavailableChains.length > 0) {
    console.log(chalk.gray(`⚠️  ${unavailableChains.length} chain(s) unavailable:`));
    unavailableChains.forEach((chain) => {
      console.log(chalk.gray(`   - ${chain.chainName}: ${chain.error}`));
    });
  }

  // Display detailed vault information for available chains
  const chainsWithVaults = results.filter((r) => r.available && r.vaultAddress);
  if (chainsWithVaults.length > 0) {
    console.log(chalk.blue.bold('\n🏦 Vault Information:'));
    chainsWithVaults.forEach((result) => {
      const status = result.isFulfilled ? chalk.green('Fulfilled') : chalk.yellow('Pending');
      console.log(chalk.white(`${result.chainName} (${result.vmType}): ${status}`));
      console.log(chalk.gray(`   Vault: ${result.vaultAddress}`));
    });
  }

  // Next steps
  if (foundPending && !foundFulfilled) {
    console.log(chalk.blue('\n💡 Next Steps:'));
    console.log(chalk.white('• Fund the vault with reward tokens if not already done'));
    console.log(chalk.white('• Wait for solvers to fulfill the intent'));
    console.log(chalk.white('• Check status again later'));
  }
}

function formatAddressForDisplay(address: string): string {
  if (address.length <= 20) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

interface IntentStatusResult {
  chainName: string;
  vmType: string;
  available: boolean;
  isFulfilled?: boolean;
  vaultAddress?: string;
  status?: 'fulfilled' | 'pending';
  error?: string;
}
