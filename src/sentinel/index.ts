/**
 * Sentinel - Route Health Monitor
 *
 * Entry point for standalone service execution
 */

import { loadConfig } from './config';
import { SentinelEngine } from './engine';

export { loadConfig } from './config';
export { SentinelEngine } from './engine';
export { RouteMatrix } from './matrix';
export { Reporter } from './reporter';
export { RouteTester } from './tester';
export * from './types';
export { WalletManager } from './wallet';

/**
 * Start Sentinel as a standalone service
 */
export async function startSentinel(configPath?: string): Promise<void> {
  // Load config
  const config = loadConfig(configPath);

  // Create and start engine
  const engine = new SentinelEngine(config);

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\nShutting down Sentinel...');
    await engine.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Start
  await engine.start();
}

// If running directly (not imported)
if (require.main === module) {
  startSentinel().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
