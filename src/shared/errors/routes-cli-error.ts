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
    const formats: Record<string, string> = {
      EVM: '0x followed by 40 hex characters (e.g. 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)',
      TVM: 'T followed by 33 alphanumeric characters (e.g. TRXyyyy…)',
      SVM: 'base58-encoded 32-byte public key (e.g. 11111111111111111111111111111111)',
    };
    const formatHint =
      chainType && formats[chainType] ? `\n  Expected format: ${formats[chainType]}` : '';
    return new RoutesCliError(
      ErrorCode.INVALID_ADDRESS,
      `Invalid address${chain}: "${addr}"${formatHint}`,
      true
    );
  }

  static invalidPrivateKey(chainType: string): RoutesCliError {
    const formats: Record<string, string> = {
      EVM: '0x followed by 64 hex characters (e.g. 0xac09…2ff80)',
      TVM: '64 hex characters without 0x prefix (e.g. ac09…2ff80)',
      SVM: 'base58 string, JSON byte array [1,2,…], or comma-separated bytes',
    };
    const envVars: Record<string, string> = {
      EVM: 'EVM_PRIVATE_KEY',
      TVM: 'TVM_PRIVATE_KEY',
      SVM: 'SVM_PRIVATE_KEY',
    };
    const expected = formats[chainType] ?? 'see documentation for the chain-specific format';
    const envVar = envVars[chainType] ?? `${chainType}_PRIVATE_KEY`;
    return new RoutesCliError(
      ErrorCode.INVALID_PRIVATE_KEY,
      `No private key configured for ${chainType}.\n` +
        `  Expected format: ${expected}\n` +
        `  Fix: set ${envVar} in your .env file, or pass --private-key <key> on the command line.`,
      true
    );
  }

  static insufficientBalance(required: bigint, available: bigint, token?: string): RoutesCliError {
    const asset = token ?? 'native token';
    return new RoutesCliError(
      ErrorCode.INSUFFICIENT_BALANCE,
      `Insufficient ${asset} balance.\n` +
        `  Required:  ${required}\n` +
        `  Available: ${available}\n` +
        `  Fix: fund the sender address with at least ${required} ${asset} before publishing.`,
      true
    );
  }

  static unsupportedChain(chainId: bigint | string): RoutesCliError {
    return new RoutesCliError(
      ErrorCode.UNSUPPORTED_CHAIN,
      `Unsupported chain: "${chainId}".\n` +
        `  Run "routes-cli chains" to see all supported chains and their IDs.`,
      true
    );
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
