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
import { isAbsolute, join } from 'node:path';

import { Injectable } from '@nestjs/common';

import { formatUnits, parseUnits } from 'viem';

import { AddressNormalizerService } from '@/blockchain/address-normalizer.service';
import { ChainsService } from '@/blockchain/chains.service';
import { PublisherFactory } from '@/blockchain/publisher-factory.service';
import { assertLocalSwapTokensDiffer } from '@/cli/commands/local-swap.guard';
import { DisplayService } from '@/cli/services/display.service';
import { ConfigService } from '@/config/config.service';
import { IntentBuilder } from '@/intent/intent-builder.service';
import { QuoteHttpError, QuoteResult, QuoteService } from '@/quote/quote.service';
import { deriveAddress, KeyHandle } from '@/shared/security';
import { BlockchainAddress, ChainConfig, ChainType, UniversalAddress } from '@/shared/types';
import { IntentStatus, StatusService } from '@/status/status.service';

import { DeliveryVerifierService } from './delivery-verifier.service';
import { GasService } from './gas.service';
import { MatrixConfigFile, MatrixPairConfig, MatrixReport, MatrixRow } from './matrix.types';
import {
  aggregate,
  assertWithdrawal,
  DEFAULT_TOKEN_DECIMALS,
  pairToQuoteRequest,
  resolvePairRoute,
} from './matrix.util';
import { WithdrawalVerifierService } from './withdrawal-verifier.service';
import { YellowLifecycleService } from './yellow-lifecycle.service';

const DEFAULT_CONFIG_PATH = 'config/matrix-pairs.json';
const DEFAULT_TIMEOUT_SEC = 180;

interface ParentPollOutcome {
  status?: IntentStatus;
  sourceFailure?: string;
}

