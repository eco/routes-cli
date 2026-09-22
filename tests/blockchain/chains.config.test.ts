/**
 * Tests for RAW_CHAIN_CONFIGS and ChainsService.resolveChain, focused on the
 * production EVM chains routes-cli publishes intents from/to.
 *
 * Covers:
 *  - the five newly-added production EVM chains (Unichain, World Chain,
 *    Plasma, Celo, Ink) resolve by both name and numeric id
 *  - every production EVM chain id in RAW_CHAIN_CONFIGS resolves to a real
 *    chain in `viem/chains` — this is exactly what EvmPublisher.getChain
 *    relies on at publish time, so a typo'd id would otherwise only surface
 *    as a runtime "Chain ID is not supported" error during a real publish.
 */
import * as viemChains from 'viem/chains';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainRegistryService } from '@/blockchain/chain-registry.service';
import { RAW_CHAIN_CONFIGS } from '@/blockchain/chains.config';
import { ChainsService } from '@/blockchain/chains.service';
import { EvmChainHandler } from '@/blockchain/evm/evm-chain-handler';
import { SvmChainHandler } from '@/blockchain/svm/svm-chain-handler';
import { TvmChainHandler } from '@/blockchain/tvm/tvm-chain-handler';
import { ChainType } from '@/shared/types';

function buildChainsService(): ChainsService {
  const registry = new ChainRegistryService();
  registry.bootstrap([new EvmChainHandler(), new TvmChainHandler(), new SvmChainHandler()]);
  const normalizer = new AddressNormalizerService(registry);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = { getChainsEnv: () => 'production' } as any;
  const service = new ChainsService(config, normalizer, registry);
  service.onModuleInit();
  return service;
}

describe('RAW_CHAIN_CONFIGS — new production EVM chains', () => {
  const NEW_CHAINS: Array<{ name: string; id: bigint }> = [
    { name: 'Unichain', id: 130n },
    { name: 'World Chain', id: 480n },
    { name: 'Plasma', id: 9745n },
    { name: 'Celo', id: 42220n },
    { name: 'Ink', id: 57073n },
  ];

  it.each(NEW_CHAINS)('registers $name ($id) as a production EVM chain', ({ name, id }) => {
    const raw = RAW_CHAIN_CONFIGS.find(c => c.id === id);
    expect(raw).toBeDefined();
    expect(raw?.name).toBe(name);
    expect(raw?.type).toBe(ChainType.EVM);
    expect(raw?.env).toBe('production');
    expect(raw?.rpcUrl).toMatch(/^https?:\/\//);
  });

  describe('ChainsService.resolveChain', () => {
    const service = buildChainsService();

    it.each(NEW_CHAINS)('resolves $name by numeric id', ({ name, id }) => {
      const chain = service.resolveChain(id.toString());
      expect(chain.name).toBe(name);
      expect(chain.id).toBe(id);
    });

    it.each(NEW_CHAINS)('resolves $name by name (case-insensitive)', ({ name, id }) => {
      const chain = service.resolveChain(name.toLowerCase());
      expect(chain.id).toBe(id);
    });
  });

  it('does not set portalAddress/provers for the new chains (Portal/prover come from the quote)', () => {
    for (const { id } of NEW_CHAINS) {
      const raw = RAW_CHAIN_CONFIGS.find(c => c.id === id);
      expect(raw?.portalAddress).toBeUndefined();
      expect(raw?.provers).toBeUndefined();
    }
  });
});

describe('every production EVM chain id is publishable by EvmPublisher', () => {
  // EvmPublisher.getChain first searches Object.values(chains) for a matching
  // numeric id; a chain missing from the installed viem version (e.g. Arc 5042
  // on viem 2.40) is built from RAW_CHAIN_CONFIGS via defineChain instead. Guard
  // both branches here rather than at publish time: an id must either exist in
  // viem/chains or carry everything the fallback needs to build a Chain.
  const viemChainIds = new Set<number>(
    Object.values(viemChains).map(c => Number((c as { id: number }).id))
  );

  const productionEvmConfigs = RAW_CHAIN_CONFIGS.filter(
    c => c.type === ChainType.EVM && c.env === 'production'
  );

  it.each(productionEvmConfigs.map(c => [c.name, c.id] as const))(
    '%s (%s) exists in viem/chains or is fully described for the config fallback',
    (_name, id) => {
      if (viemChainIds.has(Number(id))) return;
      const raw = RAW_CHAIN_CONFIGS.find(c => c.id === id)!;
      expect(raw.rpcUrl).toMatch(/^https?:\/\//);
      expect(raw.nativeCurrency.symbol).toBeTruthy();
      expect(raw.nativeCurrency.decimals).toBeGreaterThan(0);
    }
  );

  it('Arc (5042) is the only production EVM chain relying on the config fallback', () => {
    const fallbackOnly = productionEvmConfigs.filter(c => !viemChainIds.has(Number(c.id)));
    expect(fallbackOnly.map(c => c.id)).toEqual([5042n]);
  });
});
