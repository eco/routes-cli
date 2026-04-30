export type Stage =
  | 'pending'
  | 'quoting'
  | 'publishing'
  | 'waiting-fulfillment'
  | 'scanning-events'
  | 'done'
  | 'failed';

export type Status = 'pending' | 'running' | 'done' | 'failed';

export type FailureKind =
  | 'quote-http-error'
  | 'quote-shape-invalid'
  | 'evm-balance-insufficient'
  | 'evm-simulation-revert'
  | 'evm-publish-revert'
  | 'svm-publish-failed'
  | 'svm-fund-failed'
  | 'fulfillment-timeout'
  | 'local-refunded'
  | 'local-stuck'
  | 'unexpected-exception';

export interface ScenarioResult {
  id: string;
  status: Status;
  stage: Stage;
  failureKind?: FailureKind;
  errorMessage?: string;
  startedAt?: number;
  finishedAt?: number;
  durationMs?: number;
  intentHash?: string;
  publishTxHash?: string;
  fundTxHash?: string;
  fulfilledTxHash?: string;
  refundedTxHash?: string;
  destBalanceDelta?: bigint;
  note?: string;
}
