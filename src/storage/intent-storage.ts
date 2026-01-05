import * as fs from 'fs';
import * as path from 'path';

import { Hex } from 'viem';

import { Intent } from '@/core/interfaces/intent';

interface StoredIntent {
  intentHash: Hex;
  sourceChainId: bigint;
  destinationChainId: bigint;
  reward: Intent['reward'];
  encodedRoute: Hex;
  routeHash: Hex;
  publishedAt: string; // ISO timestamp
  transactionHash?: string;
  refunded?: boolean;
  refundedAt?: string;
}

export class IntentStorage {
  private readonly storageDir: string;
  private readonly storageFile: string;

  constructor() {
    // Store in user's home directory: ~/.routes-cli/intents.json
    this.storageDir = path.join(process.env.HOME || process.env.USERPROFILE || '.', '.routes-cli');
    this.storageFile = path.join(this.storageDir, 'intents.json');
    this.ensureStorageDir();
  }

  private ensureStorageDir(): void {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  private readIntents(): StoredIntent[] {
    if (!fs.existsSync(this.storageFile)) {
      return [];
    }
    const data = fs.readFileSync(this.storageFile, 'utf-8');
    return JSON.parse(data, (key, value) => {
      // Revive BigInt values
      if (typeof value === 'string' && /^\d+n$/.test(value)) {
        return BigInt(value.slice(0, -1));
      }
      return value;
    });
  }

  private writeIntents(intents: StoredIntent[]): void {
    const data = JSON.stringify(
      intents,
      (key, value) => {
        // Serialize BigInt values
        if (typeof value === 'bigint') {
          return value.toString() + 'n';
        }
        return value;
      },
      2
    );
    fs.writeFileSync(this.storageFile, data, 'utf-8');
  }

  saveIntent(intent: StoredIntent): void {
    const intents = this.readIntents();
    // Check if already exists
    const existingIndex = intents.findIndex(i => i.intentHash === intent.intentHash);
    if (existingIndex >= 0) {
      intents[existingIndex] = intent;
    } else {
      intents.push(intent);
    }
    this.writeIntents(intents);
  }

  getIntent(intentHash: Hex): StoredIntent | null {
    const intents = this.readIntents();
    return intents.find(i => i.intentHash === intentHash) || null;
  }

  markAsRefunded(intentHash: Hex, transactionHash: string): void {
    const intents = this.readIntents();
    const intent = intents.find(i => i.intentHash === intentHash);
    if (intent) {
      intent.refunded = true;
      intent.refundedAt = new Date().toISOString();
      intent.transactionHash = transactionHash;
      this.writeIntents(intents);
    }
  }

  listIntents(options?: { refunded?: boolean }): StoredIntent[] {
    const intents = this.readIntents();
    if (options?.refunded !== undefined) {
      return intents.filter(i => i.refunded === options.refunded);
    }
    return intents;
  }
}
