/**
 * Tests for AddressNormalizer utility
 *
 * Covers EVM, TVM, and SVM normalization / denormalization round-trips,
 * input validation, edge cases, and unsupported-chain error handling.
 */

import { ErrorCode, RoutesCliError } from '@/core/errors';
import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';

describe('AddressNormalizer', () => {
  // ── EVM ──────────────────────────────────────────────────────────────────────
  describe('EVM addresses', () => {
    // vitalik.eth — widely documented EIP-55 checksummed address
    const EVM_CHECKSUMMED = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const EVM_LOWERCASE = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';

    it('normalizes a checksummed EVM address to universal format (0x + 64 hex chars)', () => {
      const result = AddressNormalizer.normalize(EVM_CHECKSUMMED, ChainType.EVM);
      expect(result).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(result).toHaveLength(66);
    });

    it('normalizes a lowercase EVM address to the same universal address as its checksummed form', () => {
      // Both representations refer to the same account — universal must be identical
      const fromChecksummed = AddressNormalizer.normalize(EVM_CHECKSUMMED, ChainType.EVM);
      const fromLowercase = AddressNormalizer.normalize(EVM_LOWERCASE, ChainType.EVM);
      expect(fromChecksummed.toLowerCase()).toBe(fromLowercase.toLowerCase());
    });

    it('throws RoutesCliError with INVALID_ADDRESS for a malformed EVM address', () => {
      const bad = '0x123' as BlockchainAddress; // Too short
      expect(() => AddressNormalizer.normalize(bad, ChainType.EVM)).toThrow(RoutesCliError);
      expect(() => AddressNormalizer.normalize(bad, ChainType.EVM)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_ADDRESS })
      );
    });

    it('handles the EVM zero-address edge case', () => {
      const ZERO = '0x0000000000000000000000000000000000000000' as BlockchainAddress;
      const result = AddressNormalizer.normalize(ZERO, ChainType.EVM);
      expect(result).toMatch(/^0x[0-9a-fA-F]{64}$/);
      expect(result).toHaveLength(66);
    });

    it('denormalizes a universal address back to an EVM address', () => {
      const universal = AddressNormalizer.normalize(EVM_CHECKSUMMED, ChainType.EVM);
      const result = AddressNormalizer.denormalize(universal, ChainType.EVM);
      expect(result).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('round-trips EVM: normalize → denormalize returns the original address', () => {
      const universal = AddressNormalizer.normalize(EVM_CHECKSUMMED, ChainType.EVM);
      const back = AddressNormalizer.denormalize(universal, ChainType.EVM);
      expect(back.toLowerCase()).toBe(EVM_LOWERCASE);
    });
  });

  // ── TVM ──────────────────────────────────────────────────────────────────────
  describe('TVM addresses', () => {
    // USDT contract on Tron — well-known address with verifiable hex equivalent
    const TVM_BASE58 = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
    // Same address in Tron hex format (0x41 prefix, 21 bytes = 42 hex chars)
    const TVM_HEX = '0x41a614f803b6fd780986a42c78ec9c7f77e6ded13c';

    it('normalizes a base58 Tron address to universal format', () => {
      const result = AddressNormalizer.normalize(TVM_BASE58, ChainType.TVM);
      expect(result).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(result).toHaveLength(66);
    });

    it('normalizes a hex Tron address (0x41...) to the same universal address as its base58 form', () => {
      const fromBase58 = AddressNormalizer.normalize(TVM_BASE58, ChainType.TVM);
      const fromHex = AddressNormalizer.normalize(TVM_HEX, ChainType.TVM);
      expect(fromHex).toBe(fromBase58);
    });

    it('throws RoutesCliError with INVALID_ADDRESS for an invalid TVM address', () => {
      const bad = 'NOT_A_TRON_ADDRESS' as BlockchainAddress;
      expect(() => AddressNormalizer.normalize(bad, ChainType.TVM)).toThrow(RoutesCliError);
      expect(() => AddressNormalizer.normalize(bad, ChainType.TVM)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_ADDRESS })
      );
    });

    it('round-trips TVM: base58 normalize → denormalize returns the original address', () => {
      const universal = AddressNormalizer.normalize(TVM_BASE58, ChainType.TVM);
      const back = AddressNormalizer.denormalize(universal, ChainType.TVM);
      expect(back).toBe(TVM_BASE58);
    });
  });

  // ── SVM ──────────────────────────────────────────────────────────────────────
  describe('SVM addresses', () => {
    // Wrapped SOL mint address — a well-known 32-byte Solana public key
    const SVM_ADDR = 'So11111111111111111111111111111111111111112' as BlockchainAddress;

    it('normalizes a base58 Solana public key to universal format', () => {
      const result = AddressNormalizer.normalize(SVM_ADDR, ChainType.SVM);
      expect(result).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(result).toHaveLength(66);
    });

    it('throws RoutesCliError with INVALID_ADDRESS for an invalid base58 Solana address', () => {
      // '0' and 'I' are not in the base58 alphabet — will fail SvmAddressSchema
      const bad = '0InvalidSolanaAddress0000000000000000' as BlockchainAddress;
      expect(() => AddressNormalizer.normalize(bad, ChainType.SVM)).toThrow(RoutesCliError);
      expect(() => AddressNormalizer.normalize(bad, ChainType.SVM)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_ADDRESS })
      );
    });

    it('round-trips SVM: base58 normalize → denormalize returns the original address', () => {
      const universal = AddressNormalizer.normalize(SVM_ADDR, ChainType.SVM);
      const back = AddressNormalizer.denormalize(universal, ChainType.SVM);
      expect(back).toBe(SVM_ADDR);
    });
  });

  // ── Unsupported chain type ────────────────────────────────────────────────────
  describe('unsupported chain type', () => {
    const UNSUPPORTED = 99 as unknown as ChainType;
    // A universal address produced by normalizing a known lowercase EVM address
    const VALID_UNIVERSAL =
      '0x000000000000000000000000d8da6bf26964af9d7eed9e03e53415d37aa96045' as UniversalAddress;

    it('throws RoutesCliError with UNSUPPORTED_CHAIN on normalize', () => {
      expect(() =>
        AddressNormalizer.normalize('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', UNSUPPORTED)
      ).toThrow(RoutesCliError);
      expect(() =>
        AddressNormalizer.normalize('0xd8da6bf26964af9d7eed9e03e53415d37aa96045', UNSUPPORTED)
      ).toThrow(expect.objectContaining({ code: ErrorCode.UNSUPPORTED_CHAIN }));
    });

    it('throws RoutesCliError with UNSUPPORTED_CHAIN on denormalize', () => {
      expect(() => AddressNormalizer.denormalize(VALID_UNIVERSAL, UNSUPPORTED)).toThrow(
        RoutesCliError
      );
      expect(() => AddressNormalizer.denormalize(VALID_UNIVERSAL, UNSUPPORTED)).toThrow(
        expect.objectContaining({ code: ErrorCode.UNSUPPORTED_CHAIN })
      );
    });
  });

  // ── Static convenience methods ────────────────────────────────────────────────
  describe('static convenience methods', () => {
    // EVM-style universal address (zero-padded 20-byte address, digits only → no checksum ambiguity)
    const UNIVERSAL =
      '0x0000000000000000000000001234567890123456789012345678901234567890' as UniversalAddress;

    it('denormalizeToEvm returns a checksummed 20-byte EVM address', () => {
      const result = AddressNormalizer.denormalizeToEvm(UNIVERSAL);
      expect(result).toMatch(/^0x[0-9a-fA-F]{40}$/);
    });

    it('denormalizeToTvm returns a base58 Tron address starting with T', () => {
      const result = AddressNormalizer.denormalizeToTvm(UNIVERSAL);
      expect(result).toMatch(/^T[A-Za-z0-9]{33}$/);
    });

    it('denormalizeToSvm returns a base58-encoded Solana public key', () => {
      const result = AddressNormalizer.denormalizeToSvm(UNIVERSAL);
      expect(result).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });
});
