/**
 * Key Manager
 *
 * Provides secure key handling through a mutable Buffer that can be zeroized
 * after use, narrowing the window during which raw key material exists in memory.
 */

/**
 * A single-use wrapper around a private key string that stores the key in a
 * mutable Buffer. Calling `use()` passes the key to a function and immediately
 * zeroizes the buffer in a `finally` block, regardless of whether the function
 * succeeds or throws.
 *
 * For async publishers: the buffer is zeroized as soon as the synchronous part
 * of `fn` returns (i.e., when the first `await` is hit). Extract all key-derived
 * values (accounts, keypairs) synchronously at the start of `fn`.
 *
 * @example
 * ```typescript
 * const handle = new KeyHandle(rawPrivateKey);
 * const account = handle.use(key => privateKeyToAccount(key as Hex));
 * // handle.buffer is now zeroed — key no longer accessible via this handle
 * ```
 */
export class KeyHandle {
  private buffer: Buffer;

  constructor(key: string) {
    this.buffer = Buffer.from(key, 'utf8');
  }

  /**
   * Passes the key string to `fn` and zeroizes the internal buffer in a
   * `finally` block. After `use()` returns the buffer is always zeroed,
   * regardless of whether `fn` succeeds or throws.
   */
  use<T>(fn: (key: string) => T): T {
    try {
      return fn(this.buffer.toString('utf8'));
    } finally {
      this.buffer.fill(0);
    }
  }
}
