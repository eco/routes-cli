/**
 * Pins the production Portal/prover defaults to the eco-routes v2.12 generation.
 *
 * These defaults feed the manual fallback (quote unavailable), the `--prover-type`
 * lookup and the portal prompt. A solver runs one Portal generation per chain, so an
 * intent published on an older Portal from here could never be filled.
 */

import { RAW_CHAIN_CONFIGS, RawChainConfig } from '@/blockchain/chains.config';
import { ChainType } from '@/shared/types';

const V2_12_PORTAL = '0xEC000769A73b70e16f361a442292500b3BCf4A85';
const V2_12_HYPER_PROVER = '0xEC08fb4647f3f50d1162a578d481266687C60fc5';
const V2_12_POLYMER_PROVER = '0xEC0DeD087Ee6C55991Bb4D4567ca1134c5353Ed6';

const PRE_V2_12_ADDRESSES = [
  '0x399Dbd5DF04f83103F77A58cBa2B7c4d3cdede97', // routes-ts 3.2 Portal
  '0xEC000064576f9C95a8623Bc0eff3db6d296ea6df', // fleet Portal
  '0xEC002CA16cE20c2a9F3C6200EF04E7d92a3dfBD8', // Arc Portal
  '0x0C4E3063239c9f4f323A956C79738916594D8Fd4', // LayerZero prover
  '0xec004Ab4870c4e177c66949329dCdb503CE41022', // HyperProver 2.10
  '0xE3e4e6F284f1c8E17bafE4268EB98c36886B4d8B', // PolymerProver
  'TT6jKgnBXoj7vZ7m2Yioq5mxTfrDpgir44', // Tron Portal
  'TLvVHqZZbs4Juf7umHYAepYgZkSdKxb649', // Tron PolymerProver
].map(a => a.toLowerCase());

function chain(id: bigint): RawChainConfig {
  const raw = RAW_CHAIN_CONFIGS.find(c => c.id === id);
  expect(raw).toBeDefined();
  return raw!;
}

describe('production v2.12 Portal/prover defaults', () => {
  it.each([
    ['Ethereum', 1n],
    ['Optimism', 10n],
    ['Polygon', 137n],
    ['Arc', 5042n],
    ['Arbitrum', 42161n],
  ])('%s (%s) uses the v2.12 Portal and HyperProver', (_name, id) => {
    const raw = chain(id);
    expect(raw.portalAddress).toBe(V2_12_PORTAL);
    expect(raw.provers).toEqual({ Hyperlane: V2_12_HYPER_PROVER });
  });

  it('Base uses the v2.12 Portal, HyperProver and the Tron-corridor PolymerProver', () => {
    const raw = chain(8453n);
    expect(raw.portalAddress).toBe(V2_12_PORTAL);
    expect(raw.provers).toEqual({ Hyperlane: V2_12_HYPER_PROVER, Polymer: V2_12_POLYMER_PROVER });
  });

  it('Tron uses the v2.12 Portal paired with the v2.12 PolymerProver', () => {
    const raw = chain(728126428n);
    expect(raw.portalAddress).toBe('TDYD42VmbScmqYkqG97aLgRN74Dqq9Fuva');
    expect(raw.provers).toEqual({ Polymer: 'TU42qLG4ixTZ56jYFVAke32DmTcEkiU4zv' });
  });

  const production = RAW_CHAIN_CONFIGS.filter(c => c.env === 'production');

  it.each(production.map(c => [c.name, c] as const))(
    '%s carries no pre-v2.12 Portal or prover and no LayerZero prover',
    (_name, raw) => {
      const addresses = [raw.portalAddress, ...Object.values(raw.provers ?? {})].filter(
        (a): a is string => a !== undefined
      );
      for (const address of addresses) {
        expect(PRE_V2_12_ADDRESSES).not.toContain(address.toLowerCase());
      }
      expect(raw.provers?.LayerZero).toBeUndefined();
    }
  );

  it('every production EVM Portal is the single v2.12 address', () => {
    const portals = new Set(
      production
        .filter(c => c.type === ChainType.EVM && c.portalAddress !== undefined)
        .map(c => c.portalAddress)
    );
    expect([...portals]).toEqual([V2_12_PORTAL]);
  });
});
