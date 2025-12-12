/**
 * Sentinel Route Matrix
 *
 * In-memory tracking of route health status
 */

import { RouteHealth, RouteStatus, SentinelConfig, TestResult } from './types';

export class RouteMatrix {
  private routes: Map<string, RouteHealth> = new Map();
  private config: SentinelConfig;

  constructor(config: SentinelConfig) {
    this.config = config;
  }

  private key(source: string, destination: string, token: string): string {
    return `${source}->${destination}:${token}`;
  }

  initialize(chains: string[], tokens: string[]): void {
    const excludeSet = new Set(
      (this.config.routes.exclude ?? []).map(e => `${e.source}->${e.destination}`)
    );

    for (const source of chains) {
      for (const destination of chains) {
        if (source === destination) continue;
        if (excludeSet.has(`${source}->${destination}`)) continue;

        for (const token of tokens) {
          const k = this.key(source, destination, token);
          this.routes.set(k, {
            source,
            destination,
            token,
            status: 'unknown',
            consecutiveFailures: 0,
            consecutiveSuccesses: 0,
            totalTests: 0,
            totalSuccesses: 0,
            totalFailures: 0,
          });
        }
      }
    }
  }

  getRoutes(): RouteHealth[] {
    return Array.from(this.routes.values());
  }

  getRoute(source: string, destination: string, token: string): RouteHealth | undefined {
    return this.routes.get(this.key(source, destination, token));
  }

  updateFromResult(result: TestResult): RouteHealth {
    const k = this.key(result.source, result.destination, result.token);
    const route = this.routes.get(k);

    if (!route) {
      throw new Error(`Unknown route: ${k}`);
    }

    route.lastCheck = result.timestamp;
    route.totalTests++;

    if (result.success) {
      route.consecutiveSuccesses++;
      route.consecutiveFailures = 0;
      route.totalSuccesses++;
      route.lastSuccess = result.timestamp;

      // Update avg fulfillment time
      if (result.fulfillTimeMs) {
        route.avgFulfillTimeMs = route.avgFulfillTimeMs
          ? (route.avgFulfillTimeMs + result.fulfillTimeMs) / 2
          : result.fulfillTimeMs;
      }
    } else {
      route.consecutiveFailures++;
      route.consecutiveSuccesses = 0;
      route.totalFailures++;
      route.lastFailure = result.timestamp;
      route.lastError = result.error;
    }

    // Update status based on thresholds
    route.status = this.computeStatus(route);

    return route;
  }

  private computeStatus(route: RouteHealth): RouteStatus {
    const { health } = this.config;

    if (route.consecutiveFailures >= health.failedAfterFailures) {
      return 'failed';
    }

    if (route.consecutiveFailures >= health.degradedAfterFailures) {
      return 'degraded';
    }

    if (route.consecutiveSuccesses >= health.healthyAfterSuccesses) {
      return 'healthy';
    }

    // Keep current status if thresholds not met
    if (route.status === 'unknown' && route.totalTests > 0) {
      return route.consecutiveFailures > 0 ? 'degraded' : 'healthy';
    }

    return route.status;
  }

  getSummary(): {
    total: number;
    healthy: number;
    degraded: number;
    failed: number;
    unknown: number;
  } {
    const routes = this.getRoutes();
    return {
      total: routes.length,
      healthy: routes.filter(r => r.status === 'healthy').length,
      degraded: routes.filter(r => r.status === 'degraded').length,
      failed: routes.filter(r => r.status === 'failed').length,
      unknown: routes.filter(r => r.status === 'unknown').length,
    };
  }
}
