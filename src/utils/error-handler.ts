/**
 * Global error handling utilities
 */

import { hasErrorCode } from '@/commons/utils/error-handler';
import { logger } from '@/utils/logger';

export interface ErrorWithCode extends Error {
  code?: string;
  statusCode?: number;
}

export class CliError extends Error {
  public readonly code: string;
  public readonly isOperational: boolean;
  public readonly statusCode: number;

  constructor(
    message: string,
    code: string = 'CLI_ERROR',
    statusCode: number = 1,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'CliError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CliError);
    }
  }
}

export class NetworkError extends CliError {
  constructor(message: string, originalError?: Error) {
    super(
      `Network error: ${message}${originalError ? ` (${originalError.message})` : ''}`,
      'NETWORK_ERROR',
      1
    );
  }
}

export class ValidationError extends CliError {
  constructor(message: string) {
    super(`Validation error: ${message}`, 'VALIDATION_ERROR', 1);
  }
}

export class ConfigurationError extends CliError {
  constructor(message: string) {
    super(`Configuration error: ${message}`, 'CONFIG_ERROR', 1);
  }
}

export class BlockchainError extends CliError {
  constructor(message: string, chainType?: string) {
    super(
      `Blockchain error${chainType ? ` (${chainType})` : ''}: ${message}`,
      'BLOCKCHAIN_ERROR',
      1
    );
  }
}

/**
 * Global error handler for uncaught exceptions and unhandled rejections
 */
export function setupGlobalErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:');
    logger.error(error.stack || error.message);

    // Attempt to cleanup and exit gracefully
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown, _promise: Promise<unknown>) => {
    logger.error('Unhandled Rejection at Promise');
    logger.error(`Reason: ${String(reason)}`);

    // Exit gracefully
    process.exit(1);
  });

  // Handle process termination signals
  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
  });
}

/**
 * Handles CLI errors with appropriate logging and exit codes
 */
export function handleCliError(error: unknown): never {
  if (error instanceof CliError) {
    // Our custom CLI errors
    logger.error(error.message);

    if (process.env.DEBUG && error.stack) {
      logger.error('Stack trace:');
      logger.error(error.stack);
    }

    process.exit(error.statusCode);
  } else if (hasErrorCode(error) && error.code === 'ENOENT') {
    // File not found errors
    const path = 'path' in error ? (error as Error & { path: string }).path : 'unknown';
    logger.error(`File not found: ${path}`);
    process.exit(1);
  } else if (hasErrorCode(error) && error.code === 'EACCES') {
    // Permission errors
    const path =
      'path' in error ? (error as Error & { path: string }).path : 'unknown file/directory';
    logger.error(`Permission denied: ${path}`);
    logger.error('Try running with appropriate permissions or check file ownership');
    process.exit(1);
  } else if (hasErrorCode(error) && (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND')) {
    // Network connection errors
    logger.error('Network connection failed');
    logger.error('Please check your internet connection and try again');
    process.exit(1);
  } else if (error instanceof Error && error.name === 'ValidationError') {
    // Validation errors from libraries
    logger.error(`Input validation failed: ${error.message}`);
    process.exit(1);
  } else {
    // Generic errors
    logger.error('An unexpected error occurred:');
    const message = error instanceof Error ? error.message : String(error);
    logger.error(message);

    if (process.env.DEBUG && error instanceof Error && error.stack) {
      logger.error('Stack trace:');
      logger.error(error.stack);
    }

    process.exit(1);
  }
}

/**
 * Wraps async functions to handle errors gracefully
 */
export function withErrorHandling<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      handleCliError(error);
    }
  };
}

/**
 * Creates a retry wrapper for operations that might fail temporarily
 */
export function withRetry<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  maxRetries: number = 3,
  delayMs: number = 1000
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn(...args);
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        // Only retry on network errors or temporary failures
        const errorWithCode = error as ErrorWithCode;
        if (
          error instanceof NetworkError ||
          errorWithCode?.code === 'ECONNREFUSED' ||
          errorWithCode?.code === 'ETIMEDOUT' ||
          errorWithCode?.code === 'ENOTFOUND'
        ) {
          logger.warn(`Attempt ${attempt} failed, retrying in ${delayMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, delayMs));
          delayMs *= 1.5; // Exponential backoff
        } else {
          // Don't retry non-recoverable errors
          break;
        }
      }
    }

    throw lastError;
  };
}

/**
 * Validates required environment variables
 */
export function validateEnvironment(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}\n` +
        'Please check your .env file or set these variables in your environment.'
    );
  }
}
