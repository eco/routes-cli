/**
 * Intent Prompts
 *
 * Interactive CLI prompts for collecting intent configuration from the user.
 */

import inquirer from 'inquirer';
import { parseUnits } from 'viem';

import { getPrivateKey, getWalletAddress } from '@/cli/key-provider';
import { ChainConfig, getChainById, getChainByName, listChains } from '@/config/chains';
import { getTokenAddress, getTokenBySymbol, listTokens, TokenConfig } from '@/config/tokens';
import { chainRegistry } from '@/core/chain';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';
import { logger } from '@/utils/logger';

export interface PromptOptions {
  source?: string;
  destination?: string;
  privateKey?: string;
  recipient?: string;
}

export interface RewardConfig {
  token: { address: BlockchainAddress; decimals: number; symbol?: string };
  amount: bigint;
  amountStr: string;
}

export async function selectSourceChain(options: PromptOptions): Promise<ChainConfig> {
  if (options.source) {
    const chain = getChainByName(options.source) || getChainById(BigInt(options.source));
    if (!chain) throw new Error(`Unknown source chain: ${options.source}`);
    return chain;
  }

  const chains = listChains();
  const { sourceId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'sourceId',
      message: 'Select source chain:',
      choices: chains.map(c => ({ name: `${c.name} (${c.id})`, value: c.id })),
    },
  ]);

  return getChainById(BigInt(sourceId))!;
}

export async function selectDestinationChain(
  sourceChain: ChainConfig,
  options: PromptOptions
): Promise<ChainConfig> {
  if (options.destination) {
    const chain = getChainByName(options.destination) || getChainById(BigInt(options.destination));
    if (!chain) throw new Error(`Unknown destination chain: ${options.destination}`);
    return chain;
  }

  const chains = listChains();
  const { destinationId } = await inquirer.prompt([
    {
      type: 'list',
      name: 'destinationId',
      message: 'Select destination chain:',
      choices: chains
        .filter(c => c.id !== sourceChain.id)
        .map(c => ({ name: `${c.name} (${c.id})`, value: c.id })),
    },
  ]);

  return getChainById(destinationId)!;
}

export async function selectToken(
  chain: ChainConfig,
  label: string
): Promise<{ address: BlockchainAddress; decimals: number; symbol?: string }> {
  const allTokens = listTokens();
  const chainTokens = allTokens.filter(
    token => getTokenAddress(token.symbol, chain.id) !== undefined
  );

  const choices = [
    ...chainTokens.map(t => ({ name: `${t.symbol} - ${t.name}`, value: t.symbol })),
    { name: 'Custom Token Address', value: 'CUSTOM' },
  ];

  const { tokenChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'tokenChoice',
      message: `Select ${label} token:`,
      choices,
    },
  ]);

  if (tokenChoice === 'CUSTOM') {
    const { address, decimals } = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: 'Enter token address:',
        validate: (input: string) => {
          try {
            AddressNormalizer.normalize(input as BlockchainAddress, chain.type);
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
        validate: (input: string) => {
          const num = parseInt(input);
          return !isNaN(num) && num >= 0 && num <= 255
            ? true
            : 'Please enter a valid number between 0 and 255';
        },
      },
    ]);
    return { address: address as BlockchainAddress, decimals: parseInt(decimals as string) };
  }

  const tokenConfig: TokenConfig | undefined = getTokenBySymbol(tokenChoice as string);
  if (!tokenConfig) throw new Error(`Token ${tokenChoice as string} not found`);

  const tokenAddress = getTokenAddress(tokenChoice as string, chain.id);
  if (!tokenAddress)
    throw new Error(`Token ${tokenChoice as string} not available on chain ${chain.id}`);

  return {
    address: AddressNormalizer.denormalize(tokenAddress, chain.type) as BlockchainAddress,
    decimals: tokenConfig.decimals,
    symbol: tokenConfig.symbol,
  };
}

export async function configureReward(
  sourceChain: ChainConfig,
  _options: PromptOptions
): Promise<RewardConfig> {
  logger.section('💰 Reward Configuration (Source Chain)');

  const token = await selectToken(sourceChain, 'reward');

  const { rewardAmountStr } = await inquirer.prompt([
    {
      type: 'input',
      name: 'rewardAmountStr',
      default: '0.1',
      message: `Enter reward amount${token.symbol ? ` (${token.symbol})` : ''} in human-readable format (e.g., "10" for 10 tokens):`,
      validate: (input: string) => {
        const num = parseFloat(input);
        return !isNaN(num) && num > 0 ? true : 'Please enter a positive number';
      },
    },
  ]);

  return {
    token,
    amount: parseUnits(rewardAmountStr as string, token.decimals),
    amountStr: rewardAmountStr as string,
  };
}

export async function selectRecipient(
  destChain: ChainConfig,
  options: PromptOptions
): Promise<UniversalAddress> {
  logger.section('👤 Recipient Configuration');

  let defaultRecipient: string | undefined = options.recipient;

  if (!defaultRecipient) {
    try {
      const destPrivKey = getPrivateKey(destChain.type, options.privateKey);
      defaultRecipient = destPrivKey.use(key => getWalletAddress(destChain.type, key));
    } catch {
      // No default available
    }
  }

  const handler = chainRegistry.get(destChain.type);

  const { recipientAddress } = await inquirer.prompt([
    {
      type: 'input',
      name: 'recipientAddress',
      message: `Enter recipient address on ${destChain.name} (${destChain.type} chain):`,
      default: defaultRecipient,
      validate: (input: string) => {
        if (!input || input.trim() === '') return 'Recipient address is required';
        if (!handler.validateAddress(input)) {
          return `Invalid ${destChain.type} address — expected ${handler.getAddressFormat()}`;
        }
        return true;
      },
    },
  ]);

  return AddressNormalizer.normalize(recipientAddress as BlockchainAddress, destChain.type);
}
