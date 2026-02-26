import { Injectable } from '@nestjs/common';

import { IntentStatus } from '@/blockchain/base.publisher';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { ChainConfig } from '@/shared/types';

export { IntentStatus };

@Injectable()
export class StatusService {
  constructor(private readonly publisherFactory: PublisherFactory) {}

  async getStatus(intentHash: string, chain: ChainConfig): Promise<IntentStatus> {
    const publisher = this.publisherFactory.create(chain);
    return publisher.getStatus(intentHash, chain.id);
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
