import config from '../../config/matrix-pairs-layerzero-interest.json';

const EXPECTED_ROUTES = [
  [
    'LZ-01',
    1399811149,
    1,
    '2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    6,
  ],
  [
    'LZ-03',
    9745,
    1,
    '0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    18,
  ],
  [
    'LZ-04',
    1,
    1399811149,
    '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    6,
  ],
  [
    'LZ-05',
    42161,
    1,
    '0x46850aD61C2B7d64d08c9C754F45254596696984',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    6,
  ],
  [
    'LZ-06',
    9745,
    1,
    '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    6,
  ],
  [
    'LZ-07',
    1399811149,
    1,
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    '0x0000000000000000000000000000000000000000',
    6,
  ],
  [
    'LZ-08',
    9745,
    1,
    '0x211Cc4DD073734dA055fbF44a2b4667d5E5fE5d2',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    18,
  ],
  [
    'LZ-09',
    1,
    1399811149,
    '0xe343167631d89B6Ffc58B88d6b7fB0228795491D',
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    6,
  ],
  [
    'LZ-11',
    1399811149,
    1,
    'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    6,
  ],
  [
    'LZ-12',
    1399811149,
    1,
    '2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    6,
  ],
  [
    'LZ-14',
    1399811149,
    1,
    'DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT',
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    9,
  ],
  [
    'LZ-23',
    42161,
    1,
    '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    '0x0000000000000000000000000000000000000000',
    6,
  ],
] as const;

describe('LayerZero interest matrix config', () => {
  it('contains exactly the approved routes and quote parameters', () => {
    expect(
      config.pairs.map(pair => [
        pair.id,
        pair.sourceChainId,
        pair.destinationChainId,
        pair.inputToken,
        pair.outputToken,
        pair.inputDecimals,
      ])
    ).toEqual(EXPECTED_ROUTES);
    expect(config.pairs).toHaveLength(12);
    expect(config.pairs.every(pair => pair.amount === '10')).toBe(true);
    expect(config.pairs.every(pair => pair.slippageBps === 50)).toBe(true);
    expect(config.pairs.some(pair => pair.id === 'LZ-02')).toBe(false);
  });

  it('uses only public quote actors for EVM and SVM routes', () => {
    expect(config.quoteActors).toEqual({
      evm: '0x62b2Ac83E0C8666d9bE4e75B99C0E96c822d23E1',
      svm: '3vvcFp6rUuTrrYK7SSqQKeYYiwvZXWmMnmgLfXDKgAu6',
    });
  });
});
