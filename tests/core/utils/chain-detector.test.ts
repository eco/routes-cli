/**
 * Tests for ChainTypeDetector utility
 */

import { ChainType } from '@/core/interfaces/intent';
import { ChainTypeDetector } from '@/core/utils/chain-detector';

describe('ChainTypeDetector', () => {
  describe('detect', () => {
    it('should detect EVM chain types from chain IDs', () => {
      const evmChainIds = [
        1, // Ethereum mainnet
        10, // Optimism
        137, // Polygon
        8453, // Base
        42161, // Arbitrum
      ];

      evmChainIds.forEach(chainId => {
        expect(ChainTypeDetector.detect(chainId)).toBe(ChainType.EVM);
      });
    });

    it('should detect TVM chain types from chain IDs', () => {
      const tvmChainIds = [
        728126428, // Tron mainnet
        2494104990, // Tron Shasta testnet
      ];

      tvmChainIds.forEach(chainId => {
        expect(ChainTypeDetector.detect(chainId)).toBe(ChainType.TVM);
      });
    });

    it('should detect SVM chain types from chain IDs', () => {
      const svmChainIds = [
        1399811149, // Solana mainnet
        1399811150, // Solana devnet
        1399811151, // Solana testnet
      ];

      svmChainIds.forEach(chainId => {
        expect(ChainTypeDetector.detect(chainId)).toBe(ChainType.SVM);
      });
    });

    it('should handle bigint chain identifiers', () => {
      const chainId = BigInt(1);
      expect(ChainTypeDetector.detect(chainId)).toBe(ChainType.EVM);
    });

    it('should throw error for string chain identifiers (deprecated)', () => {
      expect(() => {
        ChainTypeDetector.detect('ethereum');
      }).toThrow('String chain identifiers are deprecated');
    });

    it('should throw error for unknown chain IDs', () => {
      const unknownChainId = 5000000000; // Outside EVM range (> 2^32)
      expect(() => {
        ChainTypeDetector.detect(unknownChainId);
      }).toThrow('Cannot determine chain type for chain ID');
    });
  });

  describe('getAddressFormat', () => {
    it('should return correct format for EVM', () => {
      expect(ChainTypeDetector.getAddressFormat(ChainType.EVM)).toBe('hex (0x prefixed, 20 bytes)');
    });

    it('should return correct format for TVM', () => {
      expect(ChainTypeDetector.getAddressFormat(ChainType.TVM)).toBe('base58 (Tron format)');
    });

    it('should return correct format for SVM', () => {
      expect(ChainTypeDetector.getAddressFormat(ChainType.SVM)).toBe(
        'base58 (Solana format, 32 bytes)'
      );
    });

    it('should throw error for unknown chain type', () => {
      expect(() => {
        ChainTypeDetector.getAddressFormat('UNKNOWN' as ChainType);
      }).toThrow('Unknown chain type');
    });
  });

  describe('isValidAddressForChain', () => {
    it('should validate EVM addresses', () => {
      expect(
        ChainTypeDetector.isValidAddressForChain(
          '0x1234567890123456789012345678901234567890',
          ChainType.EVM
        )
      ).toBe(true);
      expect(ChainTypeDetector.isValidAddressForChain('0x123', ChainType.EVM)).toBe(false);
      expect(
        ChainTypeDetector.isValidAddressForChain(
          '1234567890123456789012345678901234567890',
          ChainType.EVM
        )
      ).toBe(false);
    });

    it('should validate TVM addresses', () => {
      expect(
        ChainTypeDetector.isValidAddressForChain(
          'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          ChainType.TVM
        )
      ).toBe(true);
      expect(ChainTypeDetector.isValidAddressForChain('TR7', ChainType.TVM)).toBe(false);
      expect(
        ChainTypeDetector.isValidAddressForChain(
          '0x1234567890123456789012345678901234567890',
          ChainType.TVM
        )
      ).toBe(false);
    });

    it('should validate SVM addresses', () => {
      expect(
        ChainTypeDetector.isValidAddressForChain('11111111111111111111111111111112', ChainType.SVM)
      ).toBe(true);
      expect(
        ChainTypeDetector.isValidAddressForChain(
          'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
          ChainType.SVM
        )
      ).toBe(true);
      expect(ChainTypeDetector.isValidAddressForChain('123', ChainType.SVM)).toBe(false);
      expect(
        ChainTypeDetector.isValidAddressForChain(
          '0x1234567890123456789012345678901234567890',
          ChainType.SVM
        )
      ).toBe(false);
    });
  });
});
