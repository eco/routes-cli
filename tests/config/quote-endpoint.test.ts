import { ConfigService as NestConfigService } from '@nestjs/config';

import { ConfigService } from '@/config/config.service';
import { EnvSchema } from '@/config/validation/env.schema';

function build(env: Record<string, string>): ConfigService {
  const parsed = EnvSchema.parse(env);
  return new ConfigService(new NestConfigService(parsed));
}

describe('ConfigService.getQuoteEndpoint — gateway default', () => {
  it('defaults to the production gateway when nothing is set', () => {
    expect(build({}).getQuoteEndpoint()).toEqual({
      type: 'gateway',
      baseUrl: 'https://api.eco.com',
      env: 'production',
    });
  });

  it('ECO_ENV=staging selects the staging gateway host', () => {
    expect(build({ ECO_ENV: 'staging' }).getQuoteEndpoint()).toMatchObject({
      type: 'gateway',
      baseUrl: 'https://api.stag.eco.com',
      env: 'staging',
    });
  });

  it('a per-command env override beats ECO_ENV', () => {
    expect(build({ ECO_ENV: 'production' }).getQuoteEndpoint('staging')).toMatchObject({
      baseUrl: 'https://api.stag.eco.com',
      env: 'staging',
    });
  });

  it('ECO_API_URL overrides the host and strips a trailing slash', () => {
    expect(build({ ECO_API_URL: 'https://gw.example.com/' }).getQuoteEndpoint()).toMatchObject({
      type: 'gateway',
      baseUrl: 'https://gw.example.com',
    });
  });

  it('carries ECO_API_KEY without exposing it anywhere else', () => {
    const cfg = build({ ECO_API_KEY: 'k-123' });
    expect(cfg.getQuoteEndpoint()).toMatchObject({ type: 'gateway', apiKey: 'k-123' });
    expect(cfg.getApiKey()).toBe('k-123');
  });

  it('SOLVER_URL still wins over everything', () => {
    expect(
      build({ SOLVER_URL: 'https://solver.example.com/', ECO_API_KEY: 'k' }).getQuoteEndpoint()
    ).toEqual({ type: 'solver-v2', url: 'https://solver.example.com/api/v2/quote/reverse' });
  });

  it('QUOTES_API_URL beats the gateway but not SOLVER_URL', () => {
    expect(
      build({
        QUOTES_API_URL: 'https://q.example.com/api/v3/quotes/single',
      }).getQuoteEndpoint()
    ).toEqual({ type: 'custom', url: 'https://q.example.com/api/v3/quotes/single' });
  });

  it('QUOTES_PREPROD still selects the preprod quote service', () => {
    expect(build({ QUOTES_PREPROD: 'true' }).getQuoteEndpoint()).toEqual({
      type: 'custom',
      url: 'https://quotes-preprod.eco.com/api/v3/quotes/single',
    });
  });

  it('rejects an unknown ECO_ENV at schema level', () => {
    expect(() => EnvSchema.parse({ ECO_ENV: 'prod' })).toThrow();
  });
});
