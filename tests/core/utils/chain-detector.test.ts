/**
 * Tests for ChainTypeDetector utility
 */

import { ChainTypeDetector } from '@/core/utils/chain-detector';
import { ChainType } from '@/core/interfaces/intent';

describe('ChainTypeDetector', () => {
  describe('detectFromAddress', () => {
    it('should detect EVM addresses', () => {
      const evmAddresses = [
        '0x1234567890123456789012345678901234567890',
        '0xA614f803B6FD780986A42c78Ec9c7f77e6DeD13C',
        '0x0000000000000000000000000000000000000000',
        '0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF',
      ];

      evmAddresses.forEach(address => {
        expect(ChainTypeDetector.detectFromAddress(address)).toBe(ChainType.EVM);
      });
    });

    it('should detect TVM addresses', () => {
      const tvmAddresses = [
        'TRX9Jv6xH2fqwPrPiLZNDjMbcNZj7VZx3S',
        'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // USDT on Tron
        'TLBaRhANQoJFTqre9Nf1mjuwNWjCJeYqUL',
        'TGDqQAqvHEHeZ2x8yZR1dm8uykeX9knpci',
      ];

      tvmAddresses.forEach(address => {
        expect(ChainTypeDetector.detectFromAddress(address)).toBe(ChainType.TVM);
      });
    });

    it('should detect SVM addresses', () => {
      const svmAddresses = [
        '11111111111111111111111111111112', // System Program
        'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC on Solana
        'So11111111111111111111111111111111111111112', // Wrapped SOL
        '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      ];

      svmAddresses.forEach(address => {
        expect(ChainTypeDetector.detectFromAddress(address)).toBe(ChainType.SVM);
      });
    });

    it('should detect Universal addresses as EVM by default', () => {
      const universalAddresses = [
        '0x0000000000000000000000001234567890123456789012345678901234567890',
        '0x000000000000000000000000A614f803B6FD780986A42c78Ec9c7f77e6DeD13C',
      ];

      universalAddresses.forEach(address => {
        expect(ChainTypeDetector.detectFromAddress(address)).toBe(ChainType.EVM);
      });
    });

    it('should throw error for invalid addresses', () => {
      const invalidAddresses = [
        '',
        '123',
        'invalid-address',
        '0x123', // Too short EVM address
        'T123', // Too short TVM address
        'xyz', // Invalid format
      ];

      invalidAddresses.forEach(address => {
        expect(() => {
          ChainTypeDetector.detectFromAddress(address);
        }).toThrow();
      });
    });
  });

  describe('isValidAddress', () => {
    it('should validate EVM addresses', () => {
      expect(
        ChainTypeDetector.isValidAddress(
          '0x1234567890123456789012345678901234567890',
          ChainType.EVM
        )
      ).toBe(true);
      expect(ChainTypeDetector.isValidAddress('0x123', ChainType.EVM)).toBe(false);
      expect(
        ChainTypeDetector.isValidAddress('1234567890123456789012345678901234567890', ChainType.EVM)
      ).toBe(false);
    });

    it('should validate TVM addresses', () => {
      expect(
        ChainTypeDetector.isValidAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', ChainType.TVM)
      ).toBe(true);
      expect(ChainTypeDetector.isValidAddress('TR7', ChainType.TVM)).toBe(false);
      expect(
        ChainTypeDetector.isValidAddress(
          '0x1234567890123456789012345678901234567890',
          ChainType.TVM
        )
      ).toBe(false);
    });

    it('should validate SVM addresses', () => {
      expect(
        ChainTypeDetector.isValidAddress('11111111111111111111111111111112', ChainType.SVM)
      ).toBe(true);
      expect(
        ChainTypeDetector.isValidAddress(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          ChainType.SVM
        )
      ).toBe(true);
      expect(ChainTypeDetector.isValidAddress('123', ChainType.SVM)).toBe(false);
      expect(
        ChainTypeDetector.isValidAddress(
          '0x1234567890123456789012345678901234567890',
          ChainType.SVM
        )
      ).toBe(false);
    });
  });
});
