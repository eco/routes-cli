/**
 * A single-use wrapper around a private key string.
 *
 * Calling use() or useAsync() passes the key to a function and immediately
 * zeroizes the internal buffer in a finally block, regardless of success or failure.
 *
 * use()      — synchronous; buffer zeroed after fn() returns
 * useAsync() — async-safe; buffer zeroed after the returned Promise settles
 */
export class KeyHandle {
  private buffer: Buffer;

  constructor(key: string) {
    this.buffer = Buffer.from(key, 'utf8');
  }

  /**
   * Synchronous variant. Use for deriving wallet addresses or other
   * synchronous key operations. Buffer is zeroed before any async work begins.
   */
  use<T>(fn: (key: string) => T): T {
    try {
      return fn(this.buffer.toString('utf8'));
    } finally {
      this.buffer.fill(0);
    }
  }

  /**
   * Async-safe variant. Buffer is zeroed only after the promise resolves or rejects.
   * Use this when the key needs to survive through async operations (e.g. publisher.publish).
   */
  async useAsync<T>(fn: (key: string) => Promise<T>): Promise<T> {
    try {
      return await fn(this.buffer.toString('utf8'));
    } finally {
      this.buffer.fill(0);
    }
  }
}
