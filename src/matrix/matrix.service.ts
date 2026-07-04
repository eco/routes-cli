/**
 * Config-driven same-chain (local) swap matrix runner.
 *
 * Phase 1 (submit, sequential): for each configured pair, quote -> build reward
 * -> publish via the same QuoteService / PublisherFactory the `publish` command
 * uses. Phase 2 (poll): for each submitted intent, poll StatusService until
 * fulfilled or timeout. Local swaps settle fulfill+prove+withdraw atomically in
 * one tx, so the fulfillment tx IS the settlement (proven/withdrawn mirror it).
 *
 * The report is rewritten after EVERY submit and EVERY poll, so a stop/crash
 * never loses completed rows.
 */

import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { formatUnits, parseUnits } from 'viem';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainsService } from '@/blockchain/chains.service';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { assertLocalSwapTokensDiffer } from '@/cli/commands/local-swap.guard';
import { DisplayService } from '@/cli/services/display.service';
import { ConfigService } from '@/config/config.service';
import { IntentBuilder } from '@/intent/intent-builder.service';
import { QuoteResult, QuoteService } from '@/quote/quote.service';
import { deriveAddress, KeyHandle } from '@/shared/security';
import { BlockchainAddress, ChainConfig, ChainType } from '@/shared/types';
import { IntentStatus, StatusService } from '@/status/status.service';

import { GasService } from './gas.service';
import { MatrixConfigFile, MatrixPairConfig, MatrixReport, MatrixRow } from './matrix.types';
import {
  aggregate,
  assertWithdrawal,
  DEFAULT_TOKEN_DECIMALS,
  pairToQuoteRequest,
} from './matrix.util';
import { WithdrawalVerifierService } from './withdrawal-verifier.service';

const DEFAULT_CONFIG_PATH = 'config/matrix-pairs.json';
const DEFAULT_TIMEOUT_SEC = 180;

export interface MatrixRunOptions {
  configPath?: string;
  timeoutSec?: number;
}

@Injectable()
export class MatrixService {
  constructor(
    private readonly chains: ChainsService,
    private readonly config: ConfigService,
    private readonly normalizer: AddressNormalizerService,
    private readonly publisherFactory: PublisherFactory,
    private readonly quoteService: QuoteService,
    private readonly intentBuilder: IntentBuilder,
    private readonly statusService: StatusService,
    private readonly gasService: GasService,
    private readonly withdrawalVerifier: WithdrawalVerifierService,
    private readonly display: DisplayService
  ) {}

  async run(options: MatrixRunOptions = {}): Promise<MatrixReport> {
    const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
    const timeoutSec = options.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
    const { pairs, expectedClaimants } = this.loadConfig(configPath);

    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = join(process.cwd(), 'results', `matrix-${runId}`);
    await mkdir(outDir, { recursive: true });
    const reportPath = join(outDir, 'summary.json');

    const startedAt = new Date().toISOString();
    const rows: MatrixRow[] = pairs.map(p => this.initRow(p));

    const persist = async (): Promise<void> => {
      const report: MatrixReport = {
        runId,
        configPath,
        timeoutSec,
        startedAt,
        updatedAt: new Date().toISOString(),
        rows,
        aggregate: aggregate(rows),
      };
      await writeFile(reportPath, JSON.stringify(report, bigintReplacer, 2));
    };

    await persist();
    this.display.log(
      `Matrix: ${pairs.length} same-chain swaps | timeout=${timeoutSec}s | report=${reportPath}`
    );

    // Phase 1: submit all sequentially.
    for (let i = 0; i < pairs.length; i++) {
      await this.submitPair(pairs[i], rows[i], i, pairs.length);
      await persist();
    }

    // Phase 2: poll each submitted intent.
    for (let i = 0; i < pairs.length; i++) {
      if (!rows[i].intentHash) continue;
      await this.pollPair(pairs[i], rows[i], expectedClaimants, timeoutSec, i, pairs.length);
      await persist();
    }

    const agg = aggregate(rows);
    this.display.log(
      `Done. submitted=${agg.submitted}/${agg.total} fulfilled=${agg.fulfilled} ` +
        `withdrawalVerified=${agg.withdrawalVerified} ` +
        `successRate=${(agg.successRate * 100).toFixed(0)}% | report=${reportPath}`
    );

    return {
      runId,
      configPath,
      timeoutSec,
      startedAt,
      updatedAt: new Date().toISOString(),
      rows,
      aggregate: agg,
    };
  }

  private loadConfig(configPath: string): {
    pairs: MatrixPairConfig[];
    expectedClaimants: Record<string, string>;
  } {
    const raw = readFileSync(join(process.cwd(), configPath), 'utf8');
    const parsed = JSON.parse(raw) as MatrixConfigFile;
    if (!parsed.pairs || !Array.isArray(parsed.pairs) || parsed.pairs.length === 0) {
      throw new Error(`Matrix config ${configPath} has no pairs`);
    }
    return { pairs: parsed.pairs, expectedClaimants: parsed.expectedClaimants ?? {} };
  }

