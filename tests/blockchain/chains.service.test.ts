import { ChainsService } from '@/blockchain/chains.service';
import { ChainConfig, ChainType } from '@/shared/types';

const HYPERCORE_ID = 1337n;
const HYPER_EVM_ID = 999n;

function makeChain(
  overrides: Partial<ChainConfig> & Pick<ChainConfig, 'id' | 'name'>
): ChainConfig {
  return {
    type: ChainType.EVM,
    env: 'production',
    rpcUrl: 'https://example.test',
    nativeCurrency: { name: 'Test', symbol: 'TST', decimals: 18 },
    ...overrides,
  };
}

function buildService(): ChainsService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config: any = { getChainsEnv: () => 'production' };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizer: any = { normalize: (addr: unknown) => addr };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const registry: any = { registerChainId: () => undefined };
  const service = new ChainsService(config, normalizer, registry);
  service.onModuleInit();
  return service;
}

describe('ChainsService — facade chain helpers', () => {
  const service = buildService();

  it('listSourceChains excludes facade chains', () => {
    const ids = service.listSourceChains().map(c => c.id);
    expect(ids).toContain(HYPER_EVM_ID);
    expect(ids).not.toContain(HYPERCORE_ID);
  });

  it('listChains still includes facade chains (for destination pickers)', () => {
    const ids = service.listChains().map(c => c.id);
    expect(ids).toContain(HYPERCORE_ID);
    expect(ids).toContain(HYPER_EVM_ID);
  });

  it('getOperationalChain is identity for non-facade chains', () => {
    const hyperEvm = service.getChainById(HYPER_EVM_ID);
    expect(service.getOperationalChain(hyperEvm)).toBe(hyperEvm);
  });

  it('getOperationalChain redirects facade chains to their target', () => {
    const hypercore = service.getChainById(HYPERCORE_ID);
    const op = service.getOperationalChain(hypercore);
    expect(op.id).toBe(HYPER_EVM_ID);
  });
});

describe('ChainsService.validateFacadeReferences', () => {
  it('passes for a clean configuration', () => {
    const chains: ChainConfig[] = [
      makeChain({ id: 1n, name: 'A' }),
      makeChain({ id: 2n, name: 'B', fulfillmentChainId: 1n }),
    ];
    expect(() => ChainsService.validateFacadeReferences(chains, 'production')).not.toThrow();
  });

  it('throws when fulfillmentChainId points at a missing chain', () => {
    const chains: ChainConfig[] = [makeChain({ id: 2n, name: 'Orphan', fulfillmentChainId: 999n })];
    expect(() => ChainsService.validateFacadeReferences(chains, 'production')).toThrow(
      /fulfillmentChainId 999.*not loaded/i
    );
  });

  it('throws on chained delegation (facade → facade)', () => {
    const chains: ChainConfig[] = [
      makeChain({ id: 1n, name: 'Real' }),
      makeChain({ id: 2n, name: 'B', fulfillmentChainId: 1n }),
      makeChain({ id: 3n, name: 'A', fulfillmentChainId: 2n }),
    ];
    expect(() => ChainsService.validateFacadeReferences(chains, 'production')).toThrow(
      /chained delegation is not supported/i
    );
  });
});
