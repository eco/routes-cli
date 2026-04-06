import { Injectable } from '@nestjs/common';

import inquirer from 'inquirer';
import { parseUnits } from 'viem';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainRegistryService } from '@/blockchain/chain-registry.service';
import { TokenConfig } from '@/config/tokens.config';
import { ChainConfig } from '@/shared/types';

@Injectable()
export class PromptService {
  constructor(
    private readonly registry: ChainRegistryService,
    private readonly normalizer: AddressNormalizerService
  ) {}

  async selectChain(chains: ChainConfig[], message: string): Promise<ChainConfig> {
    const { chain } = await inquirer.prompt([
      {
        type: 'list',
        name: 'chain',
        message,
        choices: chains.map(c => ({ name: `${c.name} (${c.id})`, value: c })),
      },
    ]);
    return chain;
  }

  async selectToken(
    chain: ChainConfig,
    tokens: TokenConfig[],
    label: string
  ): Promise<{ address: string; decimals: number; symbol?: string }> {
    const availableTokens = tokens.filter(t => !!t.addresses[chain.id.toString()]);
    const choices = [
      ...availableTokens.map(t => ({ name: `${t.symbol} - ${t.name}`, value: t.symbol })),
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
      const handler = this.registry.get(chain.type);
      const { address, decimals } = await inquirer.prompt([
        {
          type: 'input',
          name: 'address',
          message: 'Enter token address:',
          validate: (input: string) => {
            if (!handler.validateAddress(input)) {
              return `Invalid ${chain.type} address — expected ${handler.getAddressFormat()}`;
            }
            return true;
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
      return { address: address as string, decimals: parseInt(decimals as string) };
    }

    const token = availableTokens.find(t => t.symbol === tokenChoice);
    if (!token) throw new Error(`Token ${tokenChoice as string} not found`);

    const tokenAddress = token.addresses[chain.id.toString()];
    if (!tokenAddress) throw new Error(`Token ${token.symbol} not available on chain ${chain.id}`);

    return {
      address: this.normalizer.denormalize(tokenAddress, chain.type) as string,
      decimals: token.decimals,
      symbol: token.symbol,
    };
  }

  async inputAmount(
    label: string,
    decimals: number,
    defaultValue = '0.1'
  ): Promise<{ raw: string; parsed: bigint }> {
    const { amount } = await inquirer.prompt([
      {
        type: 'input',
        name: 'amount',
        message: `Enter ${label} amount in human-readable format (e.g., "10" for 10 tokens):`,
        default: defaultValue,
        validate: (input: string) => {
          const num = parseFloat(input);
          return !isNaN(num) && num > 0 ? true : 'Please enter a positive number';
        },
      },
    ]);
    return {
      raw: amount as string,
      parsed: parseUnits(amount as string, decimals),
    };
  }

  async inputAddress(chain: ChainConfig, label: string, defaultValue?: string): Promise<string> {
    const handler = this.registry.get(chain.type);
    const { address } = await inquirer.prompt([
      {
        type: 'input',
        name: 'address',
        message: `Enter ${label} address on ${chain.name} (${chain.type} chain):`,
        default: defaultValue,
        validate: (input: string) => {
          if (!input || input.trim() === '') return `${label} address is required`;
          if (!handler.validateAddress(input)) {
            return `Invalid ${chain.type} address — expected ${handler.getAddressFormat()}`;
          }
          return true;
        },
      },
    ]);
    return address as string;
  }

  async confirmPublish(): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message: 'Publish this intent?',
        default: true,
      },
    ]);
    return confirmed;
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: defaultValue,
      },
    ]);
    return confirmed;
  }

  async inputManualPortal(chain: ChainConfig): Promise<string> {
    const handler = this.registry.get(chain.type);
    const { portal } = await inquirer.prompt([
      {
        type: 'input',
        name: 'portal',
        message: `Enter portal contract address on ${chain.name}:`,
        default: chain.portalAddress
          ? (this.normalizer.denormalize(chain.portalAddress, chain.type) as string)
          : undefined,
        validate: (input: string) => {
          if (!input || input.trim() === '') return 'Portal address is required';
          if (!handler.validateAddress(input)) {
            return `Invalid ${chain.type} address — expected ${handler.getAddressFormat()}`;
          }
          return true;
        },
      },
    ]);
    return portal as string;
  }

  async inputManualProver(chain: ChainConfig): Promise<string> {
    const handler = this.registry.get(chain.type);
    const { prover } = await inquirer.prompt([
      {
        type: 'input',
        name: 'prover',
        message: `Enter prover contract address on ${chain.name}:`,
        default: chain.proverAddress
          ? (this.normalizer.denormalize(chain.proverAddress, chain.type) as string)
          : undefined,
        validate: (input: string) => {
          if (!input || input.trim() === '') return 'Prover address is required';
          if (!handler.validateAddress(input)) {
            return `Invalid ${chain.type} address — expected ${handler.getAddressFormat()}`;
          }
          return true;
        },
      },
    ]);
    return prover as string;
  }
}
