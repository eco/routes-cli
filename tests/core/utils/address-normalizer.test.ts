/**
 * Tests for AddressNormalizer utility
 */

import { ChainType } from '@/core/interfaces/intent';
import { BlockchainAddress } from '@/core/types/blockchain-addresses';
import { UniversalAddress } from '@/core/types/universal-address';
import { AddressNormalizer } from '@/core/utils/address-normalizer';

describe('AddressNormalizer', () => {
  describe('normalize', () => {
    it('should normalize EVM address to Universal Address', () => {
      const evmAddress = '0x1234567890123456789012345678901234567890';
      const result = AddressNormalizer.normalize(evmAddress, ChainType.EVM);

      expect(result).toBe('0x0000000000000000000000001234567890123456789012345678901234567890');
      expect(result.length).toBe(66); // 0x + 64 hex characters
    });

    it('should normalize TVM address to Universal Address', () => {
      const tvmAddress = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t'; // Valid USDT Tron address
      const result = AddressNormalizer.normalize(tvmAddress, ChainType.TVM);

      expect(result).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(result.length).toBe(66);
    });

    it('should normalize SVM address to Universal Address', () => {
      const svmAddress = '11111111111111111111111111111112' as BlockchainAddress; // System Program
      const result = AddressNormalizer.normalize(svmAddress, ChainType.SVM);

      expect(result).toMatch(/^0x[0-9a-f]{64}$/i);
      expect(result.length).toBe(66);
    });

    it('should handle already normalized Universal Address', () => {
      const evmAddress = '0x1234567890123456789012345678901234567890'; // Regular EVM address
      const result = AddressNormalizer.normalize(evmAddress, ChainType.EVM);

      expect(result).toBe('0x0000000000000000000000001234567890123456789012345678901234567890');
    });

    it('should throw error for invalid EVM address', () => {
      const invalidAddress = '0x123'; // Too short

      expect(() => {
        AddressNormalizer.normalize(invalidAddress, ChainType.EVM);
      }).toThrow();
    });
  });

  describe('denormalize', () => {
    it('should denormalize Universal Address to EVM address', () => {
      const universalAddress =
        '0x0000000000000000000000001234567890123456789012345678901234567890' as UniversalAddress;
      const result = AddressNormalizer.denormalize(universalAddress, ChainType.EVM);

      expect(result).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should denormalize Universal Address to TVM address', () => {
      // This test uses a known TVM address conversion
      const universalAddress =
        '0x000000000000000000000000a614f803b6fd780986a42c78ec9c7f77e6ded13c' as UniversalAddress;
      const result = AddressNormalizer.denormalize(universalAddress, ChainType.TVM);

      expect(result).toMatch(/^T[A-Za-z0-9]{33}$/); // TVM address format
    });

    it('should denormalize Universal Address to SVM address', () => {
      const universalAddress =
        '0x0000000000000000000000000000000000000000000000000000000000000001' as UniversalAddress;
      const result = AddressNormalizer.denormalize(universalAddress, ChainType.SVM);

      expect(result).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // Base58 format
    });

    it('should throw error for invalid Universal Address format', () => {
      const invalidAddress = 'invalid-address' as UniversalAddress; // Not hex format

      expect(() => {
        AddressNormalizer.denormalize(invalidAddress, ChainType.EVM);
      }).toThrow();
    });
  });

  describe('convenience methods', () => {
    const universalAddress =
      '0x0000000000000000000000001234567890123456789012345678901234567890' as UniversalAddress;

    it('should denormalize to EVM using convenience method', () => {
      const result = AddressNormalizer.denormalizeToEvm(universalAddress);
      expect(result).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should denormalize to TVM using convenience method', () => {
      const result = AddressNormalizer.denormalizeToTvm(universalAddress);
      expect(result).toMatch(/^T[A-Za-z0-9]{33}$/);
    });

    it('should denormalize to SVM using convenience method', () => {
      const result = AddressNormalizer.denormalizeToSvm(universalAddress);
      expect(result).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity in EVM round-trip', () => {
      const originalAddress = '0x1234567890123456789012345678901234567890';
      const normalized = AddressNormalizer.normalize(originalAddress, ChainType.EVM);
      const denormalized = AddressNormalizer.denormalize(normalized, ChainType.EVM);

      expect(denormalized.toLowerCase()).toBe(originalAddress.toLowerCase());
    });

    it('should maintain data integrity in SVM round-trip', () => {
      const originalAddress = '11111111111111111111111111111112' as BlockchainAddress; // System Program
      const normalized = AddressNormalizer.normalize(originalAddress, ChainType.SVM);
      const denormalized = AddressNormalizer.denormalize(normalized, ChainType.SVM);

      expect(denormalized).toBe(originalAddress);
    });
  });
});
