/**
 * Pins the Arc mainnet (5042) chain + token configuration.
 *
 * Arc is Circle's L1: the native gas token is USDC (18 decimals at the native layer) and the
 * ERC-20 view of it is the 6-decimal precompile at 0x3600…0000. Since eco-routes v2.12 the
 * Portal and HyperProver sit at the same CREATE3 addresses as on every other v2.12 EVM chain.
 */

import { RAW_CHAIN_CONFIGS } from '@/blockchain/chains.config';
import { AddressNormalizer } from '@/blockchain/utils/address-normalizer';
import { TOKEN_CONFIGS } from '@/config/tokens.config';
import { ChainType, EvmAddress } from '@/shared/types';

const ARC_MAINNET_ID = 5042n;

describe('Arc mainnet (5042) configuration', () => {
  const arc = RAW_CHAIN_CONFIGS.find(c => c.id === ARC_MAINNET_ID);

  it('is a production EVM chain with USDC as the 18-decimal native currency', () => {
    expect(arc).toBeDefined();
    expect(arc!.env).toBe('production');
    expect(arc!.type).toBe(ChainType.EVM);
    expect(arc!.nativeCurrency).toEqual({ name: 'USDC', symbol: 'USDC', decimals: 18 });
  });

  it('points at the v2.12 Portal and HyperProver', () => {
    expect(arc!.portalAddress).toBe('0xEC000769A73b70e16f361a442292500b3BCf4A85');
    expect(arc!.provers).toEqual({ Hyperlane: '0xEC08fb4647f3f50d1162a578d481266687C60fc5' });
  });

  it('maps USDC on Arc to the native-backed ERC-20 precompile', () => {
    expect(TOKEN_CONFIGS.USDC.addresses['5042']).toBe(
      AddressNormalizer.normalizeEvm('0x3600000000000000000000000000000000000000' as EvmAddress)
    );
  });
});
