import { ErrorCode, RoutesCliError } from './routes-cli-error';

/**
 * Thrown when an interactive prompt would fire but the session has no TTY
 * (e.g. driven by an agent or CI). The message names the exact CLI flag
 * that supplies the missing value.
 */
export class NonInteractiveError extends RoutesCliError {
  constructor(what: string, flagHint: string) {
    super(
      ErrorCode.NON_INTERACTIVE,
      `${what} not specified. Pass ${flagHint} when running non-interactively.`,
      true
    );
    this.name = 'NonInteractiveError';
    Object.setPrototypeOf(this, NonInteractiveError.prototype);
  }
}
