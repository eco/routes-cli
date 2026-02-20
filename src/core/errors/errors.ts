export enum ErrorCode {
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_PRIVATE_KEY = 'INVALID_PRIVATE_KEY',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  UNSUPPORTED_CHAIN = 'UNSUPPORTED_CHAIN',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  QUOTE_SERVICE_ERROR = 'QUOTE_SERVICE_ERROR',
}

export class RoutesCliError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly isUserError: boolean = false,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'RoutesCliError';
    Object.setPrototypeOf(this, RoutesCliError.prototype);
  }

  static invalidAddress(addr: string, chainType?: string): RoutesCliError {
    const chain = chainType ? ` for ${chainType}` : '';
    return new RoutesCliError(
      ErrorCode.INVALID_ADDRESS,
      `Invalid address${chain}: "${addr}"`,
      true
    );
  }

  static invalidPrivateKey(chainType: string): RoutesCliError {
    return new RoutesCliError(
      ErrorCode.INVALID_PRIVATE_KEY,
      `Invalid private key for ${chainType}`,
      true
    );
  }

  static insufficientBalance(required: bigint, available: bigint, token?: string): RoutesCliError {
    const asset = token ? ` ${token}` : '';
    return new RoutesCliError(
      ErrorCode.INSUFFICIENT_BALANCE,
      `Insufficient${asset} balance: required ${required}, available ${available}`,
      true
    );
  }

  static unsupportedChain(chainId: bigint | string): RoutesCliError {
    return new RoutesCliError(ErrorCode.UNSUPPORTED_CHAIN, `Unsupported chain: ${chainId}`, true);
  }

  static networkError(rpcUrl: string, cause: unknown): RoutesCliError {
    const reason = cause instanceof Error ? cause.message : String(cause);
    return new RoutesCliError(
      ErrorCode.NETWORK_ERROR,
      `Network error connecting to ${rpcUrl}: ${reason}`,
      false,
      cause
    );
  }

  static configurationError(message: string): RoutesCliError {
    return new RoutesCliError(ErrorCode.CONFIGURATION_ERROR, message, true);
  }
}
