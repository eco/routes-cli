/**
 * Tests for quote service and solver-v2 integration
 */

import { getQuote } from '@/core/utils/quote';

// Mock fetch globally
global.fetch = jest.fn();

describe('Quote Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear environment variables
    delete process.env.SOLVER_URL;
    delete process.env.QUOTES_API_URL;
    delete process.env.QUOTES_PREPROD;
  });

  describe('URL Selection', () => {
    it('should use solver-v2 URL when SOLVER_URL is set', async () => {
      process.env.SOLVER_URL = 'https://solver.example.com';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponses: [
            {
              sourceChainID: 1,
              destinationChainID: 10,
              sourceToken: '0x1234567890123456789012345678901234567890',
              destinationToken: '0x1234567890123456789012345678901234567890',
              sourceAmount: '1000000000000000000',
              destinationAmount: '990000000000000000',
              funder: '0x1234567890123456789012345678901234567890',
              refundRecipient: '0x1234567890123456789012345678901234567890',
              recipient: '0x1234567890123456789012345678901234567890',
              encodedRoute: '0x',
              fees: [],
              deadline: 1735689600,
              estimatedFulfillTimeSec: 30,
            },
          ],
          contracts: {
            sourcePortal: '0x1234567890123456789012345678901234567890',
            prover: '0x1234567890123456789012345678901234567890',
            destinationPortal: '0x1234567890123456789012345678901234567890',
          },
        }),
      });

      await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://solver.example.com/api/v1/quotes',
        expect.any(Object)
      );
    });

    it('should use preprod quote service when QUOTES_PREPROD is set', async () => {
      process.env.QUOTES_PREPROD = '1';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            quoteResponse: {
              sourceChainID: 1,
              destinationChainID: 10,
              sourceToken: '0x1234567890123456789012345678901234567890',
              destinationToken: '0x1234567890123456789012345678901234567890',
              sourceAmount: '1000000000000000000',
              destinationAmount: '990000000000000000',
              funder: '0x1234567890123456789012345678901234567890',
              refundRecipient: '0x1234567890123456789012345678901234567890',
              recipient: '0x1234567890123456789012345678901234567890',
              encodedRoute: '0x',
              fees: [],
              deadline: 1735689600,
            },
            contracts: {
              sourcePortal: '0x1234567890123456789012345678901234567890',
              prover: '0x1234567890123456789012345678901234567890',
              destinationPortal: '0x1234567890123456789012345678901234567890',
            },
          },
        }),
      });

      await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://quotes-preprod.eco.com/api/v3/quotes/single',
        expect.any(Object)
      );
    });

    it('should use production quote service by default', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            quoteResponse: {},
            contracts: {
              sourcePortal: '0x1234567890123456789012345678901234567890',
              prover: '0x1234567890123456789012345678901234567890',
              destinationPortal: '0x1234567890123456789012345678901234567890',
            },
          },
        }),
      });

      await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://quotes.eco.com/api/v3/quotes/single',
        expect.any(Object)
      );
    });

    it('should remove trailing slash from SOLVER_URL', async () => {
      process.env.SOLVER_URL = 'https://solver.example.com/';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponses: [{}],
          contracts: {
            sourcePortal: '0x1234567890123456789012345678901234567890',
            prover: '0x1234567890123456789012345678901234567890',
            destinationPortal: '0x1234567890123456789012345678901234567890',
          },
        }),
      });

      await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://solver.example.com/api/v1/quotes',
        expect.any(Object)
      );
    });
  });

  describe('Request Format', () => {
    it('should send chain IDs as strings for solver-v2', async () => {
      process.env.SOLVER_URL = 'https://solver.example.com';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponses: [{}],
          contracts: {
            sourcePortal: '0x1234567890123456789012345678901234567890',
            prover: '0x1234567890123456789012345678901234567890',
            destinationPortal: '0x1234567890123456789012345678901234567890',
          },
        }),
      });

      await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(typeof requestBody.quoteRequest.sourceChainID).toBe('string');
      expect(typeof requestBody.quoteRequest.destinationChainID).toBe('string');
    });

    it('should send chain IDs as numbers for quote service', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            quoteResponse: {},
            contracts: {
              sourcePortal: '0x1234567890123456789012345678901234567890',
              prover: '0x1234567890123456789012345678901234567890',
              destinationPortal: '0x1234567890123456789012345678901234567890',
            },
          },
        }),
      });

      await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      const callArgs = (global.fetch as jest.Mock).mock.calls[0];
      const requestBody = JSON.parse(callArgs[1].body);

      expect(typeof requestBody.quoteRequest.sourceChainID).toBe('number');
      expect(typeof requestBody.quoteRequest.destinationChainID).toBe('number');
    });
  });

  describe('Response Handling', () => {
    it('should handle solver-v2 array response format', async () => {
      process.env.SOLVER_URL = 'https://solver.example.com';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponses: [
            {
              sourceChainID: 1,
              destinationChainID: 10,
              encodedRoute: '0xabcd',
              estimatedFulfillTimeSec: 30,
            },
          ],
          contracts: {
            sourcePortal: '0x1234567890123456789012345678901234567890',
            prover: '0x1234567890123456789012345678901234567890',
            destinationPortal: '0x1234567890123456789012345678901234567890',
          },
        }),
      });

      const result = await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      expect(result.quoteResponse).toBeDefined();
      expect(result.quoteResponse?.encodedRoute).toBe('0xabcd');
      expect(result.quoteResponse?.estimatedFulfillTimeSec).toBe(30);
    });

    it('should handle quote service wrapped response format', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            quoteResponse: {
              encodedRoute: '0xabcd',
            },
            contracts: {
              sourcePortal: '0x1234567890123456789012345678901234567890',
              prover: '0x1234567890123456789012345678901234567890',
              destinationPortal: '0x1234567890123456789012345678901234567890',
            },
          },
        }),
      });

      const result = await getQuote({
        source: 1n,
        destination: 10n,
        amount: 1000000000000000000n,
        funder: '0x1234567890123456789012345678901234567890',
        recipient: '0x1234567890123456789012345678901234567890',
        routeToken: '0x1234567890123456789012345678901234567890',
        rewardToken: '0x1234567890123456789012345678901234567890',
      });

      expect(result.quoteResponse).toBeDefined();
      expect(result.quoteResponse?.encodedRoute).toBe('0xabcd');
    });

    it('should throw error if solver-v2 returns empty quoteResponses', async () => {
      process.env.SOLVER_URL = 'https://solver.example.com';

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quoteResponses: [],
          contracts: {
            sourcePortal: '0x1234567890123456789012345678901234567890',
            prover: '0x1234567890123456789012345678901234567890',
            destinationPortal: '0x1234567890123456789012345678901234567890',
          },
        }),
      });

      await expect(
        getQuote({
          source: 1n,
          destination: 10n,
          amount: 1000000000000000000n,
          funder: '0x1234567890123456789012345678901234567890',
          recipient: '0x1234567890123456789012345678901234567890',
          routeToken: '0x1234567890123456789012345678901234567890',
          rewardToken: '0x1234567890123456789012345678901234567890',
        })
      ).rejects.toThrow('Invalid solver-v2 response: no quotes returned');
    });
  });
});
