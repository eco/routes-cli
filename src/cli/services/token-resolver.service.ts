import { Injectable } from '@nestjs/common';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainRegistryService } from '@/blockchain/chain-registry.service';
import { TOKEN_CONFIGS } from '@/config/tokens.config';
import { RoutesCliError } from '@/shared/errors';
import { ChainConfig } from '@/shared/types';

import { TokenSelection } from './intent-publish-flow.service';

/**
 * Resolves a --route-token/--reward-token CLI value (symbol or raw address)
 * into the TokenSelection shape the publish flow consumes.
 * Returned addresses are chain-native (same contract as selectToken's prompt).
 */
@Injectable()
export class TokenResolverService {
  constructor(
    private readonly registry: ChainRegistryService,
    private readonly normalizer: AddressNormalizerService
  ) {}

  resolve(
    input: string,
    chain: ChainConfig,
    opts: { decimals?: number; decimalsFlag: string }
  ): TokenSelection {
    const symbol = input.toUpperCase();
    const token = TOKEN_CONFIGS[symbol];
    if (token) {
      const universal = token.addresses[chain.id.toString()];
      if (!universal) {
        throw RoutesCliError.configurationError(
          `Token ${symbol} is not configured on ${chain.name} (chain ${chain.id}). ` +
            `Configured chain IDs: ${Object.keys(token.addresses).join(', ')}.`
        );
      }
      return {
        address: this.normalizer.denormalize(universal, chain.type) as string,
        decimals: token.decimals,
        symbol: token.symbol,
      };
    }

    const handler = this.registry.get(chain.type);
    if (handler.validateAddress(input)) {
      if (opts.decimals === undefined) {
        throw RoutesCliError.configurationError(
          `Raw token address given but decimals are unknown. ` +
            `Pass ${opts.decimalsFlag} <n> alongside the address.`
        );
      }
      return { address: input, decimals: opts.decimals };
    }

    throw RoutesCliError.configurationError(
      `Token "${input}" is neither a known symbol ` +
        `(${Object.keys(TOKEN_CONFIGS).join(', ')}) nor a valid ${chain.type} address.`
    );
  }
}
