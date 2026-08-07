import { PromptService } from '@/cli/services/prompt.service';
import { NonInteractiveError } from '@/shared/errors';
import { ChainConfig, ChainType } from '@/shared/types';

const CHAIN: ChainConfig = {
  id: 8453n,
  name: 'Base',
  type: ChainType.EVM,
  env: 'production',
  rpcUrl: 'https://mainnet.base.org',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry: any = {
  get: () => ({ validateAddress: () => true, getAddressFormat: () => 'hex' }),
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normalizer: any = { normalize: (a: string) => a, denormalize: (a: string) => a };

describe('PromptService non-TTY guard', () => {
  const service = new PromptService(registry, normalizer);
  const originalStdin = process.stdin.isTTY;
  const originalStdout = process.stdout.isTTY;

  const setTTY = (value: boolean): void => {
    Object.defineProperty(process.stdin, 'isTTY', { value, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value, configurable: true });
  };

  beforeEach(() => setTTY(false));
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { value: originalStdin, configurable: true });
    Object.defineProperty(process.stdout, 'isTTY', { value: originalStdout, configurable: true });
  });

  it('confirmPublish names --yes', async () => {
    await expect(service.confirmPublish()).rejects.toThrow(NonInteractiveError);
    await expect(service.confirmPublish()).rejects.toThrow(
      'Confirmation not specified. Pass --yes when running non-interactively.'
    );
  });

  it('confirm names --yes', async () => {
    await expect(service.confirm('proceed?')).rejects.toThrow('--yes');
  });

  it('selectToken names --<label>-token', async () => {
    await expect(service.selectToken(CHAIN, [], 'route')).rejects.toThrow(
      'Route token not specified. Pass --route-token <symbol|address> when running non-interactively.'
    );
    await expect(service.selectToken(CHAIN, [], 'reward')).rejects.toThrow('--reward-token');
  });

  it('inputAmount defaults to --amount and honors a custom hint', async () => {
    await expect(service.inputAmount('USDC', 6)).rejects.toThrow('--amount <value>');
    await expect(service.inputAmount('USDC', 6, '0.1', '--route-amount <value>')).rejects.toThrow(
      '--route-amount <value>'
    );
  });

  it('inputAddress names --<label>', async () => {
    await expect(service.inputAddress(CHAIN, 'recipient')).rejects.toThrow(
      'Recipient address not specified. Pass --recipient <address> when running non-interactively.'
    );
  });

  it('selectChain defaults to source/destination hint and honors a custom hint', async () => {
    await expect(service.selectChain([CHAIN], 'pick')).rejects.toThrow(
      '--source <chain> or --destination <chain>'
    );
    await expect(service.selectChain([CHAIN], 'pick', '--source <chain>')).rejects.toThrow(
      '--source <chain>'
    );
  });

  it('portal and prover prompts name their flags', async () => {
    await expect(service.inputManualPortal(CHAIN)).rejects.toThrow('--portal-address <address>');
    await expect(service.inputManualProver(CHAIN)).rejects.toThrow('--prover-address <address>');
    await expect(service.selectProver(CHAIN, CHAIN)).rejects.toThrow(
      '--prover-type <name> or --prover-address <address>'
    );
  });
});