export interface MatrixRunOptions {
  configPath?: string;
  timeoutSec?: number;
  quoteOnly?: boolean;
  reconcilePath?: string;
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
    private readonly deliveryVerifier: DeliveryVerifierService,
    private readonly yellowLifecycle: YellowLifecycleService,
    private readonly display: DisplayService
  ) {}

  async run(options: MatrixRunOptions = {}): Promise<MatrixReport> {
    if (options.reconcilePath) return this.reconcile(options.reconcilePath);
    const configPath = options.configPath ?? DEFAULT_CONFIG_PATH;
    const timeoutSec = options.timeoutSec ?? DEFAULT_TIMEOUT_SEC;
    const { pairs, expectedClaimants, quoteActors } = this.loadConfig(configPath);

    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = join(process.cwd(), 'results', `matrix-${runId}`);
    await mkdir(outDir, { recursive: true });
    const reportPath = join(outDir, 'summary.json');

    const startedAt = new Date().toISOString();
    const rows: MatrixRow[] = pairs.map(p => this.initRow(p));

    // Serialize writes: concurrent pollers (Phase 2) all call persist(), and
    // parallel writeFile() to the same path can interleave and corrupt it.
    let persistLock: Promise<void> = Promise.resolve();
    const persist = (): Promise<void> => {
      persistLock = persistLock.then(async () => {
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
      });
      return persistLock;
    };

    await persist();
    this.display.log(
      `Matrix: ${pairs.length} routes | mode=${options.quoteOnly ? 'quote-only' : 'settlement'} | ` +
        `timeout=${timeoutSec}s | report=${reportPath}`
    );

    if (options.quoteOnly) {
      if (!quoteActors) throw new Error(`Matrix config ${configPath} has no quoteActors`);
      for (let i = 0; i < pairs.length; i++) {
        await this.quotePair(pairs[i], rows[i], quoteActors, i, pairs.length);
        await persist();
      }
      const aggregateResult = aggregate(rows);
      this.display.log(
        `Done. quoted=${rows.filter(row => row.quoteOk).length}/${aggregateResult.total} ` +
          `quoteFailures=${aggregateResult.quoteFailures} | report=${reportPath}`
      );
      return {
        runId,
        configPath,
        timeoutSec,
        startedAt,
        updatedAt: new Date().toISOString(),
        rows,
        aggregate: aggregateResult,
      };
    }

    // Phase 1: submit all sequentially.
    for (let i = 0; i < pairs.length; i++) {
      await this.submitPair(pairs[i], rows[i], i, pairs.length);
      await persist();
    }

    // Phase 2: poll all submitted intents concurrently — one independent poller
    // per intent. Polling is I/O-bound (RPC + sleeps), so cooperative scheduling
    // on the event loop gives true parallel waiting; each intent's latency clock
    // starts at its own submit. Funding (Phase 1) stays sequential to avoid
    // same-wallet nonce races. allSettled + a per-poller try/catch guarantees one
    // poller's failure never aborts its siblings.
    const pollOutcomes = await Promise.allSettled(
      pairs.map(async (pair, i) => {
        if (!rows[i].intentHash) return;
        try {
          await this.pollPair(pair, rows[i], expectedClaimants, timeoutSec, i, pairs.length);
        } catch (error) {
          rows[i].phase = 'POLL_ERROR';
          rows[i].error = errMsg(error);
          this.display.log(
            `[${i + 1}/${pairs.length}] ${pair.label}  POLL_ERROR (${rows[i].error})`
          );
        }
        await persist();
      })
    );
    // Backstop: surface any rejection that escaped the per-poller catch above.
    pollOutcomes.forEach((outcome, i) => {
      if (outcome.status === 'rejected' && rows[i].intentHash) {
        rows[i].phase = 'POLL_ERROR';
        rows[i].error = String(outcome.reason);
      }
    });
    await persist();

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

  async reconcile(reportPath: string): Promise<MatrixReport> {
    const resolvedReportPath = isAbsolute(reportPath)
      ? reportPath
      : join(process.cwd(), reportPath);
    const report = JSON.parse(readFileSync(resolvedReportPath, 'utf8')) as MatrixReport;
    const { pairs, expectedClaimants } = this.loadConfig(report.configPath);

    for (let index = 0; index < report.rows.length; index++) {
      const row = report.rows[index];
      const pair = pairs.find(candidate => candidate.id && candidate.id === row.id) ?? pairs[index];
      if (!pair || !row.quoteId) continue;
      const snapshot = await this.yellowLifecycle.getSnapshot(row.quoteId);
      if (snapshot.parent?.status === 'FAILED') {
        row.phase = 'SOURCE_FAILED';
        row.error = yellowErrorMessage(snapshot.parent.lastError);
        continue;
      }
      const promoted = snapshot.promotedChild;
      if (!promoted) {
        row.phase = 'CHILD_PENDING';
        row.error = 'no promoted child intent found in Yellow';
        continue;
      }

      row.childIntentHash = promoted.intent.intentHash;
      row.proven = Boolean(promoted.intent.provenEvent);
      row.withdrawn = Boolean(promoted.intent.withdrawnEvent);
      if (!row.deliveryVerified && promoted.intent.fulfilledEvent?.txHash) {
        await this.verifyDeliveredSnapshot(
          pair,
          row,
          snapshot,
          `[${index + 1}/${report.rows.length}]`
        );
      }
      if (!row.deliveryVerified) continue;

      if (!promoted.intent.provenEvent || !promoted.intent.withdrawnEvent?.txHash) {
        row.phase = 'WITHDRAWAL_PENDING';
        row.error = undefined;
        continue;
      }

      const { sourceChainId } = resolvePairRoute(pair);
      const sourceChain = this.chains.getChainById(BigInt(sourceChainId));
      const expectedClaimant = pair.expectedClaimant ?? expectedClaimants[String(sourceChainId)];
      if (!expectedClaimant) {
        row.phase = 'WITHDRAWAL_MISMATCH';
        row.error = `expected kernel claimant missing for source chain ${sourceChainId}`;
        continue;
      }
      const reward = promoted.intent.reward;
      const nativeAmount = BigInt(reward?.nativeAmount ?? '0');
      const rewardEntry = reward?.tokens?.[0];
      if (nativeAmount === 0n && !rewardEntry) {
        row.phase = 'WITHDRAWAL_MISMATCH';
        row.error = `child ${promoted.intent.intentHash} has no reward`;
        continue;
      }
      const rewardToken =
        nativeAmount > 0n
          ? pair.inputToken
          : this.normalizer.denormalize(rewardEntry!.token as UniversalAddress, sourceChain.type);
      const expectedAmount = nativeAmount > 0n ? nativeAmount : BigInt(rewardEntry!.amount);
      const facts = await this.withdrawalVerifier.verify(
        sourceChain,
        promoted.intent.intentHash,
        promoted.intent.withdrawnEvent.txHash,
        rewardToken,
        undefined,
        expectedAmount,
        row.sourcePortal as UniversalAddress | undefined
      );
      if ('error' in facts) {
        row.phase = 'WITHDRAWAL_MISMATCH';
        row.error = `child withdrawal verification failed: ${facts.error}`;
        continue;
      }
      const funder = deriveAddress(this.resolveKey(sourceChain.type)!, sourceChain.type);
      const check = assertWithdrawal({
        chainType: sourceChain.type,
        withdrawnAmount: facts.withdrawnAmount,
        expectedAmount,
        claimant: facts.claimant,
        funder,
        expectedClaimant,
      });
      if (!check.ok || facts.claimedMarkerPresent === false) {
        row.phase = 'WITHDRAWAL_MISMATCH';
        row.error = check.ok ? 'claimed-marker PDA not found' : check.error;
        continue;
      }

      row.claimant = facts.claimant;
      row.expectedClaimant = expectedClaimant;
      row.withdrawnAmount = facts.withdrawnAmount.toString();
      row.withdrawalVerified = true;
      row.withdrawn = true;
      row.proven = true;
      row.phase = 'SUCCEEDED';
      row.error = undefined;
    }

    report.updatedAt = new Date().toISOString();
    report.aggregate = aggregate(report.rows);
    await writeFile(resolvedReportPath, JSON.stringify(report, bigintReplacer, 2));
    this.display.log(
      `Reconciled. delivered=${report.aggregate.delivered}/${report.aggregate.submitted} ` +
        `succeeded=${report.aggregate.succeeded}/${report.aggregate.submitted} | ` +
        `report=${resolvedReportPath}`
    );
    return report;
  }

  private loadConfig(configPath: string): {
    pairs: MatrixPairConfig[];
    expectedClaimants: Record<string, string>;
    quoteActors?: MatrixConfigFile['quoteActors'];
  } {
    const raw = readFileSync(join(process.cwd(), configPath), 'utf8');
    const parsed = JSON.parse(raw) as MatrixConfigFile;
    if (!parsed.pairs || !Array.isArray(parsed.pairs) || parsed.pairs.length === 0) {
      throw new Error(`Matrix config ${configPath} has no pairs`);
    }
    return {
      pairs: parsed.pairs,
      expectedClaimants: parsed.expectedClaimants ?? {},
      quoteActors: parsed.quoteActors,
    };
  }

  private initRow(pair: MatrixPairConfig): MatrixRow {
    const { sourceChainId, destinationChainId } = resolvePairRoute(pair);
    const chain = this.chains.findChainById(BigInt(sourceChainId));
    const destinationChain = this.chains.findChainById(BigInt(destinationChainId));
    return {
      id: pair.id,
      label: pair.label,
      path: pair.path,
      chainId: sourceChainId,
      destinationChainId,
      destinationChainName: destinationChain?.name ?? String(destinationChainId),
      chainName: chain?.name ?? String(sourceChainId),
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
      deliveryVerified: false,
    };
  }

  private async quotePair(
    pair: MatrixPairConfig,
    row: MatrixRow,
    actors: NonNullable<MatrixConfigFile['quoteActors']>,
    index: number,
    total: number
  ): Promise<void> {
    const tag = `[${index + 1}/${total}] ${pair.label}`;
    const { sourceChainId, destinationChainId } = resolvePairRoute(pair);
    const source = this.chains.getChainById(BigInt(sourceChainId));
    const destination = this.chains.getChainById(BigInt(destinationChainId));
    const actorFor = (type: string): string | undefined =>
      actors[type.toLowerCase() as keyof typeof actors];
    const funder = actorFor(source.type);
    const recipient = actorFor(destination.type);
    if (!funder || !recipient) {
      throw new Error(`${pair.label}: missing quote actor for ${source.type}/${destination.type}`);
    }

    try {
      const quote = await this.quoteService.getQuote(pairToQuoteRequest(pair, funder, recipient));
      row.phase = 'QUOTED';
      row.quoteOk = true;
      row.quoteLatencyMs = quote.elapsedMs;
      row.quoteId = quote.quoteId;
      row.solverId = quote.solverId;
      row.sourcePortal = quote.sourcePortal;
      row.prover = quote.prover;
      this.display.log(`${tag}  QUOTED (${quote.elapsedMs}ms)`);
    } catch (error) {
      row.phase = 'QUOTE_FAILED';
      row.error = errMsg(error);
      if (error instanceof QuoteHttpError) {
        row.quoteHttpStatus = error.status;
        row.quoteLatencyMs = error.elapsedMs;
        row.quoteResponseBody = error.body;
      }
      this.display.log(`${tag}  QUOTE_FAILED (${row.error})`);
    }
  }

  private async submitPair(
    pair: MatrixPairConfig,
    row: MatrixRow,
    index: number,
    total: number
  ): Promise<void> {
    const tag = `[${index + 1}/${total}] ${pair.label}`;
    try {
      const { sourceChainId, destinationChainId: configuredDestinationChainId } =
        resolvePairRoute(pair);
      const chain = this.chains.getChainById(BigInt(sourceChainId));
      const destinationChain = this.chains.getChainById(BigInt(configuredDestinationChainId));

      // Same-chain no-op guard (mirrors publish.command).
      assertLocalSwapTokensDiffer({
        sourceChainId: BigInt(sourceChainId),
        destChainId: BigInt(configuredDestinationChainId),
        chainName: chain.name,
        rewardToken: { address: pair.inputToken },
        routeToken: { address: pair.outputToken },
      });

      const funderKey = this.resolveKey(chain.type);
      if (!funderKey) throw new Error(`No funder key configured for ${chain.type}`);
      const funder = deriveAddress(funderKey, chain.type);

      const recipientKey = this.resolveKey(destinationChain.type);
      if (!recipientKey) {
        throw new Error(`No recipient key configured for ${destinationChain.type}`);
      }
      const recipient = deriveAddress(recipientKey, destinationChain.type);

      const decimals = pair.inputDecimals ?? DEFAULT_TOKEN_DECIMALS;
      const rewardAmount = parseUnits(pair.amount, decimals);

      // Quote with controlled wallets encoded for their respective source/destination VMs.
      let quote: QuoteResult;
      try {
        quote = await this.quoteService.getQuote(pairToQuoteRequest(pair, funder, recipient));
        row.quoteOk = true;
        row.quoteId = quote.quoteId;
        row.solverId = quote.solverId;
        row.recipient = recipient;
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
      row.sourcePortal = sourcePortal;
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
    const { sourceChainId } = resolvePairRoute(pair);
    const chain = this.chains.getChainById(BigInt(sourceChainId));

    // getStatus is implemented for EVM (Portal events) and SVM (fulfill-marker PDA).
    // TVM has no getStatus yet — skip its poll rather than throw.
    if (chain.type === ChainType.TVM) {
      row.phase = 'POLL_UNSUPPORTED';
      row.error = `status polling not supported for ${chain.type}`;
      this.display.log(`${tag}  POLL_UNSUPPORTED (${chain.type})`);
      return;
    }

    const { destinationChainId } = resolvePairRoute(pair);
    const isCrossChain = destinationChainId !== Number(chain.id);
    const outcome = await this.pollUntilFulfilledOrFailed(
      row.intentHash!,
      isCrossChain && pair.path === 'any-to-any' ? row.quoteId : undefined,
      chain,
      timeoutSec,
      row.sourcePortal as UniversalAddress | undefined
    );
    if (outcome.sourceFailure) {
      row.phase = 'SOURCE_FAILED';
      row.error = outcome.sourceFailure;
      this.display.log(`${tag}  SOURCE_FAILED (${row.error})`);
      return;
    }
    const status = outcome.status;
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
    row.proven = !isCrossChain; // local settlement is atomic; cross-chain proof belongs to child.
    row.fulfillmentTxHash = status.fulfillmentTxHash;
    if (isCrossChain) row.sourceSettlementTxHash = status.fulfillmentTxHash;
    row.fulfillmentBlock = status.blockNumber?.toString();
    row.fulfillmentTimestamp = status.timestamp;
    // Settlement latency from on-chain block times (fund block -> fulfill block),
    // not wall-clock: the harness submits all pairs before polling any, so a
    // wall-clock delta is dominated by submit-phase duration + poll-queue position,
    // not real latency. Fall back to wall-clock only if a block time is unavailable.
    const fundTs = row.publishTxHash
      ? await this.gasService.getTxTimestamp(chain, row.publishTxHash)
      : undefined;
    const fulfillTs = status.fulfillmentTxHash
      ? await this.gasService.getTxTimestamp(chain, status.fulfillmentTxHash)
      : undefined;
    if (fundTs !== undefined && fulfillTs !== undefined) {
      row.timeToFulfillSec = fulfillTs - fundTs;
    } else if (row.submitTimeMs) {
      row.timeToFulfillSec = Math.round((Date.now() - row.submitTimeMs) / 1000);
    }

    if (status.fulfillmentTxHash) {
      row.gasCost = await this.gasService.getSettlementGas(chain, status.fulfillmentTxHash);
    } else {
      row.gasCost = { unavailable: 'no fulfillment tx hash' };
    }

    await this.verifyWithdrawal(pair, row, chain, status, expectedClaimants, tag);
    if (isCrossChain && row.sourceWithdrawalVerified) {
      await this.verifyCrossChainDelivery(pair, row, timeoutSec, tag);
    }
  }

  private async verifyCrossChainDelivery(
    pair: MatrixPairConfig,
    row: MatrixRow,
    timeoutSec: number,
    tag: string
  ): Promise<void> {
    if (!row.quoteId) {
      row.phase = 'POLL_ERROR';
      row.error = 'cross-chain lifecycle requires quoteId';
      return;
    }

    row.phase = 'CHILD_PENDING';
    const snapshot = await this.yellowLifecycle.waitForDeliveredChild(
      row.quoteId,
      timeoutSec * 1_000
    );
    await this.verifyDeliveredSnapshot(pair, row, snapshot, tag);
  }

  private async verifyDeliveredSnapshot(
    pair: MatrixPairConfig,
    row: MatrixRow,
    snapshot: Awaited<ReturnType<YellowLifecycleService['getSnapshot']>>,
    tag: string
  ): Promise<void> {
    const promoted = snapshot.promotedChild;
    if (!promoted) {
      row.error = 'no promoted child intent found in Yellow';
      this.display.log(`${tag}  CHILD_PENDING (${row.error})`);
      return;
    }

    row.childIntentHash = promoted.intent.intentHash;
    const fulfilled = promoted.intent.fulfilledEvent;
    if (!fulfilled?.txHash) {
      row.error = `child ${promoted.intent.intentHash} not fulfilled before timeout`;
      this.display.log(`${tag}  CHILD_PENDING (${row.error})`);
      return;
    }

    const { destinationChainId } = resolvePairRoute(pair);
    const destinationChain = this.chains.getChainById(BigInt(destinationChainId));
    const recipient = row.recipient;
    if (!recipient) {
      row.phase = 'DELIVERY_MISMATCH';
      row.error = 'destination recipient missing from matrix row';
      return;
    }

    const facts = await this.deliveryVerifier.verify(
      destinationChain,
      fulfilled.txHash,
      pair.outputToken,
      recipient
    );
    if ('error' in facts) {
      row.phase = 'DELIVERY_MISMATCH';
      row.error = `destination delivery verification failed: ${facts.error}`;
      this.display.log(`${tag}  DELIVERY_MISMATCH (${row.error})`);
      return;
    }

    const minimum = BigInt(
      snapshot.minimumDestinationAmount ??
        promoted.bucket.expectedDestinationOutput ??
        promoted.bucket.destinationAmount ??
        snapshot.destinationAmount ??
        '1'
    );
    if (facts.deliveredAmount < minimum) {
      row.phase = 'DELIVERY_MISMATCH';
      row.error = `delivered amount ${facts.deliveredAmount} below quote minimum ${minimum}`;
      this.display.log(`${tag}  DELIVERY_MISMATCH (${row.error})`);
      return;
    }

    const outputDecimals = pair.outputDecimals ?? DEFAULT_TOKEN_DECIMALS;
    row.fulfillmentTxHash = fulfilled.txHash;
    row.fulfillmentBlock = fulfilled.blockNumber;
    row.deliveryVerified = true;
    row.deliveredAmount = facts.deliveredAmount.toString();
    row.deliveredAmountHuman = formatUnits(facts.deliveredAmount, outputDecimals);
    row.minimumDestinationAmount = minimum.toString();
    row.proven = Boolean(promoted.intent.provenEvent);
    row.withdrawn = Boolean(promoted.intent.withdrawnEvent);
    row.phase = 'DELIVERED_PENDING_WITHDRAWAL';
    row.error = undefined;
    this.display.log(
      `${tag}  DELIVERED child=${row.childIntentHash} tx=${fulfilled.txHash} ` +
        `amount=${row.deliveredAmountHuman} pendingWithdrawal=true`
    );
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
    const { sourceChainId, destinationChainId } = resolvePairRoute(pair);
    const isCrossChain = sourceChainId !== destinationChainId;
    const expectedClaimant = isCrossChain
      ? undefined
      : (pair.expectedClaimant ?? expectedClaimants[String(sourceChainId)]);
    const funder = deriveAddress(this.resolveKey(chain.type)!, chain.type);

    const facts = await this.withdrawalVerifier.verify(
      chain,
      row.intentHash!,
      status.fulfillmentTxHash,
      pair.inputToken,
      row.publishTxHash,
      expectedAmount,
      row.sourcePortal as UniversalAddress | undefined
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

    if (isCrossChain) {
      row.phase = 'SOURCE_WITHDRAWN';
      row.sourceWithdrawalVerified = true;
      this.display.log(
        `${tag}  SOURCE_WITHDRAWN tx=${status.fulfillmentTxHash} ` +
          `withdrawn=${row.withdrawnAmountHuman} claimant=${facts.claimant}`
      );
      return;
    }

    row.phase = 'SUCCEEDED';
    row.withdrawn = true;
    row.withdrawalVerified = true;
    row.deliveryVerified = true;
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
  private async pollUntilFulfilledOrFailed(
    intentHash: string,
    quoteId: string | undefined,
    chain: ChainConfig,
    timeoutSec: number,
    portalAddress?: UniversalAddress,
    intervalMs = 10_000
  ): Promise<ParentPollOutcome> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      const status = await this.statusService.getStatus(intentHash, chain, portalAddress);
      if (status.fulfilled) return { status };
      if (quoteId) {
        try {
          const snapshot = await this.yellowLifecycle.getSnapshot(quoteId);
          if (snapshot.parent?.status === 'FAILED') {
            return { sourceFailure: yellowErrorMessage(snapshot.parent.lastError) };
          }
        } catch {
          // Portal status remains authoritative if Yellow is temporarily unavailable.
        }
      }
      await new Promise(r => setTimeout(r, intervalMs));
    }
    return {};
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

function yellowErrorMessage(lastError: unknown): string {
  if (!lastError || typeof lastError !== 'object') return 'Yellow parent intent failed';
  const error = lastError as { errorCode?: unknown; message?: unknown };
  const code = typeof error.errorCode === 'string' ? error.errorCode : undefined;
  const message = typeof error.message === 'string' ? error.message : undefined;
  if (code && message) return `${code}: ${message}`;
  return message ?? code ?? 'Yellow parent intent failed';
}
