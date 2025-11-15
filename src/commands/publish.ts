/**
 * Publish Command
 */

import * as crypto from 'crypto';

import { Keypair, PublicKey } from '@solana/web3.js';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { TronWeb } from 'tronweb';
import {
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  Hex,
  isAddress as isViemAddress,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { BasePublisher } from '@/blockchain/base-publisher';
import { EvmPublisher } from '@/blockchain/evm-publisher';
import { SvmPublisher } from '@/blockchain/svm-publisher';
import { TvmPublisher } from '@/blockchain/tvm-publisher';
import { serialize } from '@/commons/utils/serialize';
import { ChainConfig, getChainById, getChainByName, listChains } from '@/config/chains';
import { loadEnvConfig } from '@/config/env';
import { getTokenAddress, getTokenBySymbol, listTokens } from '@/config/tokens';
import { ChainType, Intent } from '@/core/interfaces/intent';
import { BlockchainAddress, SvmAddress, TronAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { PortalEncoder } from '@/core/utils/portal-encoder';
import { getQuote, QuoteResponse } from '@/core/utils/quote';
import { logger } from '@/utils/logger';

interface PublishCommandOptions {
  source?: string;
  destination?: string;
  privateKey?: string;
  rpc?: string;
  dryRun?: boolean;
}

export function createPublishCommand(): Command {
  const command = new Command('publish');

  command
    .description('Publish an intent to the blockchain')
    .option('-s, --source <chain>', 'Source chain (name or ID)')
    .option('-d, --destination <chain>', 'Destination chain (name or ID)')
    .option('-k, --private-key <key>', 'Private key (overrides env)')
    .option('-r, --rpc <url>', 'RPC URL (overrides env)')
    .option('--recipient <address>', 'Recipient address on destination chain')
    .option('--dry-run', 'Validate without publishing')
    .action(async options => {
      try {
        // Interactive mode
        logger.title('🎨 Interactive Intent Publishing');

        const { reward, encodedRoute, sourceChain, destChain, sourcePortal } =
          await buildIntentInteractively(options);

        if (process.env.DEBUG) {
          logger.log(`Reward: ${serialize(reward)}`);
        }

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
        const senderAddress = getWalletAddr(sourceChain, options);

        logger.log(`Sender: ${senderAddress}`);
        logger.log(`Source: ${sourceChain.name} (${sourceChain.id})`);
        logger.log(`Destination: ${destChain.name} (${destChain.id})`);

        if (options.dryRun) {
          logger.warning('Dry run - not publishing');
          return;
        }

        // Publish
        logger.spinner('Publishing intent to blockchain...');
        const result = await publisher.publish(
          sourceChain.id,
          destChain.id,
          reward,
          encodedRoute,
          privateKey,
          sourcePortal
        );

        if (result.success) {
          logger.displayTransactionResult(result);
        } else {
          logger.fail('Publishing failed');
          throw new Error(result.error || 'Publishing failed');
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger.error(`Error: ${errorMessage}`);
        if (process.env.DEBUG && error instanceof Error) {
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
async function buildIntentInteractively(options: PublishCommandOptions) {
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

  // 4. Prompt for reward configuration
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
  } catch {
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
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Invalid address format';
          return `Invalid address: ${errorMessage}`;
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

  // 5. Get quote (with fallback to manual configuration)
  let quote: QuoteResponse | null = null;

  logger.spinner('Getting quote...');
  try {
    quote = await getQuote({
      source: sourceChain.id,
      destination: destChain.id,
      funder: AddressNormalizer.denormalize(creatorAddress, sourceChain.type),
      recipient: AddressNormalizer.denormalize(normalizedRecipient, destChain.type),
      amount: rewardAmount,
      routeToken: routeToken.address,
      rewardToken: rewardToken.address,
    });

    logger.succeed('Quote fetched');

    // Validate contract addresses from quote
    if (quote && (!quote.contracts?.sourcePortal || !quote.contracts?.prover)) {
      logger.warning('Quote response missing required contract addresses');
      quote = null;
    }
  } catch (error: any) {
    logger.stopSpinner();
    if (process.env.DEBUG) {
      console.log(error.stack);
    }
    logger.warning('Quote service unavailable');
    quote = null;
  }

  // Variables to hold route/reward data
  let encodedRoute!: Hex;
  let sourcePortal!: UniversalAddress;
  let proverAddress!: UniversalAddress;
  let routeAmountDisplay!: string;

  if (quote) {
    // Extract quote data (now unified format from both APIs)
    const quoteData = quote.quoteResponse;

    if (!quoteData) {
      logger.warning('Quote response missing quote data');
      quote = null;
    } else {
      encodedRoute = quoteData.encodedRoute as Hex;
      sourcePortal = AddressNormalizer.normalize(quote.contracts.sourcePortal, sourceChain.type);
      proverAddress = AddressNormalizer.normalize(quote.contracts.prover, sourceChain.type);
      routeAmountDisplay = formatUnits(BigInt(quoteData.destinationAmount), routeToken.decimals);

      // Display solver-v2 specific fields if available
      if (quoteData.estimatedFulfillTimeSec) {
        logger.info(`Estimated fulfillment time: ${quoteData.estimatedFulfillTimeSec} seconds`);
      }

      if (quoteData.intentExecutionType) {
        logger.info(`Execution type: ${quoteData.intentExecutionType}`);
      }
    }
  }

  if (!quote) {
    // FALLBACK: Manual configuration
    logger.section('⚠️  Manual Configuration Required');

    // Display detailed warning
    logger.warning('Quote service is unavailable. Manual configuration is required.');
    logger.log('');
    logger.log('⚠️  Important:');
    logger.log('   • You must provide the route amount manually');
    logger.log('   • Portal and prover addresses will be needed');
    logger.log('   • Routing may not be optimal without quote service');
    logger.log('');

    const { proceedManual } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceedManual',
        message: 'Do you want to proceed with manual configuration?',
        default: true,
      },
    ]);

    if (!proceedManual) {
      throw new Error('Publication cancelled by user');
    }

    // Prompt for route amount
    const { routeAmountStr } = await inquirer.prompt([
      {
        type: 'input',
        name: 'routeAmountStr',
        message: `Enter expected route amount (tokens to receive on ${destChain.name}):`,
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

    const routeAmount = parseUnits(routeAmountStr, routeToken.decimals);
    routeAmountDisplay = routeAmountStr;

    // Get or prompt for portal address
    if (sourceChain.portalAddress) {
      sourcePortal = sourceChain.portalAddress;
      logger.log(`Using portal address from config: ${sourcePortal}`);
    } else {
      const { portalAddressInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'portalAddressInput',
          message: `Enter source portal address for ${sourceChain.name}:`,
          validate: input => {
            try {
              AddressNormalizer.normalize(input, sourceChain.type);
              return true;
            } catch {
              return 'Invalid address format';
            }
          },
        },
      ]);
      sourcePortal = AddressNormalizer.normalize(portalAddressInput, sourceChain.type);
    }

    // Get or prompt for prover address
    if (sourceChain.proverAddress) {
      proverAddress = sourceChain.proverAddress;
      logger.log(`Using prover address from config: ${proverAddress}`);
    } else {
      const { proverAddressInput } = await inquirer.prompt([
        {
          type: 'input',
          name: 'proverAddressInput',
          message: `Enter prover address for ${sourceChain.name}:`,
          validate: input => {
            try {
              AddressNormalizer.normalize(input, sourceChain.type);
              return true;
            } catch {
              return 'Invalid address format';
            }
          },
        },
      ]);
      proverAddress = AddressNormalizer.normalize(proverAddressInput, sourceChain.type);
    }

    // Build Route object manually
    logger.spinner('Building route manually...');

    const now = Math.floor(Date.now() / 1000);
    const routeDeadline = BigInt(now + 2 * 60 * 60); // 2 hours

    // Encode transfer function call for route token
    const transferCallData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'transfer',
      args: [
        AddressNormalizer.denormalize(normalizedRecipient, destChain.type) as `0x${string}`,
        routeAmount,
      ],
    });

    const route: Intent['route'] = {
      salt: `0x${crypto.randomBytes(32).toString('hex')}` as Hex,
      deadline: routeDeadline,
      portal: sourcePortal,
      nativeAmount: 0n,
      tokens: [
        {
          token: AddressNormalizer.normalize(routeToken.address, destChain.type),
          amount: routeAmount,
        },
      ],
      calls: [
        {
          target: AddressNormalizer.normalize(routeToken.address, destChain.type),
          data: transferCallData,
          value: 0n,
        },
      ],
    };

    // Encode the route
    encodedRoute = PortalEncoder.encode(route, destChain.type);
    logger.succeed('Route built and encoded');
  }

  // 6. Set fixed deadlines
  const now = Math.floor(Date.now() / 1000);
  const rewardDeadline = BigInt(now + 2 * 60 * 60);

  // 7. Build reward using addresses from quote or manual input
  const reward: Intent['reward'] = {
    deadline: rewardDeadline,
    prover: proverAddress,
    creator: creatorAddress,
    nativeAmount: 0n,
    tokens: [
      {
        token: AddressNormalizer.normalize(rewardToken.address, sourceChain.type),
        amount: rewardAmount,
      },
    ],
  };

  logger.displayIntentSummary({
    source: `${sourceChain.name} (${sourceChain.id})`,
    destination: `${destChain.name} (${destChain.id})`,
    creator: AddressNormalizer.denormalize(creatorAddress, sourceChain.type),
    recipient: normalizedRecipient,
    rewardDeadline: new Date(Number(rewardDeadline) * 1000).toLocaleString(),
    routeToken: `${routeToken.address}${routeToken.symbol ? ` (${routeToken.symbol})` : ''}`,
    routeAmount: routeAmountDisplay,
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

  return {
    reward,
    encodedRoute,
    sourceChain,
    destChain,
    sourcePortal,
  };
}

/**
 * Select a token for a specific chain
 */
async function selectToken(
  chain: ChainConfig,
  type: string
): Promise<{ address: BlockchainAddress; decimals: number; symbol?: string }> {
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

export function getWalletAddr(
  chain: ChainConfig,
  options?: PublishCommandOptions
): BlockchainAddress {
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
      return tronAddress as TronAddress;
    case ChainType.SVM:
      let keypair: Keypair;
      if (privateKey.startsWith('[')) {
        const bytes = JSON.parse(privateKey);
        keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const bs58 = require('bs58');
        const bytes = bs58.decode(privateKey);
        keypair = Keypair.fromSecretKey(bytes);
      }
      return keypair.publicKey.toBase58() as SvmAddress;
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
