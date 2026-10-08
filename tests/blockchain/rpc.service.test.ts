import { ConfigService as NestConfigService } from '@nestjs/config';

import { ChainRegistryService } from '@/blockchain/chain-registry.service';
import { RAW_CHAIN_CONFIGS } from '@/blockchain/chains.config';
import { ChainsService } from '@/blockchain/chains.service';
import { EvmPublisher } from '@/blockchain/evm/evm.publisher';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { RpcService } from '@/blockchain/rpc.service';
import { ConfigService } from '@/config/config.service';
import { EnvSchema } from '@/config/validation/env.schema';
import { ChainConfig, ChainType } from '@/shared/types';

jest.mock('@/blockchain/evm/evm.publisher');

const ronin = RAW_CHAIN_CONFIGS.find(chain => chain.id === 2020n)! as ChainConfig;

function service(env: Record<string, string> = {}): RpcService {
  return new RpcService(new ConfigService(new NestConfigService(EnvSchema.parse(env))));
}

describe('RPC selection never silently uses public endpoints', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = {};
    jest.clearAllMocks();
  });
  afterEach(() => {
    process.env = originalEnv;
  });

  it.each(RAW_CHAIN_CONFIGS)('requires an operator endpoint for $name', raw => {
    expect(() => service().getUrl(raw as ChainConfig)).toThrow(/RPC.*configured/i);
  });

  it('uses the configured Ronin endpoint instead of the catalog public default', () => {
    process.env.EVM_RPC_URL_2020 = 'https://ronin.private.example/rpc';
    expect(service().getUrl(ronin)).toBe('https://ronin.private.example/rpc');
  });

  it('blocks Ronin publisher construction before a network client exists', () => {
    const factory = new PublisherFactory(
      {} as ChainRegistryService,
      service(),
      {} as ChainsService
    );
    expect(() => factory.create(ronin)).toThrow(/No RPC configured for Ronin/);
    expect(EvmPublisher).not.toHaveBeenCalled();
  });

  it('constructs the publisher with the operator endpoint', () => {
    process.env.EVM_RPC_URL_2020 = 'https://ronin.private.example/rpc';
    const registry = {} as ChainRegistryService;
    const chains = {} as ChainsService;
    new PublisherFactory(registry, service(), chains).create(ronin);
    expect(EvmPublisher).toHaveBeenCalledTimes(1);
    expect(EvmPublisher).toHaveBeenCalledWith(
      'https://ronin.private.example/rpc',
      registry,
      chains
    );
  });

  it.each([
    [ChainType.EVM, 'EVM_RPC_URL'],
    [ChainType.SVM, 'SVM_RPC_URL'],
    [ChainType.TVM, 'TVM_RPC_URL'],
  ])('uses an explicit private primary for %s', (type, variable) => {
    expect(
      service({ [variable]: 'https://dedicated.example/rpc' }).getUrl({ ...ronin, type })
    ).toBe('https://dedicated.example/rpc');
  });

  it('prefers the per-chain endpoint over the EVM-wide endpoint', () => {
    process.env.EVM_RPC_URL_2020 = 'https://ronin.private.example/rpc';
    expect(service({ EVM_RPC_URL: 'https://evm.private.example/rpc' }).getUrl(ronin)).toBe(
      'https://ronin.private.example/rpc'
    );
  });

  it('rejects an empty per-chain value without falling back to the catalog', () => {
    process.env.EVM_RPC_URL_2020 = '   ';
    expect(() => service().getUrl(ronin)).toThrow(/RPC.*configured/i);
  });

  it('rejects known public RPCs even when explicitly configured', () => {
    process.env.EVM_RPC_URL_2020 = ronin.rpcUrl;
    expect(() => service().getUrl(ronin)).toThrow(/public RPC/i);
  });

  it('rejects a public host with a trailing DNS dot or query', () => {
    const publicUrl = new URL(ronin.rpcUrl);
    publicUrl.hostname += '.';
    publicUrl.search = '?key=synthetic-secret';
    process.env.EVM_RPC_URL_2020 = publicUrl.toString();
    expect(() => service().getUrl(ronin)).toThrow(/public RPC/i);
  });

  it('does not expose credentials in invalid endpoint errors', () => {
    process.env.EVM_RPC_URL_2020 = 'not-a-url/secret-provider-key';
    try {
      service().getUrl(ronin);
      throw new Error('endpoint was accepted');
    } catch (error) {
      expect(String(error)).toMatch(/invalid RPC/i);
      expect(String(error)).not.toContain('secret-provider-key');
    }
  });

  it.each([ChainType.EVM, ChainType.SVM, ChainType.TVM])(
    'does not create an implicit secondary endpoint for %s',
    type => {
      expect(service().getFallbackUrl({ ...ronin, type })).toBeUndefined();
    }
  );

  it('retains an explicit private secondary endpoint', () => {
    expect(
      service({ SVM_RPC_URL_2: 'https://solana.private.example/rpc' }).getFallbackUrl({
        ...ronin,
        type: ChainType.SVM,
      })
    ).toBe('https://solana.private.example/rpc');
  });

  it('rejects an explicitly configured public secondary endpoint', () => {
    expect(() =>
      service({ SVM_RPC_URL_2: 'https://solana.publicnode.com' }).getFallbackUrl({
        ...ronin,
        type: ChainType.SVM,
      })
    ).toThrow(/public RPC/i);
  });
});
