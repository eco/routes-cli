/**
 * Publish Command
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import { logger } from '@/utils/logger';
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  Hex,
  isAddress as isViemAddress,
  parseUnits,
} from 'viem';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { BasePublisher } from '@/blockchain/base-publisher';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { TvmPublisher } from '@/blockchain/tvm-publisher';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { ChainConfig, getChainById, getChainByName, listChains } from '@/config/chains';
import { getTokenAddress, getTokenBySymbol, listTokens } from '@/config/tokens';
import { loadEnvConfig } from '@/config/env';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { IntentBuilder } from '@/builders/intent-builder';
import { privateKeyToAccount } from 'viem/accounts';
import { TronWeb } from 'tronweb';
import { Keypair, PublicKey } from '@solana/web3.js';
import { getQuote } from '@/core/utils/quote';

export function createPublishCommand(): Command {
  const command = new Command('publish');

  command
    .description('Publish an intent to the blockchain')
    .option('-s, --source <chain>', 'Source chain (name or ID)')
    .option('-d, --destination <chain>', 'Destination chain (name or ID)')
    .option('-k, --private-key <key>', 'Private key (overrides env)')
    .option('-r, --rpc <url>', 'RPC URL (overrides env)')
    .option('--dry-run', 'Validate without publishing')
    .action(async options => {
      try {
        // Interactive mode
        logger.title('🎨 Interactive Intent Publishing');

        const { intent, sourceChain, destChain } = await buildIntentInteractively(options);

        const privateKey = getPrivateKey(sourceChain);

        // Determine RPC URL
        const rpcUrl = options.rpc || sourceChain.rpcUrl;

        // Create publisher based on source chain type
        let publisher: BasePublisher;
        switch (sourceChain.type) {
          case ChainType.EVM:
            publisher = new EvmPublisher(rpcUrl);
            break;
          case ChainType.TVM:
            publisher = new TvmPublisher(rpcUrl);
            break;
          case ChainType.SVM:
            publisher = new SvmPublisher(rpcUrl);
            break;
          default:
            throw new Error(`Unsupported chain type: ${sourceChain.type}`);
        }

        // Get sender address
        let senderAddress: string;
        switch (sourceChain.type) {
          case ChainType.EVM:
            const account = privateKeyToAccount(privateKey as any);
            senderAddress = account.address;
            break;
          case ChainType.TVM:
            const tronAddress = TronWeb.address.fromPrivateKey(privateKey);
            if (!tronAddress) {
              throw new Error('Invalid Tron private key');
            }
            senderAddress = tronAddress;
            break;
          case ChainType.SVM:
            // Parse Solana private key (simplified)
            let keypair: Keypair;
            if (privateKey.startsWith('[')) {
              const bytes = JSON.parse(privateKey);
              keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
            } else {
              const bs58 = require('bs58') as any;
              const bytes = bs58.decode(privateKey);
              keypair = Keypair.fromSecretKey(bytes);
            }
            senderAddress = keypair.publicKey.toBase58();
            break;
          default:
            throw new Error('Unknown chain type');
        }

        logger.log(`Sender: ${senderAddress}`);
        logger.log(`Source: ${sourceChain.name} (${sourceChain.id})`);
        logger.log(`Destination: ${destChain.name} (${destChain.id})`);

        // Validate
        const validationSpinner = logger.spinner('Validating intent configuration...');
        const validation = await publisher.validate(intent, senderAddress);
        if (!validation.valid) {
          logger.fail(`Validation failed: ${validation.error}`);
          throw new Error(`Validation failed: ${validation.error}`);
        }
        logger.succeed('Validation passed');

        if (options.dryRun) {
          logger.warning('Dry run - not publishing');
          return;
        }

        // Publish
        const publishSpinner = logger.spinner('Publishing intent to blockchain...');
        const result = await publisher.publish(intent, privateKey);

        if (result.success) {
          logger.displayTransactionResult(result);
        } else {
          logger.fail('Publishing failed');
          throw new Error(result.error || 'Publishing failed');
        }
      } catch (error: any) {
        logger.error(`Error: ${error.message}`);
        if (process.env.DEBUG) {
          logger.error(`Stack: ${error.stack}`);
        }
        process.exit(1);
      }
    });

  return command;
}

/**
 * Build intent interactively
 */
