/**
 * Sentinel Engine
 *
 * Main orchestrator that runs the periodic route testing
 */

import { RouteMatrix } from './matrix';
import { Reporter } from './reporter';
import { RouteTester } from './tester';
import { RouteHealth, SentinelConfig } from './types';
import { WalletManager } from './wallet';

export class SentinelEngine {
  private config: SentinelConfig;
  private matrix: RouteMatrix;
  private tester: RouteTester;
  private reporter: Reporter;
  private running = false;
  private currentTimeout?: NodeJS.Timeout;

  constructor(config: SentinelConfig) {
    this.config = config;
    this.matrix = new RouteMatrix(config);
    const walletManager = new WalletManager(config);
    this.tester = new RouteTester(config, walletManager);
    this.reporter = new Reporter(config, this.matrix);
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.running = true;

    // Initialize route matrix
    const tokens = this.config.tokens.map(t => t.symbol);
    this.matrix.initialize(this.config.chains, tokens);

    // Start reporter
    this.reporter.start();

    // Run first cycle immediately
    await this.runCycle();

    // Schedule subsequent cycles
    this.scheduleNext();
  }

  async stop(): Promise<void> {
    this.running = false;

    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
    }

    this.reporter.stop();
    this.reporter.printFinalSummary();
  }

  private scheduleNext(): void {
    if (!this.running) return;

    this.currentTimeout = setTimeout(async () => {
      await this.runCycle();
      this.scheduleNext();
    }, this.config.scheduler.intervalMs);
  }

  private async runCycle(): Promise<void> {
    const routes = this.matrix.getRoutes();

    // Test routes based on parallelism
    if (this.config.execution.parallelism === 1) {
      // Sequential
      for (const route of routes) {
        if (!this.running) break;
        await this.testRoute(route);
      }
    } else {
      // Parallel with concurrency limit
      const chunks = this.chunk(routes, this.config.execution.parallelism);
      for (const chunk of chunks) {
        if (!this.running) break;
        await Promise.all(chunk.map(route => this.testRoute(route)));
      }
    }
  }

  private async testRoute(route: RouteHealth): Promise<void> {
    const tokenConfig = this.config.tokens.find(t => t.symbol === route.token);
    const amount = tokenConfig?.amount ?? '0.05';

    let lastError: string | undefined;

    // Retry logic
    for (let attempt = 0; attempt <= this.config.execution.retries.maxAttempts; attempt++) {
      if (!this.running) return;

      if (attempt > 0) {
        // Wait before retry
        await this.sleep(this.config.execution.retries.backoffMs * attempt);
      }

      const result = await this.tester.test(route.source, route.destination, route.token, amount);

      if (result.success) {
        const updatedRoute = this.matrix.updateFromResult(result);
        this.reporter.reportResult(result, updatedRoute);
        return;
      }

      lastError = result.error;
    }

    // All retries failed
    const failedResult = {
      source: route.source,
      destination: route.destination,
      token: route.token,
      success: false,
      error: lastError ?? 'Unknown error',
      publishTimeMs: 0,
      timestamp: new Date(),
    };

    const updatedRoute = this.matrix.updateFromResult(failedResult);
    this.reporter.reportResult(failedResult, updatedRoute);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