  private initRow(pair: MatrixPairConfig): MatrixRow {
    const chain = this.chains.findChainById(BigInt(pair.chainId));
    return {
      label: pair.label,
      chainId: pair.chainId,
      chainName: chain?.name ?? String(pair.chainId),
      chainType: chain?.type ?? 'UNKNOWN',
      inputToken: pair.inputToken,
      outputToken: pair.outputToken,
      amount: pair.amount,
      phase: 'PENDING',
      quoteOk: false,
      fulfilled: false,
      proven: false,
      withdrawn: false,
      withdrawalVerified: false,
    };
  }

  private async submitPair(
    pair: MatrixPairConfig,
    row: MatrixRow,
    index: number,
    total: number
  ): Promise<void> {
    const tag = `[${index + 1}/${total}] ${pair.label}`;
    try {
      const chain = this.chains.getChainById(BigInt(pair.chainId));

      // Same-chain no-op guard (mirrors publish.command).
      assertLocalSwapTokensDiffer({
        sourceChainId: chain.id,
        destChainId: chain.id,
        chainName: chain.name,
        rewardToken: { address: pair.inputToken },
        routeToken: { address: pair.outputToken },
      });

      const funderKey = this.resolveKey(chain.type);
      if (!funderKey) throw new Error(`No funder key configured for ${chain.type}`);
      const funder = deriveAddress(funderKey, chain.type);

      const decimals = pair.inputDecimals ?? DEFAULT_TOKEN_DECIMALS;
      const rewardAmount = parseUnits(pair.amount, decimals);

      // Quote (funder == recipient: solver-controlled inventory wallet on both sides).
      let quote: QuoteResult;
      try {
        quote = await this.quoteService.getQuote(pairToQuoteRequest(pair, funder, funder));
        row.quoteOk = true;
      } catch (error) {
        row.phase = 'QUOTE_FAILED';
        row.error = errMsg(error);
        this.display.log(`${tag}  QUOTE_FAILED (${row.error})`);
        return;
      }

      const sourcePortal = this.normalizer.normalize(
        quote.sourcePortal as BlockchainAddress,
        chain.type
      );
      const prover = this.normalizer.normalize(quote.prover as BlockchainAddress, chain.type);

      const reward = this.intentBuilder.buildReward({
        sourceChain: chain,
        deadline: quote.deadline,
        creator: this.normalizer.normalize(funder as BlockchainAddress, chain.type),
        prover,
        rewardToken: this.normalizer.normalize(pair.inputToken as BlockchainAddress, chain.type),
        rewardAmount,
      });

      const destinationChainId = quote.destinationChainId
        ? BigInt(quote.destinationChainId)
        : chain.id;

      const publisher = this.publisherFactory.create(chain);
      const result = await publisher.publish(
        chain.id,
        destinationChainId,
        reward,
        quote.encodedRoute,
        new KeyHandle(funderKey),
        sourcePortal
      );

      if (!result.success || !result.intentHash) {
        row.phase = 'PUBLISH_FAILED';
        row.error = result.error ?? 'publish returned no intentHash';
        this.display.log(`${tag}  PUBLISH_FAILED (${row.error})`);
        return;
      }

      row.phase = 'SUBMITTED';
      row.intentHash = result.intentHash;
      row.publishTxHash = result.transactionHash;
      row.submitTimeMs = Date.now();
      this.display.log(`${tag}  SUBMITTED intentHash=${result.intentHash}`);
    } catch (error) {
      if (row.phase === 'PENDING') {
        row.phase = 'PUBLISH_FAILED';
        row.error = errMsg(error);
        this.display.log(`${tag}  ERROR (${row.error})`);
      }
    }
  }

  private async pollPair(
    pair: MatrixPairConfig,
    row: MatrixRow,
    expectedClaimants: Record<string, string>,
    timeoutSec: number,
    index: number,
    total: number
  ): Promise<void> {
    const tag = `[${index + 1}/${total}] ${pair.label}`;
    const chain = this.chains.getChainById(BigInt(pair.chainId));

    // getStatus is implemented for EVM (Portal events) and SVM (fulfill-marker PDA).
    // TVM has no getStatus yet — skip its poll rather than throw.
    if (chain.type === ChainType.TVM) {
      row.phase = 'POLL_UNSUPPORTED';
      row.error = `status polling not supported for ${chain.type}`;
      this.display.log(`${tag}  POLL_UNSUPPORTED (${chain.type})`);
      return;
    }

    const status = await this.pollUntilFulfilled(row.intentHash!, chain, timeoutSec);
    if (!status || !status.fulfilled) {
      row.phase = 'TIMEOUT';
      this.display.log(`${tag}  TIMEOUT (>${timeoutSec}s)`);
      return;
    }

    // Fulfilled. Local swaps settle fulfill+prove+withdraw atomically, so the
    // fulfillment tx IS the settlement — but we do NOT trust the mirror: the
    // withdrawal (reward amount + claimant) is always verified on-chain below.
    row.phase = 'FULFILLED';
    row.fulfilled = true;
    row.proven = true; // proof precondition for the atomic settlement = fulfilled.
    row.fulfillmentTxHash = status.fulfillmentTxHash;
    row.fulfillmentBlock = status.blockNumber?.toString();
    row.fulfillmentTimestamp = status.timestamp;
    if (row.submitTimeMs) {
      row.timeToFulfillSec = Math.round((Date.now() - row.submitTimeMs) / 1000);
    }

    if (status.fulfillmentTxHash) {
      row.gasCost = await this.gasService.getSettlementGas(chain, status.fulfillmentTxHash);
    } else {
      row.gasCost = { unavailable: 'no fulfillment tx hash' };
    }

    await this.verifyWithdrawal(pair, row, chain, status, expectedClaimants, tag);
  }