async function buildIntentInteractively(options: any): Promise<{
  intent: Intent;
  sourceChain: ChainConfig;
  destChain: ChainConfig;
}> {
  const chains = listChains();

  // 1. Get source chain
  let sourceChain: ChainConfig | undefined;
  if (options.source) {
    sourceChain = getChainByName(options.source) || getChainById(BigInt(options.source));
    if (!sourceChain) {
      throw new Error(`Unknown source chain: ${options.source}`);
    }
  } else {
    const { source: sourceId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'source',
        message: 'Select source chain:',
        choices: chains.map(c => ({
          name: `${c.name} (${c.id})`,
          value: c.id,
        })),
      },
    ]);

    sourceChain = getChainById(BigInt(sourceId))!;
  }

  // 2. Get destination chain
  let destChain: ChainConfig | undefined;
  if (options.destination) {
    destChain = getChainByName(options.destination) || getChainById(BigInt(options.destination));
    if (!destChain) {
      throw new Error(`Unknown destination chain: ${options.destination}`);
    }
  } else {
    const { destination: destinationId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'destination',
        message: 'Select destination chain:',
        choices: chains
          .filter(c => c.id !== sourceChain!.id)
          .map(c => ({ name: `${c.name} (${c.id})`, value: c.id })),
      },
    ]);
    destChain = getChainById(destinationId)!;
  }

  // 4. Get prover from chain config
  if (!sourceChain.proverAddress) {
    throw new Error(`No prover configured for ${sourceChain.name}`);
  }

  // 5. Get portal from destination chain config
  if (!destChain.portalAddress) {
    throw new Error(`No portal configured for ${destChain.name}`);
  }

  // 6. Prompt for reward configuration
  logger.section('💰 Reward Configuration (Source Chain)');

  const rewardToken = await selectToken(sourceChain, 'reward');

  const { rewardAmountStr } = await inquirer.prompt([
    {
      type: 'input',
      name: 'rewardAmountStr',
      default: '0.1',
      message: `Enter reward amount${rewardToken.symbol ? ` (${rewardToken.symbol})` : ''} in human-readable format (e.g., "10" for 10 tokens):`,
      validate: input => {
        try {
          const num = parseFloat(input);
          if (isNaN(num) || num <= 0) {
            return 'Please enter a positive number';
          }
          return true;
        } catch {
          return 'Invalid amount';
        }
      },
    },
  ]);

  // Convert human-readable amount to token units using parseUnits
  const rewardAmount = parseUnits(rewardAmountStr, rewardToken.decimals);

  // 7. Prompt for route configuration
  logger.section('📏 Route Configuration (Destination Chain)');

  const routeToken = await selectToken(destChain, 'route');

  // 7. Prompt for recipient address
  logger.section('👤 Recipient Configuration');

  let defaultRecipient: string | undefined;
  try {
    defaultRecipient = getWalletAddr(destChain, options);
  } catch (e) {
    // Ignore default recipient
  }

  const { recipientAddress } = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipientAddress',
      message: `Enter recipient address on ${destChain.name} (${destChain.type} chain):`,
      default: defaultRecipient,
      validate: input => {
        if (!input || input.trim() === '') {
          return 'Recipient address is required';
        }

        try {
          // Validate the address format based on destination chain type
          switch (destChain.type) {
            case ChainType.EVM:
              if (!isViemAddress(input)) {
                return `Invalid EVM address format. Expected format: 0x... (40 hex characters after 0x)`;
              }
              break;
            case ChainType.TVM:
              if (!TronWeb.isAddress(input)) {
                return `Invalid Tron address format. Expected format: T... (base58) or 41... (hex)`;
              }
              break;
            case ChainType.SVM:
              try {
                new PublicKey(input);
              } catch {
                return `Invalid Solana address format. Expected format: base58 encoded public key`;
              }
              break;
            default:
              return `Unsupported destination chain type: ${destChain.type}`;
          }

          // Try to normalize the address to ensure it's fully valid
          AddressNormalizer.normalize(input, destChain.type);
          return true;
        } catch (error: any) {
          return `Invalid address: ${error.message}`;
        }
      },
    },
  ]);

  // 3. Get wallet address (creator) from private key
  const creatorAddress = AddressNormalizer.normalize(
    getWalletAddr(sourceChain, options),
    sourceChain.type
  );

  // Normalize the recipient address
  const normalizedRecipient = AddressNormalizer.normalize(recipientAddress, destChain.type);

  // 8. Get quote
  let routeAmount: bigint;
  try {
    logger.spinner('Getting quote...');

    const quote = await getQuote({
      source: sourceChain.id,
      destination: destChain.id,
      funder: AddressNormalizer.denormalize(creatorAddress, sourceChain.type),
      recipient: recipientAddress,
      amount: rewardAmount,
      routeToken: routeToken.address,
      rewardToken: rewardToken.address,
    });
    routeAmount = BigInt(quote.quoteResponse.destinationAmount);

    logger.succeed('Quote fetched');
  } catch (error) {
    logger.fail('Quote failed. Enter amount manually');

    const { routeAmountStr } = await inquirer.prompt([
      {
        type: 'input',
        name: 'routeAmountStr',
        message: `Enter route amount${routeToken.symbol ? ` (${routeToken.symbol})` : ''} in human-readable format (e.g., "100" for 100 tokens):`,
        default: '0.07',
        validate: input => {
          try {
            const num = parseFloat(input);
            if (isNaN(num) || num <= 0) {
              return 'Please enter a positive number';
            }
            return true;
          } catch {
            return 'Invalid amount';
          }
        },
      },
    ]);

    // Convert human-readable amount to token units using parseUnits
    routeAmount = parseUnits(routeAmountStr, routeToken.decimals);
  }

  // 9. Set fixed deadlines
  const now = Math.floor(Date.now() / 1000);
  const routeDeadline = BigInt(now + 2 * 60 * 60); // 2 hours
  const rewardDeadline = routeDeadline; // Same as route
  // const rewardDeadline = BigInt(now + 3 * 60 * 60); // 3 hours

  // 10. Build intent
  const builder = new IntentBuilder()
    .setSourceChain(sourceChain.id)
    .setDestinationChain(destChain.id)
    .setPortal(destChain.portalAddress)
    .setCreator(creatorAddress)
    .setProver(sourceChain.proverAddress)
    .setRouteDeadline(routeDeadline)
    .setRewardDeadline(rewardDeadline);

  builder.addRouteToken(
    AddressNormalizer.normalize(routeToken.address, destChain.type),
    routeAmount
  );

  builder.addRewardToken(
    AddressNormalizer.normalize(rewardToken.address, sourceChain.type),
    rewardAmount
  );

  builder.addCall(
    AddressNormalizer.normalize(routeToken.address, destChain.type),
    encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [AddressNormalizer.denormalizeToEvm(normalizedRecipient), routeAmount],
    })
  );

  // 11. Show summary and confirm
  const intent = builder.build();

  logger.displayIntentSummary({
    source: `${sourceChain.name} (${sourceChain.id})`,
    destination: `${destChain.name} (${destChain.id})`,
    creator: AddressNormalizer.denormalize(creatorAddress, sourceChain.type),
    recipient: recipientAddress,
    routeDeadline: new Date(Number(routeDeadline) * 1000).toLocaleString(),
    rewardDeadline: new Date(Number(rewardDeadline) * 1000).toLocaleString(),
    routeToken: `${routeToken.address}${routeToken.symbol ? ` (${routeToken.symbol})` : ''}`,
    routeAmount: `${formatUnits(routeAmount, routeToken.decimals)} (${routeAmount.toString()} units)`,
    rewardToken: `${rewardToken.address}${rewardToken.symbol ? ` (${rewardToken.symbol})` : ''}`,
    rewardAmount: `${rewardAmountStr} (${rewardAmount.toString()} units)`,
  });

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: 'Publish this intent?',
      default: true,
    },
  ]);

  if (!confirm) {
    throw new Error('Publication cancelled by user');
  }

  return { intent, sourceChain, destChain };
}

