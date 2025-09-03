/**
 * Create Command - Interactive intent creation
 */

import chalk from 'chalk';
import { Command } from 'commander';
import inquirer from 'inquirer';
import { Hex } from 'viem';
import { IntentBuilder } from '../builders/intent-builder';
import { listChains, getChainByName } from '../config/chains';
import { listTokens, getTokenAddress } from '../config/tokens';
import { AddressNormalizer } from '../core/utils/address-normalizer';
import { ChainType } from '../core/interfaces/intent';

export function createCreateCommand(): Command {
  const command = new Command('create');
  
  command
    .description('Create an intent interactively')
    .option('-o, --output', 'Output intent JSON')
    .action(async (options) => {
      try {
        console.log(chalk.blue('🎨 Intent Creation Wizard\n'));
        
        const builder = new IntentBuilder();
        const chains = listChains();
        const tokens = listTokens();
        
        // Source chain selection
        const { sourceChain } = await inquirer.prompt([
          {
            type: 'list',
            name: 'sourceChain',
            message: 'Select source chain:',
            choices: chains.map(c => ({ name: `${c.name} (${c.id})`, value: c.name })),
          },
        ]);
        
        const source = getChainByName(sourceChain)!;
        builder.setSourceChain(source.id);
        
        // Destination chain selection
        const { destChain } = await inquirer.prompt([
          {
            type: 'list',
            name: 'destChain',
            message: 'Select destination chain:',
            choices: chains
              .filter(c => c.id !== source.id)
              .map(c => ({ name: `${c.name} (${c.id})`, value: c.name })),
          },
        ]);
        
        const destination = getChainByName(destChain)!;
        builder.setDestinationChain(destination.id);
        
        // Portal address
        if (destination.portalAddress) {
          builder.setPortal(destination.portalAddress);
        } else {
          const { portalAddress } = await inquirer.prompt([
            {
              type: 'input',
              name: 'portalAddress',
              message: `Enter Portal address for ${destination.name}:`,
              validate: (input) => {
                try {
                  AddressNormalizer.normalize(input, destination.type);
                  return true;
                } catch {
                  return 'Invalid address format';
                }
              },
            },
          ]);
          
          const normalized = AddressNormalizer.normalize(portalAddress, destination.type);
          builder.setPortal(normalized);
        }
        
        // Creator address
        const { creatorAddress } = await inquirer.prompt([
          {
            type: 'input',
            name: 'creatorAddress',
            message: 'Enter creator address:',
            validate: (input) => {
              try {
                AddressNormalizer.normalize(input, source.type);
                return true;
              } catch {
                return 'Invalid address format';
              }
            },
          },
        ]);
        
        const normalizedCreator = AddressNormalizer.normalize(creatorAddress, source.type);
        builder.setCreator(normalizedCreator);
        
        // Prover address
        const { proverAddress } = await inquirer.prompt([
          {
            type: 'input',
            name: 'proverAddress',
            message: 'Enter prover address:',
            default: source.proverAddress ? 
              AddressNormalizer.denormalize(source.proverAddress, source.type) : 
              undefined,
            validate: (input) => {
              try {
                AddressNormalizer.normalize(input, source.type);
                return true;
              } catch {
                return 'Invalid address format';
              }
            },
          },
        ]);
        
        const normalizedProver = AddressNormalizer.normalize(proverAddress, source.type);
        builder.setProver(normalizedProver);
        
        // Deadline
        const { deadlineMinutes } = await inquirer.prompt([
          {
            type: 'number',
            name: 'deadlineMinutes',
            message: 'Intent deadline (minutes from now):',
            default: 60,
          },
        ]);
        
        const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineMinutes * 60);
        builder.setRouteDeadline(deadline);
        builder.setRewardDeadline(deadline);
        
        // Native amount for route
        const { routeNativeAmount } = await inquirer.prompt([
          {
            type: 'input',
            name: 'routeNativeAmount',
            message: `Route native amount (${destination.nativeCurrency.symbol}):`,
            default: '0',
            validate: (input) => {
              try {
                BigInt(input);
                return true;
              } catch {
                return 'Invalid amount';
              }
            },
          },
        ]);
        
        if (routeNativeAmount !== '0') {
          builder.addRouteNativeAmount(BigInt(routeNativeAmount));
        }
        
        // Native amount for reward
        const { rewardNativeAmount } = await inquirer.prompt([
          {
            type: 'input',
            name: 'rewardNativeAmount',
            message: `Reward native amount (${source.nativeCurrency.symbol}):`,
            default: '0',
            validate: (input) => {
              try {
                BigInt(input);
                return true;
              } catch {
                return 'Invalid amount';
              }
            },
          },
        ]);
        
        if (rewardNativeAmount !== '0') {
          builder.addRewardNativeAmount(BigInt(rewardNativeAmount));
        }
        
        // Add tokens to route
        const { addRouteTokens } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'addRouteTokens',
            message: 'Add tokens to route?',
            default: false,
          },
        ]);
        
        if (addRouteTokens) {
          let addMore = true;
          while (addMore) {
            const { tokenSymbol } = await inquirer.prompt([
              {
                type: 'list',
                name: 'tokenSymbol',
                message: 'Select token:',
                choices: [
                  ...tokens.map(t => t.symbol),
                  'Custom',
                ],
              },
            ]);
            
            let tokenAddress: string;
            if (tokenSymbol === 'Custom') {
              const { customAddress } = await inquirer.prompt([
                {
                  type: 'input',
                  name: 'customAddress',
                  message: 'Enter token address:',
                },
              ]);
              tokenAddress = customAddress;
            } else {
              const addr = getTokenAddress(tokenSymbol, destination.id);
              if (!addr) {
                console.log(chalk.yellow(`No ${tokenSymbol} address for ${destination.name}`));
                const { customAddress } = await inquirer.prompt([
                  {
                    type: 'input',
                    name: 'customAddress',
                    message: `Enter ${tokenSymbol} address:`,
                  },
                ]);
                tokenAddress = customAddress;
              } else {
                tokenAddress = AddressNormalizer.denormalize(addr, destination.type);
              }
            }
            
            const { amount } = await inquirer.prompt([
              {
                type: 'input',
                name: 'amount',
                message: 'Token amount:',
                validate: (input) => {
                  try {
                    BigInt(input);
                    return true;
                  } catch {
                    return 'Invalid amount';
                  }
                },
              },
            ]);
            
            const normalizedToken = AddressNormalizer.normalize(tokenAddress, destination.type);
            builder.addRouteToken(normalizedToken, BigInt(amount));
            
            const { more } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'more',
                message: 'Add another token?',
                default: false,
              },
            ]);
            addMore = more;
          }
        }
        
        // Add calls
        const { addCalls } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'addCalls',
            message: 'Add contract calls to route?',
            default: false,
          },
        ]);
        
        if (addCalls) {
          let addMore = true;
          while (addMore) {
            const { target, data, value } = await inquirer.prompt([
              {
                type: 'input',
                name: 'target',
                message: 'Target contract address:',
                validate: (input) => {
                  try {
                    AddressNormalizer.normalize(input, destination.type);
                    return true;
                  } catch {
                    return 'Invalid address';
                  }
                },
              },
              {
                type: 'input',
                name: 'data',
                message: 'Call data (hex):',
                default: '0x',
                validate: (input) => {
                  return input.startsWith('0x') || 'Must start with 0x';
                },
              },
              {
                type: 'input',
                name: 'value',
                message: `Call value (${destination.nativeCurrency.symbol}):`,
                default: '0',
                validate: (input) => {
                  try {
                    BigInt(input);
                    return true;
                  } catch {
                    return 'Invalid amount';
                  }
                },
              },
            ]);
            
            const normalizedTarget = AddressNormalizer.normalize(target, destination.type);
            builder.addCall(normalizedTarget, data as Hex, BigInt(value));
            
            const { more } = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'more',
                message: 'Add another call?',
                default: false,
              },
            ]);
            addMore = more;
          }
        }
        
        // Build the intent
        const intent = builder.build();
        
        console.log(chalk.green('\n✅ Intent created successfully!\n'));
        
        if (options.output) {
          console.log(chalk.gray('Intent JSON:'));
          console.log(JSON.stringify(intent, (key, value) =>
            typeof value === 'bigint' ? value.toString() : value, 2));
        } else {
          console.log(chalk.gray('Intent Hash:'), intent.intentHash);
          console.log(chalk.gray('Source:'), `${source.name} (${source.id})`);
          console.log(chalk.gray('Destination:'), `${destination.name} (${destination.id})`);
        }
        
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        process.exit(1);
      }
    });
  
  return command;
}