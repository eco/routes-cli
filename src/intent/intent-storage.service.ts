import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Intent } from '@/shared/types';
import { PublishResult } from '@/blockchain/base.publisher';

export interface StoredIntent {
  intentHash: string;
  sourceChainId: string;
  destChainId: string;
  reward: unknown;
  routeHash: string;
  publishedAt: number;
  refundedAt: number | null;
  transactionHash: string;
}

@Injectable()
export class IntentStorage {
  private readonly storePath = path.join(os.homedir(), '.routes-cli', 'intents.json');

  async save(intent: Intent, result: PublishResult): Promise<void> {
    const intents = await this.readAll();
    const entry: StoredIntent = {
      intentHash: result.intentHash ?? '',
      sourceChainId: intent.sourceChainId.toString(),
      destChainId: intent.destination.toString(),
      reward: intent.reward,
      routeHash: '',
      publishedAt: Math.floor(Date.now() / 1000),
      refundedAt: null,
      transactionHash: result.transactionHash ?? '',
    };
    intents.push(entry);
    await this.writeAll(intents);
  }

  async findByHash(intentHash: string): Promise<StoredIntent | null> {
    const intents = await this.readAll();
    return intents.find(i => i.intentHash === intentHash) ?? null;
  }

  async listAll(): Promise<StoredIntent[]> {
    return this.readAll();
  }

  async markRefunded(intentHash: string): Promise<void> {
    const intents = await this.readAll();
    const entry = intents.find(i => i.intentHash === intentHash);
    if (entry) {
      entry.refundedAt = Math.floor(Date.now() / 1000);
      await this.writeAll(intents);
    }
  }

  private async readAll(): Promise<StoredIntent[]> {
    try {
      const raw = await fs.readFile(this.storePath, 'utf8');
      return JSON.parse(raw, (_, v) => typeof v === 'string' && /^\d+n$/.test(v) ? BigInt(v.slice(0, -1)) : v);
    } catch {
      return [];
    }
  }

  private async writeAll(intents: StoredIntent[]): Promise<void> {
    await fs.mkdir(path.dirname(this.storePath), { recursive: true });
    await fs.writeFile(this.storePath, JSON.stringify(intents, (_, v) => typeof v === 'bigint' ? `${v}n` : v, 2));
  }
}
