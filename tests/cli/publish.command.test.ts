import { PublishCommand } from '@/cli/commands/publish.command';
import { ChainConfig, ChainType } from '@/shared/types';

const SOURCE: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};
const DEST: ChainConfig = { ...SOURCE, id: 10n, name: 'Optimism' };
const USDC = { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' };

interface CommandMocks {
  command: PublishCommand;
  flow: { publish: jest.Mock };
  tokenResolver: { resolve: jest.Mock };
  display: { setJsonMode: jest.Mock; title: jest.Mock };
}

function buildCommand(): CommandMocks {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chains: any = {
    listChains: () => [SOURCE, DEST],
    resolveChain: (nameOrId: string) => (nameOrId === 'base' ? SOURCE : DEST),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prompt: any = { selectChain: jest.fn() };
  const display = { setJsonMode: jest.fn(), title: jest.fn() };
  const flow = {
    publish: jest.fn().mockResolvedValue({
      dryRun: false,
      result: { success: true, intentHash: '0xhash', transactionHash: '0xtx' },
      intent: {},
      sourceChainId: 8453n,
      destinationChainId: 10n,
      recipient: '0xrecipient',
    }),
  };
  const tokenResolver = { resolve: jest.fn().mockReturnValue(USDC) };
  const command = new PublishCommand(
    chains,
    prompt,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    display as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    flow as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tokenResolver as any
  );
  return { command, flow, tokenResolver, display };
}

describe('PublishCommand flag wiring', () => {
  afterEach(() => jest.restoreAllMocks());

  it('builds overrides from token/amount flags and passes yes through', async () => {
    const m = buildCommand();
    await m.command.run([], {
      source: 'base',
      destination: 'optimism',
      routeToken: 'USDC',
      rewardToken: 'USDC',
      amount: '5',
      yes: true,
    });
    expect(m.tokenResolver.resolve).toHaveBeenCalledWith('USDC', DEST, {
      decimals: undefined,
      decimalsFlag: '--route-token-decimals',
    });
    expect(m.tokenResolver.resolve).toHaveBeenCalledWith('USDC', SOURCE, {
      decimals: undefined,
      decimalsFlag: '--reward-token-decimals',
    });
    const call = m.flow.publish.mock.calls[0][0];
    expect(call.overrides.rewardAmount).toBe(5_000_000n);
    expect(call.overrides.routeToken).toEqual(USDC);
    expect(call.options.yes).toBe(true);
  });

  it('rejects --amount without --reward-token', async () => {
    const m = buildCommand();
    await expect(
      m.command.run([], { source: 'base', destination: 'optimism', amount: '5' })
    ).rejects.toThrow(/--amount requires --reward-token/);
  });

  it('emits one JSON object on stdout with --json', async () => {
    const m = buildCommand();
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await m.command.run([], { source: 'base', destination: 'optimism', yes: true, json: true });
    expect(m.display.setJsonMode).toHaveBeenCalledWith(true);
    const payload = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(payload).toEqual({
      success: true,
      intentHash: '0xhash',
      transactionHash: '0xtx',
      sourceChainId: '8453',
      destinationChainId: '10',
      recipient: '0xrecipient',
    });
  });

  it('emits a JSON error and sets exitCode without throwing when --json fails', async () => {
    const m = buildCommand();
    m.flow.publish.mockRejectedValue(new Error('boom'));
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    await m.command.run([], { source: 'base', destination: 'optimism', json: true });
    const payload = JSON.parse(stdoutSpy.mock.calls[0][0] as string);
    expect(payload).toEqual({ success: false, error: 'boom' });
    expect(process.exitCode).toBe(1);
    process.exitCode = 0; // reset for the test runner
  });
});
