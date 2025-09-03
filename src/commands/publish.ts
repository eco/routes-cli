/**
 * Publish Command
 */

import chalk from "chalk";
import { Command } from "commander";
import inquirer from "inquirer";
import { Hex } from "viem";
import { ChainType, Intent } from "../core/interfaces/intent";
import { BasePublisher } from "../blockchain/base-publisher";
import { EvmPublisher } from "../blockchain/evm-publisher";
import { TvmPublisher } from "../blockchain/tvm-publisher";
import { SvmPublisher } from "../blockchain/svm-publisher";
import {
  ChainConfig,
  getChainById,
  getChainByName,
  listChains,
} from "../config/chains";
import { getTokenAddress, listTokens } from "../config/tokens";
import { loadEnvConfig } from "../config/env";
import { AddressNormalizer } from "../core/utils/address-normalizer";
import { IntentBuilder } from "../builders/intent-builder";
import { privateKeyToAccount } from "viem/accounts";
import { TronWeb } from "tronweb";
import { Keypair } from "@solana/web3.js";

export function createPublishCommand(): Command {
  const command = new Command("publish");

  command
    .description("Publish an intent to the blockchain")
    .option("-s, --source <chain>", "Source chain (name or ID)")
    .option("-d, --destination <chain>", "Destination chain (name or ID)")
    .option("-k, --private-key <key>", "Private key (overrides env)")
    .option("-r, --rpc <url>", "RPC URL (overrides env)")
    .option("--dry-run", "Validate without publishing")
    .action(async (options) => {
      try {
        // Interactive mode
        console.log(chalk.blue("🎨 Interactive Intent Publishing\n"));

        const { intent, sourceChain, destChain } =
          await buildIntentInteractively(options);

        // Load configuration
        const env = loadEnvConfig();

        // Determine private key
        let privateKey: string | undefined;
        if (options.privateKey) {
          privateKey = options.privateKey;
        } else {
          switch (sourceChain.type) {
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
          throw new Error(
            `No private key provided for ${sourceChain.type} chain`,
          );
        }

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
              throw new Error("Invalid Tron private key");
            }
            senderAddress = tronAddress;
            break;
          case ChainType.SVM:
            // Parse Solana private key (simplified)
            let keypair: Keypair;
            if (privateKey.startsWith("[")) {
              const bytes = JSON.parse(privateKey);
              keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
            } else {
              const bs58 = require("bs58") as any;
              const bytes = bs58.decode(privateKey);
              keypair = Keypair.fromSecretKey(bytes);
            }
            senderAddress = keypair.publicKey.toBase58();
            break;
          default:
            throw new Error("Unknown chain type");
        }

        console.log(chalk.gray(`Sender: ${senderAddress}`));
        console.log(
          chalk.gray(`Source: ${sourceChain.name} (${sourceChain.id})`),
        );
        console.log(
          chalk.gray(`Destination: ${destChain.name} (${destChain.id})`),
        );

        // Validate
        const validation = await publisher.validate(intent, senderAddress);
        if (!validation.valid) {
          throw new Error(`Validation failed: ${validation.error}`);
        }

        console.log(chalk.green("✓ Validation passed"));

        if (options.dryRun) {
          console.log(chalk.yellow("Dry run - not publishing"));
          return;
        }

        // Publish
        const result = await publisher.publish(intent, privateKey);

        if (result.success) {
          console.log(chalk.green("✅ Intent published successfully!"));
          console.log(chalk.gray(`Transaction: ${result.transactionHash}`));
          if (result.intentHash) {
            console.log(chalk.gray(`Intent Hash: ${result.intentHash}`));
          }
          if (result.vaultAddress) {
            console.log(chalk.gray(`Vault: ${result.vaultAddress}`));
          }
        } else {
          throw new Error(result.error || "Publishing failed");
        }
      } catch (error: any) {
        console.error(chalk.red(`❌ Error: ${error.message}`));
        console.error(chalk.red(`❌ Error Stack: ${error.stack}`));
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
  const env = loadEnvConfig();

  // 1. Get source chain
  let sourceChain: ChainConfig | undefined;
  if (options.source) {
    sourceChain =
      getChainByName(options.source) || getChainById(BigInt(options.source));
    if (!sourceChain) {
      throw new Error(`Unknown source chain: ${options.source}`);
    }
  } else {
    const { source: sourceId } = await inquirer.prompt([
      {
        type: "list",
        name: "source",
        message: "Select source chain:",
        choices: chains.map((c) => ({
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
    destChain =
      getChainByName(options.destination) ||
      getChainById(BigInt(options.destination));
    if (!destChain) {
      throw new Error(`Unknown destination chain: ${options.destination}`);
    }
  } else {
    const { destination: destinationId } = await inquirer.prompt([
      {
        type: "list",
        name: "destination",
        message: "Select destination chain:",
        choices: chains
          .filter((c) => c.id !== sourceChain!.id)
          .map((c) => ({ name: `${c.name} (${c.id})`, value: c.id })),
      },
    ]);
    destChain = getChainById(destinationId)!;
  }

  // 3. Get wallet address (creator) from private key
  const privateKey =
    options.privateKey ||
    (sourceChain.type === ChainType.EVM
      ? env.evmPrivateKey
      : sourceChain.type === ChainType.TVM
        ? env.tvmPrivateKey
        : env.svmPrivateKey);

  if (!privateKey) {
    throw new Error(`No private key configured for ${sourceChain.type} chain`);
  }

  let creatorAddress: string;
  switch (sourceChain.type) {
    case ChainType.EVM:
      const account = privateKeyToAccount(privateKey as Hex);
      creatorAddress = account.address;
      break;
    case ChainType.TVM:
      const tronAddress = TronWeb.address.fromPrivateKey(privateKey);
      if (!tronAddress) {
        throw new Error("Invalid Tron private key");
      }
      creatorAddress = tronAddress;
      break;
    case ChainType.SVM:
      let keypair: Keypair;
      if (privateKey.startsWith("[")) {
        const bytes = JSON.parse(privateKey);
        keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
      } else {
        const bs58 = require("bs58") as any;
        const bytes = bs58.decode(privateKey);
        keypair = Keypair.fromSecretKey(bytes);
      }
      creatorAddress = keypair.publicKey.toBase58();
      break;
    default:
      throw new Error("Unknown chain type");
  }

  // 4. Get prover from chain config
  if (!sourceChain.proverAddress) {
    throw new Error(`No prover configured for ${sourceChain.name}`);
  }

  // 5. Get portal from destination chain config
  if (!destChain.portalAddress) {
    throw new Error(`No portal configured for ${destChain.name}`);
  }

  // 6. Prompt for route configuration
  console.log(chalk.blue("\n📏 Route Configuration (Destination Chain)"));

  let routeTokenAddress = await selectToken(destChain, "route");
  let routeAmount: bigint;

  const { routeAmountStr } = await inquirer.prompt([
    {
      type: "input",
      name: "routeAmountStr",
      message: `Enter route amount:`,
      validate: (input) => {
        try {
          BigInt(input);
          return true;
        } catch {
          return "Invalid amount";
        }
      },
    },
  ]);
  routeAmount = BigInt(routeAmountStr);

  // 7. Prompt for reward configuration
  console.log(chalk.blue("\n💰 Reward Configuration (Source Chain)"));

  let rewardTokenAddress = await selectToken(sourceChain, "reward");
  let rewardAmount: bigint;

  const { rewardAmountStr } = await inquirer.prompt([
    {
      type: "input",
      name: "rewardAmountStr",
      message: `Enter reward amount:`,
      validate: (input) => {
        try {
          BigInt(input);
          return true;
        } catch {
          return "Invalid amount";
        }
      },
    },
  ]);
  rewardAmount = BigInt(rewardAmountStr);

  // 8. Set fixed deadlines
  const now = Math.floor(Date.now() / 1000);
  const routeDeadline = BigInt(now + 2 * 60 * 60); // 2 hours
  const rewardDeadline = BigInt(now + 3 * 60 * 60); // 3 hours

  // 9. Build intent
  const builder = new IntentBuilder()
    .setSourceChain(sourceChain.id)
    .setDestinationChain(destChain.id)
    .setPortal(destChain.portalAddress)
    .setCreator(AddressNormalizer.normalize(creatorAddress, sourceChain.type))
    .setProver(sourceChain.proverAddress)
    .setRouteDeadline(routeDeadline)
    .setRewardDeadline(rewardDeadline);

  builder.addRouteToken(
    AddressNormalizer.normalize(routeTokenAddress, destChain.type),
    routeAmount,
  );

  builder.addRewardToken(
    AddressNormalizer.normalize(rewardTokenAddress, sourceChain.type),
    rewardAmount,
  );

  // 10. Show summary and confirm
  const intent = builder.build();
  console.log(chalk.yellow("\n📋 Intent Summary:"));
  console.log(chalk.gray(`Source: ${sourceChain.name} (${sourceChain.id})`));
  console.log(chalk.gray(`Destination: ${destChain.name} (${destChain.id})`));
  console.log(chalk.gray(`Creator: ${creatorAddress}`));
  console.log(
    chalk.gray(
      `Route deadline: ${new Date(Number(routeDeadline) * 1000).toLocaleString()}`,
    ),
  );
  console.log(
    chalk.gray(
      `Reward deadline: ${new Date(Number(rewardDeadline) * 1000).toLocaleString()}`,
    ),
  );
  console.log(chalk.gray(`Route token: ${routeTokenAddress}`));
  console.log(chalk.gray(`Reward token: ${rewardTokenAddress}`));

  const { confirm } = await inquirer.prompt([
    {
      type: "confirm",
      name: "confirm",
      message: "Publish this intent?",
      default: true,
    },
  ]);

  if (!confirm) {
    throw new Error("Publication cancelled by user");
  }

  return { intent, sourceChain, destChain };
}

/**
 * Select a token for a specific chain
 */
async function selectToken(chain: ChainConfig, type: string): Promise<string> {
  // Get available tokens for this chain
  const allTokens = listTokens();
  const chainTokens = allTokens.filter((token) => {
    const address = getTokenAddress(token.symbol, chain.id);
    return address !== undefined;
  });

  const choices = [
    ...chainTokens.map((t) => ({
      name: `${t.symbol} - ${t.name}`,
      value: getTokenAddress(t.symbol, chain.id),
    })),
    { name: "Custom Token Address", value: "CUSTOM" },
  ];

  const { token } = await inquirer.prompt([
    {
      type: "list",
      name: "token",
      message: `Select ${type} token:`,
      choices,
    },
  ]);

  if (token === "CUSTOM") {
    const { address } = await inquirer.prompt([
      {
        type: "input",
        name: "address",
        message: "Enter token address:",
        validate: (input) => {
          try {
            AddressNormalizer.normalize(input, chain.type);
            return true;
          } catch {
            return "Invalid address format";
          }
        },
      },
    ]);
    return address;
  }

  // Denormalize the token address to chain-native format for display
  return AddressNormalizer.denormalize(token, chain.type);
}
