import { Injectable } from '@nestjs/common';

import chalk from 'chalk';
import Table from 'cli-table3';
import ora, { Ora } from 'ora';
import { formatUnits } from 'viem';

import { IntentStatus, PublishResult } from '@/blockchain/base.publisher';
import { TokenConfig } from '@/config/tokens.config';
import { QuoteResult } from '@/quote/quote.service';
import { ChainConfig } from '@/shared/types';

@Injectable()
export class DisplayService {
  private activeSpinner: Ora | null = null;

  spinner(text: string): void {
    this.stopSpinner();
    this.activeSpinner = ora(text).start();
  }

  succeed(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.succeed(text);
      this.activeSpinner = null;
    } else {
      console.log(chalk.green(`✓ ${text}`));
    }
  }
  fail(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.fail(text);
      this.activeSpinner = null;
    } else {
      console.error(chalk.red(`✗ ${text}`));
    }
  }
  warn(text?: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.warn(text);
      this.activeSpinner = null;
    } else {
      console.warn(chalk.yellow(`⚠ ${text}`));
    }
  }
  stopSpinner(): void {
    this.activeSpinner?.stop();
    this.activeSpinner = null;
  }

  log(msg: string): void {
    if (this.activeSpinner) {
      this.activeSpinner.stop();
      console.log(chalk.gray(msg));
      this.activeSpinner.start();
    } else {
      console.log(chalk.gray(msg));
    }
  }
  success(msg: string): void {
    console.log(chalk.green(`✅ ${msg}`));
  }
  error(msg: string): void {
    console.error(chalk.red(`❌ ${msg}`));
  }
  warning(msg: string): void {
    console.warn(chalk.yellow(`⚠️  ${msg}`));
  }
  title(msg: string): void {
    console.log(chalk.bold.blue(msg));
  }
  section(msg: string): void {
    console.log(chalk.blue(msg));
  }

  displayTable(headers: string[], rows: string[][]): void {
    const table = new Table({ head: headers.map(h => chalk.cyan(h)), style: { border: ['gray'] } });
    rows.forEach(row => table.push(row));
    console.log(table.toString());
  }

  displayTransactionResult(result: PublishResult): void {
    this.displayTable(
      ['Field', 'Value'],
      [
        ['Transaction Hash', result.transactionHash ?? '-'],
        ['Intent Hash', result.intentHash ?? '-'],
        ['Vault Address', result.vaultAddress ?? '-'],
      ]
    );
  }

  displayFulfillmentResult(status: IntentStatus): void {
    this.displayTable(
      ['Field', 'Value'],
      [
        ['Fulfillment Tx', status.fulfillmentTxHash ?? '-'],
        ['Solver', status.solver ?? '-'],
        ['Block', status.blockNumber?.toString() ?? '-'],
      ]
    );
  }

  displayQuote(
    quote: QuoteResult,
    sourceToken: { symbol?: string; decimals: number },
    sourceAmount: bigint,
    destToken: { symbol?: string; decimals: number }
  ): void {
    const srcSymbol = sourceToken.symbol ?? 'tokens';
    const dstSymbol = destToken.symbol ?? 'tokens';
    const rows: string[][] = [
      ['Source Token', srcSymbol],
      ['Source Amount', `${formatUnits(sourceAmount, sourceToken.decimals)} ${srcSymbol}`],
      ['Destination Token', dstSymbol],
      [
        'Destination Amount',
        `${formatUnits(BigInt(quote.destinationAmount), destToken.decimals)} ${dstSymbol}`,
      ],
      ['Portal', quote.sourcePortal],
      ['Prover', quote.prover],
      ['Deadline', new Date(quote.deadline * 1000).toLocaleString()],
    ];
    if (quote.estimatedFulfillTimeSec !== undefined) {
      rows.push(['Est. Fulfill Time', `${quote.estimatedFulfillTimeSec}s`]);
    }
    this.displayTable(['Quote Summary', ''], rows);
  }

  displayChains(chains: ChainConfig[]): void {
    this.displayTable(
      ['Name', 'ID', 'Type', 'Native Currency'],
      chains.map(c => [c.name, c.id.toString(), c.type, c.nativeCurrency.symbol])
    );
  }

  displayTokens(tokens: TokenConfig[]): void {
    this.displayTable(
      ['Symbol', 'Name', 'Decimals', 'Available Chains'],
      tokens.map(t => [
        t.symbol,
        t.name,
        t.decimals.toString(),
        Object.keys(t.addresses).join(', '),
      ])
    );
  }
}
