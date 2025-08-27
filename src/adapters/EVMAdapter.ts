import {
  Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  erc20Abi,
  getAbiItem,
  getCreate2Address,
  Hash,
  Hex,
  http,
  isAddress,
  keccak256,
  PublicClient,
  toHex,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { PortalAdapter } from './PortalAdapter.js';
import { ChainConfig, TokenTransferIntent } from '@/types';
import { portalAbi } from '@/constants/portal.abi';
import * as console from 'node:console';

export class EVMAdapter extends PortalAdapter {
  private publicClient: PublicClient;
  private walletClient: WalletClient;
  private portalAddress: Address;

  constructor(chain: ChainConfig, privateKey: string) {
    super();

    const account = privateKeyToAccount(privateKey as Hex);

    // Create chain configuration for viem
    const viemChain = {
      id: chain.vmConfig?.chainIdNumber || (chain.chainId as number),
      name: chain.name,
      nativeCurrency: chain.nativeCurrency,
      rpcUrls: {
        default: { http: [chain.rpcUrl] },
        public: { http: [chain.rpcUrl] },
      },
      blockExplorers: chain.blockExplorer
        ? {
            default: { name: 'Explorer', url: chain.blockExplorer },
          }
        : undefined,
    };

    this.publicClient = createPublicClient({
      chain: viemChain,
      transport: http(chain.rpcUrl),
    });

    this.walletClient = createWalletClient({
      account,
      chain: viemChain,
      transport: http(chain.rpcUrl),
    });

    this.portalAddress = chain.portalAddress as Address;
  }

  async publishIntent(intent: TokenTransferIntent): Promise<string> {
    try {
      // Check if account is available
      if (!this.walletClient.account) {
        throw new Error(
          'Wallet account not initialized. Please check your private key configuration.'
        );
      }

      // Approve all reward tokens before publishing
      for (const token of intent.reward.tokens) {
        await this.approveToken(token.token, this.portalAddress, token.amount);
      }

      const routeAbiItem = getAbiItem({ abi: portalAbi, name: 'fulfill' }).inputs[1];

      const route = {
        salt: intent.route.salt as Hex,
        deadline: intent.route.deadline,
        portal: intent.route.portal as Address,
        nativeAmount: BigInt(0), // Route doesn't require native amount for token transfers
        tokens: intent.route.requiredTokens.map((t) => ({
          token: t.token as Address,
          amount: t.amount,
        })),
        calls: intent.route.calls.map((c) => ({
          target: c.target as Address,
          data: c.callData as Hex,
          value: c.value,
        })),
      } as const;

      // Encode the route as bytes
      const routeBytes = encodeAbiParameters([routeAbiItem], [route]);

      // Create the Reward struct
      const rewardStruct = {
        deadline: intent.reward.deadline,
        creator: intent.reward.creator as Address,
        prover: intent.reward.prover as Address,
        nativeAmount: intent.reward.nativeValue,
        tokens: intent.reward.tokens.map((t) => ({
          token: t.token as Address,
          amount: t.amount,
        })),
      };

      // Destination as uint64
      const destination = BigInt(intent.destinationChainId);

      const _intent = { destination, route, reward: rewardStruct };
      console.log(
        'Intent: ',
        JSON.stringify(_intent, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
      );

      // Calculate total value to send (native reward value)
      const value = intent.reward.nativeValue;

      // First simulate the contract call to check for errors
      await this.publicClient.simulateContract({
        address: this.portalAddress,
        abi: portalAbi,
        functionName: 'publishAndFund',
        args: [destination, routeBytes, rewardStruct, false], // allowPartial = false
        account: this.walletClient.account.address,
        value,
      });

      // Execute the transaction
      const hash = await this.walletClient.writeContract({
        address: this.portalAddress,
        abi: portalAbi,
        functionName: 'publishAndFund',
        args: [destination, routeBytes, rewardStruct, false], // allowPartial = false
        value,
      });

      // Wait for transaction confirmation
      await this.publicClient.waitForTransactionReceipt({
        hash,
      });

      return hash;
    } catch (error) {
      throw new Error(
        `Failed to publish intent: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async getIntentStatus(_intentHash: string): Promise<boolean> {
    return false;
  }

  calculateVaultAddress(intentHash: string): string {
    // Use keccak256 to hash the intent hash for salt
    const salt = keccak256(intentHash as Address);

    // For demo purposes, we'll use a simplified vault address calculation
    // In reality, this would use the actual vault contract bytecode hash
    const vaultInitCodeHash = keccak256(toHex('VaultContract'));

    const vaultAddress = getCreate2Address({
      from: this.portalAddress,
      salt: salt as Hash,
      bytecodeHash: vaultInitCodeHash as Hash,
    });

    return vaultAddress;
  }

  validateAddress(address: string): boolean {
    return isAddress(address);
  }

  async getBalance(tokenAddress: string, walletAddress: string): Promise<bigint> {
    if (!isAddress(tokenAddress) || !isAddress(walletAddress)) {
      throw new Error('Invalid address format');
    }

    try {
      // Handle native ETH balance
      if (tokenAddress === '0x0000000000000000000000000000000000000000') {
        return await this.publicClient.getBalance({
          address: walletAddress as Address,
        });
      }

      // Handle ERC20 token balance
      const balance = await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [walletAddress as Address],
      });

      return balance as bigint;
    } catch (error) {
      throw new Error(
        `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async estimateGas(intent: TokenTransferIntent): Promise<bigint> {
    try {
      const gasEstimate = await this.publicClient.estimateContractGas({
        address: this.portalAddress,
        abi: portalAbi,
        functionName: 'publish',
        args: [intent as any], // Type assertion for demo purposes
        account: this.walletClient.account!.address,
      });

      return gasEstimate;
    } catch (error) {
      throw new Error(
        `Failed to estimate gas: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async approveToken(tokenAddress: string, spender: string, amount: bigint): Promise<void> {
    try {
      // First check if user has sufficient balance
      const balance = (await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [this.walletClient.account!.address],
      })) as bigint;

      if (balance < amount) {
        throw new Error(
          `Insufficient token balance. Required: ${amount.toString()}, Available: ${balance.toString()}`
        );
      }

      // Check current allowance
      const allowance = (await this.publicClient.readContract({
        address: tokenAddress as Address,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [this.walletClient.account!.address, spender as Address],
      })) as bigint;

      // Only approve if current allowance is insufficient
      if (allowance < amount) {
        const shortAddress = `${tokenAddress.slice(0, 6)}...${tokenAddress.slice(-4)}`;
        console.log(`\n📝 Approving token ${shortAddress} for Portal contract...`);

        // Simulate approval
        await this.publicClient.simulateContract({
          address: tokenAddress as Address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [spender as Address, amount],
          account: this.walletClient.account!.address,
        });

        // Execute approval
        const hash = await this.walletClient.writeContract({
          address: tokenAddress as Address,
          abi: erc20Abi,
          functionName: 'approve',
          args: [spender as Address, amount],
        });

        // Wait for confirmation
        await this.publicClient.waitForTransactionReceipt({ hash });
        console.log(`✅ Token approval confirmed!`);
      }
    } catch (error) {
      throw new Error(
        `Failed to approve token ${tokenAddress}: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }
}