/**
 * Select a token for a specific chain
 */
async function selectToken(
  chain: ChainConfig,
  type: string
): Promise<{ address: string; decimals: number; symbol?: string }> {
  // Get available tokens for this chain
  const allTokens = listTokens();
  const chainTokens = allTokens.filter(token => {
    const address = getTokenAddress(token.symbol, chain.id);
    return address !== undefined;
  });

  const choices = [
    ...chainTokens.map(t => ({
      name: `${t.symbol} - ${t.name}`,
      value: t.symbol,
    })),
    { name: 'Custom Token Address', value: 'CUSTOM' },
  ];

  const { tokenChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tokenChoice',
      message: `Select ${type} token:`,
      choices,
    },
  ]);

  if (tokenChoice === 'CUSTOM') {
    const { address, decimals } = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: 'Enter token address:',
        validate: input => {
          try {
            AddressNormalizer.normalize(input, chain.type);
            return true;
          } catch {
            return 'Invalid address format';
          }
        },
      },
      {
        type: 'input',
        name: 'decimals',
        message: 'Enter token decimals (e.g., 18 for most ERC20, 6 for USDC):',
        default: '18',
        validate: input => {
          const num = parseInt(input);
          return !isNaN(num) && num >= 0 && num <= 255
            ? true
            : 'Please enter a valid number between 0 and 255';
        },
      },
    ]);
    return { address, decimals: parseInt(decimals) };
  }

  // Get token config for selected symbol
  const tokenConfig = getTokenBySymbol(tokenChoice);
  if (!tokenConfig) {
    throw new Error(`Token ${tokenChoice} not found`);
  }

  const tokenAddress = getTokenAddress(tokenChoice, chain.id);
  if (!tokenAddress) {
    throw new Error(`Token ${tokenChoice} not available on chain ${chain.id}`);
  }

  // Denormalize the token address to chain-native format for display
  return {
    address: AddressNormalizer.denormalize(tokenAddress, chain.type),
    decimals: tokenConfig.decimals,
    symbol: tokenConfig.symbol,
  };
}

