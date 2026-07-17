import { Injectable } from '@nestjs/common';

import { Command, CommandRunner, Option } from 'nest-commander';

import { MatrixService } from '@/matrix/matrix.service';

import { DisplayService } from '../services/display.service';

interface MatrixOptions {
  config?: string;
  timeout?: number;
  quoteOnly?: boolean;
}

@Injectable()
@Command({
  name: 'matrix',
  description: 'Run a config-driven route matrix in quote-only or settlement mode',
})
export class MatrixCommand extends CommandRunner {
  constructor(
    private readonly matrixService: MatrixService,
    private readonly display: DisplayService
  ) {
    super();
  }

  async run(_inputs: string[], options: MatrixOptions): Promise<void> {
    this.display.title(options.quoteOnly ? '🧪 Quote Route Matrix' : '🧪 Swap Settlement Matrix');
    await this.matrixService.run({
      configPath: options.config,
      timeoutSec: options.timeout,
      quoteOnly: options.quoteOnly,
    });
  }

  @Option({
    flags: '-c, --config <path>',
    description: 'Path to matrix pairs JSON (default config/matrix-pairs.json)',
  })
  parseConfig(val: string): string {
    return val;
  }

  @Option({
    flags: '-t, --timeout <sec>',
    description: 'Per-intent settlement poll timeout in seconds (default 180)',
  })
  parseTimeout(val: string): number {
    const parsed = Number(val);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error(`Invalid --timeout "${val}": expected a positive integer (seconds)`);
    }
    return parsed;
  }

  @Option({
    flags: '--quote-only',
    description: 'Request and report quotes only; never publish or poll intents',
  })
  parseQuoteOnly(): boolean {
    return true;
  }
}
