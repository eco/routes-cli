import { Injectable } from '@nestjs/common';

import { IntentStatus } from '@/blockchain/base.publisher';
import { ChainsService } from '@/blockchain/chains.service';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { ChainConfig } from '@/shared/types';

export { IntentStatus };

@Injectable()
export class StatusService {
  constructor(
    private readonly publisherFactory: PublisherFactory,
    private readonly chainsService: ChainsService
  ) {}

  async getStatus(intentHash: string, chain: ChainConfig): Promise<IntentStatus> {
    // Facade chains (e.g. Hypercore) have no RPC of their own — redirect status
    // lookups to the operational chain. Forward the original chain's portal as
    // an override so a quote-supplied portal (set on the original chain) still
    // wins over the operational chain's default.
    const opChain = this.chainsService.getOperationalChain(chain);
    const publisher = this.publisherFactory.create(opChain);
    return publisher.getStatus(intentHash, opChain, chain.portalAddress);
  }

  async watch(
    intentHash: string,
    chain: ChainConfig,
    onUpdate: (status: IntentStatus) => void,
    options: { intervalMs?: number; timeoutMs?: number } = {}
  ): Promise<'fulfilled' | 'timeout'> {
    const { intervalMs = 10_000, timeoutMs } = options;
    const startTime = Date.now();
    let last: IntentStatus | null = null;

    while (true) {
      if (timeoutMs && Date.now() - startTime > timeoutMs) return 'timeout';

      const status = await this.getStatus(intentHash, chain);
      if (!last || status.fulfilled !== last.fulfilled) {
        onUpdate(status);
        last = status;
      }
      if (status.fulfilled) return 'fulfilled';

      await new Promise(r => setTimeout(r, intervalMs));
    }
  }
}
