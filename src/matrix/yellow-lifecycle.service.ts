import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { Db, MongoClient } from 'mongodb';

export interface YellowBucket {
  index: number;
  intentHash: string;
  rewardAmount: string;
  destinationAmount?: string;
  expectedDestinationOutput: string;
}

export interface YellowLifecycleEvent {
  txHash?: string;
  chainId?: string;
  claimant?: string;
  rewardAmount?: string;
  blockNumber?: string;
  timestamp?: Date | string;
}

export interface YellowIntent {
  intentHash: string;
  quoteID?: string;
  status?: string;
  sourceChainId?: string | number;
  route?: {
    source?: string | number;
    destination?: string | number;
    tokens?: Array<{ token: string; amount: string }>;
  };
  reward?: {
    nativeAmount?: string;
    tokens?: Array<{ token: string; amount: string }>;
  };
  fundedEvent?: YellowLifecycleEvent;
  selectedEvent?: YellowLifecycleEvent;
  fulfilledEvent?: YellowLifecycleEvent;
  provenEvent?: YellowLifecycleEvent;
  withdrawnEvent?: YellowLifecycleEvent;
  lastError?: unknown;
}

export interface PromotedChild {
  bucket: YellowBucket;
  intent: YellowIntent;
}

export interface YellowLifecycleSnapshot {
  quoteID: string;
  parentIntentHash: string;
  parent: YellowIntent | null;
  promotedChild: PromotedChild | null;
  minimumDestinationAmount?: string;
  destinationAmount?: string;
  finalDestinationChainID?: number;
}

interface YellowQuote {
  quoteID: string;
  intentHash: string;
  destinationAmount?: string;
  minimumDestinationAmount?: string;
  finalDestinationChainID?: number;
  anyToAny?: { buckets: YellowBucket[] };
}

export function selectPromotedChild(
  buckets: YellowBucket[],
  intents: YellowIntent[]
): PromotedChild | null {
  for (const intent of intents) {
    if (!intent.fundedEvent && !intent.selectedEvent) continue;
    const bucket = buckets.find(candidate => candidate.intentHash === intent.intentHash);
    if (bucket) return { bucket, intent };
  }
  return null;
}

@Injectable()
export class YellowLifecycleService implements OnModuleDestroy {
  private client?: MongoClient;

  async getSnapshot(quoteID: string): Promise<YellowLifecycleSnapshot> {
    const db = await this.getDb();
    const quote = await db.collection<YellowQuote>('quotes').findOne(
      { quoteID },
      {
        projection: {
          _id: 0,
          quoteID: 1,
          intentHash: 1,
          destinationAmount: 1,
          minimumDestinationAmount: 1,
          finalDestinationChainID: 1,
          'anyToAny.buckets.index': 1,
          'anyToAny.buckets.intentHash': 1,
          'anyToAny.buckets.rewardAmount': 1,
          'anyToAny.buckets.destinationAmount': 1,
          'anyToAny.buckets.expectedDestinationOutput': 1,
        },
      }
    );

    if (!quote) throw new Error(`Yellow quote not found: ${quoteID}`);
    if (!quote.intentHash) throw new Error(`Yellow quote ${quoteID} has no parent intent hash`);
    if (!quote.anyToAny?.buckets.length) {
      throw new Error(`Yellow quote ${quoteID} is not a bucketed Any-to-Any quote`);
    }

    const intentProjection = {
      _id: 0,
      intentHash: 1,
      quoteID: 1,
      status: 1,
      sourceChainId: 1,
      route: 1,
      reward: 1,
      fundedEvent: 1,
      selectedEvent: 1,
      fulfilledEvent: 1,
      provenEvent: 1,
      withdrawnEvent: 1,
      lastError: 1,
    };
    const bucketHashes = quote.anyToAny.buckets.map(bucket => bucket.intentHash);
    const [parent, children] = await Promise.all([
      db
        .collection<YellowIntent>('intents')
        .findOne({ intentHash: quote.intentHash }, { projection: intentProjection }),
      db
        .collection<YellowIntent>('intents')
        .find({ intentHash: { $in: bucketHashes } }, { projection: intentProjection })
        .toArray(),
    ]);

    return {
      quoteID,
      parentIntentHash: quote.intentHash,
      parent,
      promotedChild: selectPromotedChild(quote.anyToAny.buckets, children),
      minimumDestinationAmount: quote.minimumDestinationAmount,
      destinationAmount: quote.destinationAmount,
      finalDestinationChainID: quote.finalDestinationChainID,
    };
  }

  async waitForDeliveredChild(
    quoteID: string,
    timeoutMs: number,
    intervalMs = 2_000
  ): Promise<YellowLifecycleSnapshot> {
    const deadline = Date.now() + timeoutMs;
    let snapshot = await this.getSnapshot(quoteID);
    while (Date.now() < deadline) {
      if (snapshot.promotedChild?.intent.fulfilledEvent) return snapshot;
      await new Promise(resolve => setTimeout(resolve, intervalMs));
      snapshot = await this.getSnapshot(quoteID);
    }
    return snapshot;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.close();
  }

  private async getDb(): Promise<Db> {
    const uri = process.env.YELLOW_MONGODB_URI;
    if (!uri) throw new Error('YELLOW_MONGODB_URI is required for settlement lifecycle checks');
    if (!this.client) {
      this.client = new MongoClient(uri);
      await this.client.connect();
    }
    return this.client.db(process.env.YELLOW_MONGODB_DB ?? 'ecosolver');
  }
}
