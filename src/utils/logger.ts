/**
 * Logger utility module for enhanced CLI output
 * Uses ora for spinners and cli-table3 for structured data display
 */

import chalk from 'chalk';
import ora, { Ora } from 'ora';
import Table from 'cli-table3';

export class Logger {
  private activeSpinner: Ora | null = null;

  /**
   * Create and start a new spinner
   */
  spinner(text: string): Ora {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
    }
    this.activeSpinner = ora({
      text,
      spinner: 'dots'
    }).start();
    return this.activeSpinner;
  }

  /**
   * Update spinner text
   */
  updateSpinner(text: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.text = text;
    }
  }

  /**
   * Success message with spinner
   */
  succeed(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.succeed(text);
      this.activeSpinner = null;
    } else {
      console.log(chalk.green(`✓ ${text}`));
    }
  }

  /**
   * Failure message with spinner
   */
  fail(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.fail(text);
      this.activeSpinner = null;
    } else {
      console.log(chalk.red(`✗ ${text}`));
    }
  }

  /**
   * Warning message with spinner
   */
  warn(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.warn(text);
      this.activeSpinner = null;
    } else {
      console.log(chalk.yellow(`⚠ ${text}`));
    }
  }

  /**
   * Info message with spinner
   */
  info(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.info(text);
      this.activeSpinner = null;
    } else {
      console.log(chalk.blue(`ℹ ${text}`));
    }
  }

  /**
   * Stop spinner without message
   */
  stopSpinner(): void {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
      this.activeSpinner = null;
    }
  }

  /**
   * Success message (no spinner)
   */
  success(message: string): void {
    console.log(chalk.green(`✅ ${message}`));
  }

  /**
   * Error message (no spinner)
   */
  error(message: string): void {
    console.log(chalk.red(`❌ ${message}`));
  }

  /**
   * Warning message (no spinner)
   */
  warning(message: string): void {
    console.log(chalk.yellow(`⚠️  ${message}`));
  }

  /**
   * Info message (no spinner)
   */
  log(message: string): void {
    console.log(chalk.gray(message));
  }

  /**
   * Title/header message
   */
  title(message: string): void {
    console.log(chalk.blue.bold(`\n${message}\n`));
  }

  /**
   * Section header
   */
  section(message: string): void {
    console.log(chalk.blue(`\n${message}`));
  }

  /**
   * Create a table for displaying data
   */
  table(options?: any): Table.Table {
    return new Table(options || {
      head: [],
      colWidths: [],
      style: {
        head: ['cyan'],
        border: ['gray']
      }
    });
  }

  /**
   * Display a simple key-value table
   */
  displayKeyValue(data: Record<string, any>, title?: string): void {
    if (title) {
      this.section(title);
    }

    const table = this.table({
      colWidths: [25, 70],
      wordWrap: false
    });

    Object.entries(data).forEach(([key, value]) => {
      table.push([
        chalk.yellow(key),
        chalk.white(String(value))
      ]);
    });

    console.log(table.toString());
  }

  /**
   * Display a data table with headers
   */
  displayTable(headers: string[], rows: any[][], options?: any): void {
    const table = this.table({
      head: headers.map(h => chalk.cyan(h)),
      ...options
    });

    rows.forEach(row => {
      table.push(row.map(cell => String(cell)));
    });

    console.log(table.toString());
  }

  /**
   * Display transaction result
   */
  displayTransactionResult(result: {
    success: boolean;
    transactionHash?: string;
    intentHash?: string;
    vaultAddress?: string;
    error?: string;
  }): void {
    if (result.success) {
      this.success('Intent published successfully!');
      
      const data: Record<string, any> = {};
      if (result.transactionHash) data['Transaction Hash'] = result.transactionHash;
      if (result.intentHash) data['Intent Hash'] = result.intentHash;
      if (result.vaultAddress) data['Vault Address'] = result.vaultAddress;
      
      if (Object.keys(data).length > 0) {
        this.displayKeyValue(data, '📋 Transaction Details');
      }
    } else {
      this.error(`Publishing failed: ${result.error || 'Unknown error'}`);
    }
  }

  /**
   * Display intent summary
   */
  displayIntentSummary(summary: {
    source: string;
    destination: string;
    creator: string;
    routeDeadline: string;
    rewardDeadline: string;
    routeToken: string;
    routeAmount: string;
    rewardToken: string;
    rewardAmount: string;
  }): void {
    this.section('📋 Intent Summary');
    
    const table = this.table({
      colWidths: [25, 55],
      wordWrap: true
    });

    table.push(
      [chalk.yellow('Source'), summary.source],
      [chalk.yellow('Destination'), summary.destination],
      [chalk.yellow('Creator'), summary.creator],
      [chalk.yellow('Route Deadline'), summary.routeDeadline],
      [chalk.yellow('Reward Deadline'), summary.rewardDeadline],
      ['', ''],
      [chalk.cyan('Route Token'), summary.routeToken],
      [chalk.cyan('Route Amount'), summary.routeAmount],
      ['', ''],
      [chalk.green('Reward Token'), summary.rewardToken],
      [chalk.green('Reward Amount'), summary.rewardAmount]
    );

    console.log(table.toString());
  }

  /**
   * Progress bar for multiple steps
   */
  createProgressTracker(steps: string[]): {
    next: (message?: string) => void;
    complete: () => void;
    fail: (error: string) => void;
  } {
    let currentStep = 0;
    const totalSteps = steps.length;
    
    const updateProgress = () => {
      const progress = `[${currentStep}/${totalSteps}]`;
      const currentStepName = steps[currentStep - 1];
      if (currentStepName) {
        this.updateSpinner(`${progress} ${currentStepName}`);
      }
    };

    return {
      next: (message?: string) => {
        if (currentStep > 0 && currentStep <= totalSteps) {
          this.succeed(message || steps[currentStep - 1]);
        }
        currentStep++;
        if (currentStep <= totalSteps) {
          this.spinner(`[${currentStep}/${totalSteps}] ${steps[currentStep - 1]}`);
        }
      },
      complete: () => {
        if (currentStep > 0 && currentStep <= totalSteps) {
          this.succeed(steps[currentStep - 1]);
        }
        this.success('All steps completed successfully!');
      },
      fail: (error: string) => {
        this.fail(`Failed at step ${currentStep}: ${error}`);
      }
    };
  }
}

// Export singleton instance
export const logger = new Logger();