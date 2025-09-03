/**
 * EVM Chain Publisher
 */

import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  Hex,
  http,
  parseEventLogs,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as chains from "viem/chains";
import { BasePublisher, PublishResult } from "./base-publisher";
import { ChainType, Intent } from "../core/interfaces/intent";
import { AddressNormalizer } from "../core/utils/address-normalizer";
import { PortalEncoder } from "../core/utils/portal-encoder";
import { getChainById } from "../config/chains";
import { portalAbi } from "../commons/abis/portal.abi";

export class EvmPublisher extends BasePublisher {
  async publish(intent: Intent, privateKey: string): Promise<PublishResult> {
    try {
      const account = privateKeyToAccount(privateKey as Hex);
      const chain = this.getChain(intent.sourceChainId);

      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(this.rpcUrl),
      });

      const publicClient = createPublicClient({
        chain,
        transport: http(this.rpcUrl),
      });

      // Get Portal address
      const chainConfig = getChainById(intent.sourceChainId);
      if (!chainConfig?.portalAddress) {
        throw new Error(
          `No Portal address configured for chain ${intent.sourceChainId}`,
        );
      }

      const portalAddress = AddressNormalizer.denormalize(
        chainConfig.portalAddress,
        ChainType.EVM,
      );

      // Encode route for destination chain type
      const destChainType = chainConfig.type;
      const routeEncoded = PortalEncoder.encodeRoute(
        intent.route,
        destChainType,
      );

      // Prepare reward struct
      const reward = {
        deadline: intent.reward.deadline,
        creator: AddressNormalizer.denormalize(
          intent.reward.creator,
          ChainType.EVM,
        ) as `0x${string}`,
        prover: AddressNormalizer.denormalize(
          intent.reward.prover,
          ChainType.EVM,
        ) as `0x${string}`,
        nativeAmount: intent.reward.nativeAmount,
        tokens: intent.reward.tokens.map((t) => ({
          token: AddressNormalizer.denormalize(
            t.token,
            ChainType.EVM,
          ) as `0x${string}`,
          amount: t.amount,
        })),
      };

      // Encode the function call
      const data = encodeFunctionData({
        abi: portalAbi,
        functionName: "publishAndFund",
        args: [
          intent.destination,
          ("0x" + routeEncoded.toString("hex")) as Hex,
          reward,
          false,
        ],
      });

      // Send transaction
      const hash = await walletClient.sendTransaction({
        to: portalAddress as Hex,
        data,
      });

      // Wait for transaction receipt
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === "success") {
        const [intentPublishEvent] = parseEventLogs({
          abi: portalAbi,
          strict: true,
          eventName: "IntentPublished",
          logs: receipt.logs,
        });

        return {
          success: true,
          transactionHash: hash,
          intentHash: intentPublishEvent.args.intentHash,
        };
      } else {
        return {
          success: false,
          error: "Transaction failed",
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || "Unknown error",
      };
    }
  }

  async getBalance(address: string, chainId?: bigint): Promise<bigint> {
    // Use the provided chainId to get the correct chain configuration
    // If no chainId is provided, default to mainnet (though this shouldn't happen in normal usage)
    const chain = chainId ? this.getChain(chainId) : chains.mainnet;

    const publicClient = createPublicClient({
      chain,
      transport: http(this.rpcUrl),
    });

    return await publicClient.getBalance({
      address: address as Hex,
    });
  }

  async validate(
    intent: Intent,
    senderAddress: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if sender has enough balance for reward native amount on the source chain
      const balance = await this.getBalance(
        senderAddress,
        intent.sourceChainId,
      );

      if (balance < intent.reward.nativeAmount) {
        return {
          valid: false,
          error: `Insufficient balance. Required: ${intent.reward.nativeAmount}, Available: ${balance}`,
        };
      }

      // TODO: Check token balances

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: error.message || "Validation failed",
      };
    }
  }

  private getChain(chainId: bigint) {
    const id = Number(chainId);

    // Find viem chain by ID
    const viemChain = Object.values(chains).find(
      (chain: any) => chain.id === id,
    );

    if (!viemChain) {
      throw new Error(
        `Chain ID ${id} is not supported. Please use a chain that exists in viem/chains. ` +
          `Popular chains include: Ethereum (1), Optimism (10), Base (8453), Arbitrum (42161), Polygon (137), BSC (56).`,
      );
    }

    return viemChain;
  }
}
