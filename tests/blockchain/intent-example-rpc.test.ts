import { http } from 'viem';
import { optimism } from 'viem/chains';

import {
  IntentConfig,
  IntentCreator,
} from '@/scripts/evm-intent-simple/scripts/intent-creator-base';

jest.mock('viem', () => {
  const actual = jest.requireActual<typeof import('viem')>('viem');
  return { ...actual, http: jest.fn(actual.http) };
});

const config: IntentConfig = {
  privateKey: `0x${'11'.repeat(32)}`,
  sourceChain: optimism,
  destinationChain: optimism,
  sourceToken: '0x1111111111111111111111111111111111111111',
  destinationToken: '0x1111111111111111111111111111111111111111',
  rewardAmount: 1n,
  recipient: '0x1111111111111111111111111111111111111111',
};

describe('standalone intent examples require configured RPCs', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {};
    jest.clearAllMocks();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it('refuses missing configuration before validating the signing key', () => {
    expect(() => new IntentCreator({ ...config, privateKey: '0xinvalid' })).toThrow(
      /No RPC configured/
    );
    expect(http).not.toHaveBeenCalled();
  });

  it.each([optimism.rpcUrls.default.http[0], 'https://api.roninchain.com/rpc'])(
    'rejects a known public endpoint: %s',
    url => {
      process.env.EVM_RPC_URL_10 = url;
      expect(() => new IntentCreator(config)).toThrow(/Public RPC/);
    }
  );

  it('rejects malformed endpoints without revealing their value', () => {
    process.env.EVM_RPC_URL_10 = 'not-a-url/synthetic-secret';
    expect(() => new IntentCreator(config)).toThrow('Invalid RPC endpoint for OP Mainnet.');
  });

  it('constructs clients with a configured private endpoint without making requests', () => {
    process.env.EVM_RPC_URL_10 = 'https://optimism.private.example/rpc';
    expect(() => new IntentCreator(config)).not.toThrow();
    expect(http).toHaveBeenCalledTimes(2);
    expect(http).toHaveBeenCalledWith('https://optimism.private.example/rpc');
  });
});
