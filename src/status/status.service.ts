import { Injectable } from '@nestjs/common';

import type { V1StatusEntry } from '@eco-foundation/api-schemas/v1/types';

import { IntentStatus } from '@/blockchain/base.publisher';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { GatewayEnv } from '@/config/config.service';
import { EcoApiClient } from '@/eco-api/eco-api.client';
import { ChainConfig } from '@/shared/types';

export { IntentStatus };

/** Gateway words meaning the destination leg executed. `settled` = claimed/withdrawn as well. */
const FULFILLED_STATES = new Set(['filled', 'settled']);

/** Map `GET /v1/intents/status` entries onto the CLI's IntentStatus for one intent hash. */
export function fromV1StatusEntries(entries: V1StatusEntry[], intentHash: string): IntentStatus {
  const wanted = intentHash.toLowerCase();
  const match =
    entries.find(e => (e.intentHashes ?? []).some(h => h.toLowerCase() === wanted)) ?? entries[0];
  if (!match) return { fulfilled: false, state: 'unknown' };
  return {
    fulfilled: FULFILLED_STATES.has(match.status),
    state: match.status,
    ...(match.destinationTx?.txHash && { fulfillmentTxHash: match.destinationTx.txHash }),
    ...(match.updatedAt != null && { timestamp: match.updatedAt }),
  };
}

export interface StatusLookupOptions {
  /** Eco API gateway environment (`--env`); overrides ECO_ENV. Ignored for on-chain lookups. */
  env?: GatewayEnv;
}

@Injectable()
export class StatusService {
  constructor(
    private readonly publisherFactory: PublisherFactory,
    private readonly ecoApi: EcoApiClient
  ) {}

  /** With a chain: on-chain Portal lookup (unchanged). Without one: the Eco API gateway. */
  async getStatus(
    intentHash: string,
    chain?: ChainConfig,
    opts: StatusLookupOptions = {}
  ): Promise<IntentStatus> {
    if (chain) {
      const publisher = this.publisherFactory.create(chain);
      return publisher.getStatus(intentHash, chain);
    }
    const entries = await this.ecoApi.intentStatus({ intentHash }, { env: opts.env });
    return fromV1StatusEntries(entries, intentHash);
  }

  async watch(
    intentHash: string,
    chain: ChainConfig | undefined,
    onUpdate: (status: IntentStatus) => void,
    options: { intervalMs?: number; timeoutMs?: number } & StatusLookupOptions = {}
  ): Promise<'fulfilled' | 'timeout'> {
    const { intervalMs = 10_000, timeoutMs, env } = options;
    const startTime = Date.now();
    let last: IntentStatus | null = null;

    while (true) {
      if (timeoutMs && Date.now() - startTime > timeoutMs) return 'timeout';

      const status = await this.getStatus(intentHash, chain, { env });
      if (!last || status.fulfilled !== last.fulfilled || status.state !== last.state) {
        onUpdate(status);
        last = status;
      }
      if (status.fulfilled) return 'fulfilled';

      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
}
