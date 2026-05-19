import { hyperEvm } from 'viem/chains';

import { ChainsService } from '@/blockchain/chains.service';
import { FeatureHypercoreCommand } from '@/cli/commands/feature-hypercore.command';
import { ChainConfig, ChainType } from '@/shared/types';

const HYPER_EVM_ID = BigInt(hyperEvm.id);

const HYPER_EVM: ChainConfig = {
  id: HYPER_EVM_ID,
  name: 'HyperEVM',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://rpc.hyperliquid.xyz/evm',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
};

const BASE: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

interface CommandFixture {
  command: FeatureHypercoreCommand;
  chains: ChainsService;
  prompt: { selectChain: jest.Mock };
  flow: { publish: jest.Mock };
}

function buildCommand(): CommandFixture {
  const chains = {
    resolveChain: jest.fn((nameOrId: string) =>
      nameOrId.toLowerCase() === 'hyperevm' ? HYPER_EVM : BASE
    ),
    listChains: jest.fn().mockReturnValue([BASE, HYPER_EVM]),
    getChainById: jest.fn((id: bigint) => {
      if (id === HYPER_EVM_ID) return HYPER_EVM;
      throw new Error(`unknown chain ${id}`);
    }),
  } as unknown as ChainsService;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt: any = { selectChain: jest.fn().mockResolvedValue(BASE) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const display: any = { title: () => undefined };
  const flow = { publish: jest.fn().mockResolvedValue(null) };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const command = new FeatureHypercoreCommand(chains, prompt, display, flow as any);
  return { command, chains, prompt, flow };
}

describe('FeatureHypercoreCommand', () => {
  it('publishes via hyperEVM with quoteDestinationChainIdOverride=1337', async () => {
    const { command, flow, chains } = buildCommand();
    await command.run([], { source: 'Base' });

    expect(chains.getChainById).toHaveBeenCalledWith(HYPER_EVM_ID);
    expect(flow.publish).toHaveBeenCalledTimes(1);
    const call = flow.publish.mock.calls[0][0] as {
      destChain: ChainConfig;
      overrides: { quoteDestinationChainIdOverride: bigint };
    };
    expect(call.destChain.id).toBe(HYPER_EVM_ID);
    expect(call.overrides.quoteDestinationChainIdOverride).toBe(1337n);
  });

  it('rejects HyperEVM as a source', async () => {
    const { command } = buildCommand();
    await expect(command.run([], { source: 'HyperEVM' })).rejects.toThrow(/cannot be a source/i);
  });

  it('excludes HyperEVM from the interactive source picker', async () => {
    const { command, prompt } = buildCommand();
    await command.run([], {});
    const choicesArg = prompt.selectChain.mock.calls[0][0] as ChainConfig[];
    expect(choicesArg.map(c => c.id)).not.toContain(HYPER_EVM_ID);
    expect(choicesArg.map(c => c.id)).toContain(8453n);
  });
});
