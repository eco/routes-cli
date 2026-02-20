/**
 * Integration tests for token configuration loading.
 *
 * Verifies that all token configs have required fields, that all addresses
 * are in universal address format, and that lookup helpers work correctly.
 */

import { ConfigService } from '@/config/config-service';
import { getTokenAddress, getTokenBySymbol, listTokens, TOKEN_CONFIGS } from '@/config/tokens';
import { isUniversalAddress } from '@/core/types/universal-address';

describe('Token configuration', () => {
  // ── Required fields ──────────────────────────────────────────────────────────
  describe('required fields', () => {
    it('all token configs have a non-empty string symbol', () => {
      for (const token of Object.values(TOKEN_CONFIGS)) {
        expect(typeof token.symbol).toBe('string');
        expect(token.symbol.length).toBeGreaterThan(0);
      }
    });

    it('all token configs have a non-empty string name', () => {
      for (const token of Object.values(TOKEN_CONFIGS)) {
        expect(typeof token.name).toBe('string');
        expect(token.name.length).toBeGreaterThan(0);
      }
    });

    it('all token configs have numeric decimals >= 0', () => {
      for (const token of Object.values(TOKEN_CONFIGS)) {
        expect(typeof token.decimals).toBe('number');
        expect(token.decimals).toBeGreaterThanOrEqual(0);
      }
    });

    it('all token configs have at least one address entry', () => {
      for (const token of Object.values(TOKEN_CONFIGS)) {
        expect(Object.keys(token.addresses).length).toBeGreaterThan(0);
      }
    });
  });

  // ── Universal address format ─────────────────────────────────────────────────
  describe('universal address format', () => {
    it('all token addresses normalize to universal address format (0x + 64 hex chars)', () => {
      for (const [symbol, token] of Object.entries(TOKEN_CONFIGS)) {
        for (const [chainId, address] of Object.entries(token.addresses)) {
          const valid = isUniversalAddress(address);
          if (!valid) {
            throw new Error(
              `${symbol} on chain ${chainId}: "${address}" is not a UniversalAddress`
            );
          }
        }
      }
    });

    it('USDC on Ethereum (chainId 1) is a valid universal address', () => {
      const addr = TOKEN_CONFIGS['USDC']?.addresses['1'];
      expect(addr).toBeDefined();
      expect(isUniversalAddress(addr!)).toBe(true);
    });

    it('USDC on Solana (chainId 1399811149) is a valid universal address', () => {
      const addr = TOKEN_CONFIGS['USDC']?.addresses['1399811149'];
      expect(addr).toBeDefined();
      expect(isUniversalAddress(addr!)).toBe(true);
    });

    it('USDT on Tron (chainId 728126428) is a valid universal address', () => {
      const addr = TOKEN_CONFIGS['USDT']?.addresses['728126428'];
      expect(addr).toBeDefined();
      expect(isUniversalAddress(addr!)).toBe(true);
    });
  });

  // ── getTokenBySymbol ─────────────────────────────────────────────────────────
  describe('getTokenBySymbol()', () => {
    it('returns USDC config for "USDC"', () => {
      const usdc = getTokenBySymbol('USDC');
      expect(usdc).toBeDefined();
      expect(usdc?.symbol).toBe('USDC');
      expect(usdc?.decimals).toBe(6);
    });

    it('returns USDT config for "USDT"', () => {
      const usdt = getTokenBySymbol('USDT');
      expect(usdt).toBeDefined();
      expect(usdt?.symbol).toBe('USDT');
    });

    it('returns undefined for an unknown symbol', () => {
      const result = getTokenBySymbol('NOTATOKEN');
      expect(result).toBeUndefined();
    });
  });

  // ── getTokenAddress ──────────────────────────────────────────────────────────
  describe('getTokenAddress()', () => {
    it('returns a universal address for USDC on Base (chainId 8453)', () => {
      const addr = getTokenAddress('USDC', 8453n);
      expect(addr).toBeDefined();
      expect(isUniversalAddress(addr!)).toBe(true);
    });

    it('returns undefined for a symbol that does not exist', () => {
      const addr = getTokenAddress('NOTATOKEN', 1n);
      expect(addr).toBeUndefined();
    });

    it('returns undefined for a chain where the token has no address', () => {
      // bUSDC is only on chain 56 (BNB Smart Chain)
      const addr = getTokenAddress('bUSDC', 1n);
      expect(addr).toBeUndefined();
    });

    it('returns the correct address for bUSDC on BNB Smart Chain (chainId 56)', () => {
      const addr = getTokenAddress('bUSDC', 56n);
      expect(addr).toBeDefined();
      expect(isUniversalAddress(addr!)).toBe(true);
    });
  });

  // ── listTokens ───────────────────────────────────────────────────────────────
  describe('listTokens()', () => {
    it('returns all configured tokens', () => {
      const tokens = listTokens();
      expect(tokens.length).toBeGreaterThanOrEqual(4); // USDC, USDT, bUSDC, bUSDT at minimum
    });

    it('returned tokens all have symbol, name, decimals, and addresses', () => {
      for (const token of listTokens()) {
        expect(token.symbol).toBeTruthy();
        expect(token.name).toBeTruthy();
        expect(typeof token.decimals).toBe('number');
        expect(typeof token.addresses).toBe('object');
      }
    });
  });

  // ── ConfigService token lookup ────────────────────────────────────────────────
  describe('ConfigService.getToken()', () => {
    it('returns USDC address on Ethereum via ConfigService', () => {
      const svc = ConfigService.fromEnvironment();
      const addr = svc.getToken('USDC', 1n);
      expect(addr).toBeDefined();
      expect(isUniversalAddress(addr!)).toBe(true);
    });

    it('returns undefined for unknown symbol via ConfigService', () => {
      const svc = ConfigService.fromEnvironment();
      const addr = svc.getToken('FAKECOIN', 1n);
      expect(addr).toBeUndefined();
    });

    it('returns undefined for chain where token has no address', () => {
      const svc = ConfigService.fromEnvironment();
      // bUSDC only exists on chain 56, not on Ethereum (1)
      const addr = svc.getToken('bUSDC', 1n);
      expect(addr).toBeUndefined();
    });
  });
});