export function getWalletAddr(chain: ChainConfig, options: any) {
  const privateKey = getPrivateKey(chain, options?.privateKey);

  if (!privateKey) {
    throw new Error(`No private key configured for ${chain.type} chain`);
  }

  switch (chain.type) {
    case ChainType.EVM:
      const account = privateKeyToAccount(privateKey as Hex);
      return account.address;
    case ChainType.TVM:
      const tronAddress = TronWeb.address.fromPrivateKey(privateKey);
      if (!tronAddress) {
        throw new Error('Invalid Tron private key');
      }
      return tronAddress;
    case ChainType.SVM:
      let keypair: Keypair;
      if (privateKey.startsWith('[')) {
        const bytes = JSON.parse(privateKey);
        keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
      } else {
        const bs58 = require('bs58') as any;
        const bytes = bs58.decode(privateKey);
        keypair = Keypair.fromSecretKey(bytes);
      }
      return keypair.publicKey.toBase58();
    default:
      throw new Error('Unknown chain type');
  }
}

function getPrivateKey(chain: ChainConfig, privateKey?: string) {
  // Load configuration
  const env = loadEnvConfig();

  // Determine private key
  if (!privateKey) {
    switch (chain.type) {
      case ChainType.EVM:
        privateKey = env.evmPrivateKey;
        break;
      case ChainType.TVM:
        privateKey = env.tvmPrivateKey;
        break;
      case ChainType.SVM:
        privateKey = env.svmPrivateKey;
        break;
    }
  }

  if (!privateKey) {
    throw new Error(`No private key provided for ${chain.type} chain`);
  }

  return privateKey;
}
