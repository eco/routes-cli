/**
 * Integration tests for chain configuration loading.
 *
 * Verifies that all chain configs have required fields, that lookup helpers
 * work correctly, and that portal address environment overrides are applied.
 */

import {
  CHAIN_CONFIGS,
  ChainConfig,
  getChainById,
  getChainByName,
  updatePortalAddresses,
} from '@/config/chains';
import { ConfigService } from '@/config/config-service';
import { ChainType } from '@/core/interfaces/intent';
import { isUniversalAddress } from '@/core/types/universal-address';

describe('Chain configuration', () => {
  // ── Required fields ──────────────────────────────────────────────────────────
  describe('required fields', () => {
    it('all chain configs have a BigInt id', () => {
      for (const chain of Object.values(CHAIN_CONFIGS)) {
        expect(typeof chain.id).toBe('bigint');
      }
    });

    it('all chain configs have a non-empty string name', () => {
      for (const chain of Object.values(CHAIN_CONFIGS)) {
        expect(typeof chain.name).toBe('string');
        expect(chain.name.length).toBeGreaterThan(0);
      }
    });

    it('all chain configs have a valid ChainType', () => {
      const validTypes = new Set<string>(Object.values(ChainType));
      for (const chain of Object.values(CHAIN_CONFIGS)) {
        expect(validTypes.has(chain.type)).toBe(true);
      }
    });

    it('all chain configs have an rpcUrl starting with http or https', () => {
      for (const chain of Object.values(CHAIN_CONFIGS)) {
        expect(chain.rpcUrl.startsWith('http://') || chain.rpcUrl.startsWith('https://')).toBe(
          true
        );
      }
    });

    it('portal addresses that exist are in universal address format', () => {
      for (const chain of Object.values(CHAIN_CONFIGS)) {
        if (chain.portalAddress !== undefined) {
          expect(isUniversalAddress(chain.portalAddress)).toBe(true);
        }
      }
    });

    it('each chain has a nativeCurrency with name, symbol, and numeric decimals', () => {
      for (const chain of Object.values(CHAIN_CONFIGS)) {
        expect(chain.nativeCurrency).toBeDefined();
        expect(typeof chain.nativeCurrency.name).toBe('string');
        expect(typeof chain.nativeCurrency.symbol).toBe('string');
        expect(typeof chain.nativeCurrency.decimals).toBe('number');
      }
    });
  });

  // ── getChainById ─────────────────────────────────────────────────────────────
  describe('getChainById()', () => {
    it('returns Ethereum for chain ID 1n', () => {
      const ethereum = getChainById(1n);
      expect(ethereum).toBeDefined();
      expect(ethereum?.name).toBe('Ethereum');
      expect(ethereum?.type).toBe(ChainType.EVM);
    });

    it('returns undefined for an unknown chain ID', () => {
      expect(getChainById(999999999999n)).toBeUndefined();
    });

    it('returns Tron for chain ID 728126428n', () => {
      const tron = getChainById(728126428n);
      expect(tron).toBeDefined();
      expect(tron?.type).toBe(ChainType.TVM);
    });

    it('returns Solana for chain ID 1399811149n', () => {
      const solana = getChainById(1399811149n);
      expect(solana).toBeDefined();
      expect(solana?.type).toBe(ChainType.SVM);
    });
  });

  // ── getChainByName ───────────────────────────────────────────────────────────
  describe('getChainByName()', () => {
    it('returns a chain for a lowercase key', () => {
      const base = getChainByName('base');
      expect(base).toBeDefined();
      expect(base?.id).toBe(8453n);
    });

    it('is case-insensitive: "BASE" and "Base" resolve to the same chain as "base"', () => {
      const lower = getChainByName('base');
      const upper = getChainByName('BASE');
      const mixed = getChainByName('Base');
      expect(upper).toEqual(lower);
      expect(mixed).toEqual(lower);
    });

    it('returns undefined for an unknown chain name', () => {
      expect(getChainByName('nonexistent-chain-xyz')).toBeUndefined();
    });

    it('resolves tron by name', () => {
      const tron = getChainByName('tron');
      expect(tron).toBeDefined();
      expect(tron?.type).toBe(ChainType.TVM);
    });
  });

  // ── Portal address env override ──────────────────────────────────────────────
  describe('updatePortalAddresses()', () => {
    let originalPortal: ChainConfig['portalAddress'];

    beforeEach(() => {
      originalPortal = CHAIN_CONFIGS['ethereum']?.portalAddress;
    });

    afterEach(() => {
      if (CHAIN_CONFIGS['ethereum']) {
        CHAIN_CONFIGS['ethereum'].portalAddress = originalPortal;
      }
    });

    it('sets portalAddress to universal format for a valid EVM address in env', () => {
      updatePortalAddresses({
        PORTAL_ADDRESS_ETH: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      });

      const portal = CHAIN_CONFIGS['ethereum']?.portalAddress;
      expect(portal).toBeDefined();
      expect(isUniversalAddress(portal!)).toBe(true);
    });

    it('does not throw when env var contains an invalid address — logs warning instead', () => {
      expect(() => {
        updatePortalAddresses({ PORTAL_ADDRESS_ETH: 'not-a-valid-address' });
      }).not.toThrow();
    });

    it('ignores env vars that do not map to any known chain', () => {
      const keysBefore = Object.keys(CHAIN_CONFIGS).sort();
      updatePortalAddresses({
        PORTAL_ADDRESS_NONEXISTENT: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      });
      expect(Object.keys(CHAIN_CONFIGS).sort()).toEqual(keysBefore);
    });
  });

  // ── ConfigService env override ───────────────────────────────────────────────
  describe('ConfigService.fromEnvironment() portal override', () => {
    const VALID_EVM = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    afterEach(() => {
      delete process.env['PORTAL_ADDRESS_ETH'];
      delete process.env['PORTAL_ADDRESS_BASE'];
    });

    it('applies PORTAL_ADDRESS_ETH when set', () => {
      process.env['PORTAL_ADDRESS_ETH'] = VALID_EVM;

      const svc = ConfigService.fromEnvironment();
      const eth = svc.getChain(1n);
      expect(eth?.portalAddress).toBeDefined();
      expect(isUniversalAddress(eth!.portalAddress!)).toBe(true);
    });

    it('does not mutate module-level CHAIN_CONFIGS when overriding portal address', () => {
      const originalEthPortal = CHAIN_CONFIGS['ethereum']?.portalAddress;
      process.env['PORTAL_ADDRESS_ETH'] = VALID_EVM;

      ConfigService.fromEnvironment();

      expect(CHAIN_CONFIGS['ethereum']?.portalAddress).toBe(originalEthPortal);
    });

    it('returns all production chains when no PORTAL_ADDRESS_* env vars are set', () => {
      const svc = ConfigService.fromEnvironment();
      expect(svc.getChain(1n)?.name).toBe('Ethereum');
    });
  });
});
