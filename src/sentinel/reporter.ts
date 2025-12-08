/**
 * Sentinel Console Reporter
 */

import chalk from 'chalk';

import { logger } from '@/utils/logger';

import { RouteMatrix } from './matrix';
import { RouteHealth, SentinelConfig, TestResult } from './types';

export class Reporter {
  private config: SentinelConfig;
  private matrix: RouteMatrix;
  private summaryInterval?: NodeJS.Timeout;

  constructor(config: SentinelConfig, matrix: RouteMatrix) {
    this.config = config;
    this.matrix = matrix;
  }

  start(): void {
    if (!this.config.reporting.console.enabled) return;

    // Print initial status
    this.printHeader();

    // Schedule periodic summaries
    if (this.config.reporting.console.summaryIntervalMs > 0) {
      this.summaryInterval = setInterval(() => {
        this.printSummary();
      }, this.config.reporting.console.summaryIntervalMs);
    }
  }

  stop(): void {
    if (this.summaryInterval) {
      clearInterval(this.summaryInterval);
    }
  }

  private printHeader(): void {
    console.log('');
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan('  SENTINEL - Route Health Monitor'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('');
    console.log(chalk.dim(`  Environment: ${this.config.service.environment}`));
    console.log(chalk.dim(`  Chains: ${this.config.chains.join(', ')}`));
    console.log(chalk.dim(`  Tokens: ${this.config.tokens.map(t => t.symbol).join(', ')}`));
    console.log(chalk.dim(`  Interval: ${this.config.scheduler.intervalMs / 1000}s`));
    console.log('');

    const summary = this.matrix.getSummary();
    console.log(chalk.dim(`  Monitoring ${summary.total} routes`));
    console.log('');
  }

  reportResult(result: TestResult, route: RouteHealth): void {
    if (!this.config.reporting.console.enabled) return;
    if (!this.config.reporting.console.verbose) return;

    const statusIcon = this.getStatusIcon(route.status);
    const routeStr = `${result.source} → ${result.destination} (${result.token})`;

    if (result.success) {
      const timeStr = result.fulfillTimeMs
        ? `${(result.fulfillTimeMs / 1000).toFixed(1)}s`
        : `${(result.publishTimeMs / 1000).toFixed(1)}s (publish)`;
      console.log(`  ${statusIcon} ${chalk.green('✓')} ${routeStr} - ${timeStr}`);
    } else {
      const errorStr = result.error ? `: ${result.error}` : '';
      console.log(`  ${statusIcon} ${chalk.red('✗')} ${routeStr}${errorStr}`);
    }
  }

  printSummary(): void {
    if (!this.config.reporting.console.enabled) return;

    const summary = this.matrix.getSummary();
    const routes = this.matrix.getRoutes();

    console.log('');
    console.log(chalk.bold('─── Summary ───────────────────────────────────────────'));
    console.log(`  ${chalk.green('●')} Healthy: ${summary.healthy}`);
    console.log(`  ${chalk.yellow('●')} Degraded: ${summary.degraded}`);
    console.log(`  ${chalk.red('●')} Failed: ${summary.failed}`);
    console.log(`  ${chalk.gray('●')} Unknown: ${summary.unknown}`);
    console.log('');

    // Show failed/degraded routes
    const problemRoutes = routes.filter(r => r.status === 'failed' || r.status === 'degraded');
    if (problemRoutes.length > 0) {
      console.log(chalk.bold('  Problem Routes:'));
      for (const route of problemRoutes) {
        const icon = this.getStatusIcon(route.status);
        const routeStr = `${route.source} → ${route.destination} (${route.token})`;
        const errorStr = route.lastError ? ` - ${route.lastError}` : '';
        console.log(`    ${icon} ${routeStr}${errorStr}`);
      }
      console.log('');
    }

    console.log(chalk.dim(`  Last updated: ${new Date().toLocaleTimeString()}`));
    console.log('');
  }

  printFinalSummary(): void {
    if (!this.config.reporting.console.enabled) return;

    const routes = this.matrix.getRoutes();

    console.log('');
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(chalk.bold.cyan('  SENTINEL - Final Report'));
    console.log(chalk.bold.cyan('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log('');

    // Overall stats
    const totalTests = routes.reduce((acc, r) => acc + r.totalTests, 0);
    const totalSuccesses = routes.reduce((acc, r) => acc + r.totalSuccesses, 0);
    const totalFailures = routes.reduce((acc, r) => acc + r.totalFailures, 0);
    const successRate = totalTests > 0 ? ((totalSuccesses / totalTests) * 100).toFixed(1) : '0';

    console.log(`  Total Tests: ${totalTests}`);
    console.log(`  Successes: ${chalk.green(totalSuccesses)}`);
    console.log(`  Failures: ${chalk.red(totalFailures)}`);
    console.log(`  Success Rate: ${successRate}%`);
    console.log('');

    // Route breakdown
    const headers = ['Route', 'Status', 'Tests', 'Pass', 'Fail', 'Avg Time'];
    const rows = routes.map(r => [
      `${r.source} → ${r.destination}`,
      this.getStatusIcon(r.status) + ' ' + r.status,
      r.totalTests.toString(),
      r.totalSuccesses.toString(),
      r.totalFailures.toString(),
      r.avgFulfillTimeMs ? `${(r.avgFulfillTimeMs / 1000).toFixed(1)}s` : '-',
    ]);

    logger.displayTable(headers, rows);
    console.log('');
  }

  private getStatusIcon(status: string): string {
    switch (status) {
      case 'healthy':
        return chalk.green('●');
      case 'degraded':
        return chalk.yellow('●');
      case 'failed':
        return chalk.red('●');
      default:
        return chalk.gray('●');
    }
  }
}