  /**
   * ALWAYS-on withdrawal verification: fetch the settlement tx, extract the raw
   * amount + claimant for the reward token (= inputToken), and assert
   * amount === reward and claimant matches (differs from funder; matches
   * expectedClaimant when configured). Only then is the row a success.
   */
  private async verifyWithdrawal(
    pair: MatrixPairConfig,
    row: MatrixRow,
    chain: ChainConfig,
    status: IntentStatus,
    expectedClaimants: Record<string, string>,
    tag: string
  ): Promise<void> {
    if (!status.fulfillmentTxHash) {
      row.phase = 'WITHDRAWAL_MISMATCH';
      row.error = 'no settlement tx hash to verify withdrawal';
      this.display.log(`${tag}  WITHDRAWAL_MISMATCH (${row.error})`);
      return;
    }

    const decimals = pair.inputDecimals ?? DEFAULT_TOKEN_DECIMALS;
    const expectedAmount = parseUnits(pair.amount, decimals);
    const expectedClaimant = pair.expectedClaimant ?? expectedClaimants[String(pair.chainId)];
    const funder = deriveAddress(this.resolveKey(chain.type)!, chain.type);

    const facts = await this.withdrawalVerifier.verify(
      chain,
      row.intentHash!,
      status.fulfillmentTxHash,
      pair.inputToken
    );

    if ('error' in facts) {
      row.phase = 'WITHDRAWAL_MISMATCH';
      row.error = `withdrawal verification failed: ${facts.error}`;
      this.display.log(`${tag}  WITHDRAWAL_MISMATCH (${row.error})`);
      return;
    }

    row.claimant = facts.claimant;
    row.withdrawnAmount = facts.withdrawnAmount.toString();
    row.withdrawnAmountHuman = formatUnits(facts.withdrawnAmount, decimals);
    if (expectedClaimant) row.expectedClaimant = expectedClaimant;

    const check = assertWithdrawal({
      chainType: chain.type,
      withdrawnAmount: facts.withdrawnAmount,
      expectedAmount,
      claimant: facts.claimant,
      funder,
      expectedClaimant,
    });

    // SVM claimed-marker PDA is an independent "withdrawn" signal. When SVM
    // returns it explicitly false, treat the withdrawal as not settled.
    const claimedMarkerOk = facts.claimedMarkerPresent !== false;

    if (!check.ok || !claimedMarkerOk) {
      row.phase = check.failPhase ?? 'WITHDRAWAL_MISMATCH';
      row.error = check.ok ? 'claimed-marker PDA not found' : check.error;
      this.display.log(
        `${tag}  WITHDRAWAL_MISMATCH withdrawn=${row.withdrawnAmountHuman} ` +
          `claimant=${facts.claimant} (${row.error})`
      );
      return;
    }

    row.withdrawn = true;
    row.withdrawalVerified = true;
    this.display.log(
      `${tag}  FULFILLED+WITHDRAWN tx=${status.fulfillmentTxHash} ` +
        `withdrawn=${row.withdrawnAmountHuman} claimant=${facts.claimant} ` +
        `gas=${row.gasCost?.native ?? 'n/a'}${row.gasCost?.symbol ? ' ' + row.gasCost.symbol : ''}`
    );
  }

  /**
   * Poll getStatus until the intent is fulfilled or the timeout elapses.
   * Returns the last observed status (fulfilled) or null on timeout.
   */
  private async pollUntilFulfilled(
    intentHash: string,
    chain: ChainConfig,
    timeoutSec: number,
    intervalMs = 10_000
  ): Promise<IntentStatus | null> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      const status = await this.statusService.getStatus(intentHash, chain);
      if (status.fulfilled) return status;
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return null;
  }

  private resolveKey(chainType: ChainType): string | undefined {
    const key = this.config.getKeyForChainType(chainType);
    if (key) return key;
    // A TVM key is the same secp256k1 key as EVM; fall back to the EVM key.
    if (chainType === ChainType.TVM) return this.config.getKeyForChainType(ChainType.EVM);
    return undefined;
  }
}

function errMsg(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function bigintReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
