import winston from 'winston';
const { createLogger, format, transports } = winston;
type Logger = winston.Logger;

// Log levels
export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// Logger configuration
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.json()
);

const consoleFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    let log = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    if (metaStr) {
      log += `\n${metaStr}`;
    }

    return log;
  })
);

// Create the main logger
const logger: Logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    // Console transport
    new transports.Console({
      format: consoleFormat,
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
  // Handle uncaught exceptions
  exceptionHandlers: [
    new transports.Console({
      format: consoleFormat,
    }),
  ],
  // Handle unhandled promise rejections
  rejectionHandlers: [
    new transports.Console({
      format: consoleFormat,
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new transports.File({
      filename: 'error.log',
      level: 'error',
      format: logFormat,
    })
  );

  logger.add(
    new transports.File({
      filename: 'combined.log',
      format: logFormat,
    })
  );
}

// Enhanced logging methods with context
export class ContextualLogger {
  private context: string;
  private logger: Logger;

  constructor(context: string, baseLogger: Logger = logger) {
    this.context = context;
    this.logger = baseLogger;
  }

  private log(level: LogLevel, message: string, meta?: any): void {
    this.logger.log(level, message, {
      context: this.context,
      ...meta,
    });
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const errorMeta =
      error instanceof Error
        ? {
            name: error.name,
            message: error.message,
            stack: error.stack,
            ...meta,
          }
        : { error, ...meta };

    this.log('error', message, errorMeta);
  }

  warn(message: string, meta?: any): void {
    this.log('warn', message, meta);
  }

  info(message: string, meta?: any): void {
    this.log('info', message, meta);
  }

  debug(message: string, meta?: any): void {
    this.log('debug', message, meta);
  }

  // Specialized logging methods for CLI
  command(command: string, args?: any): void {
    this.info(`Executing command: ${command}`, { args });
  }

  transaction(txHash: string, chain: string, status: 'pending' | 'confirmed' | 'failed'): void {
    this.info(`Transaction ${status}`, {
      txHash,
      chain,
      status,
    });
  }

  intent(intentHash: string, action: string, details?: any): void {
    this.info(`Intent ${action}`, {
      intentHash,
      action,
      ...details,
    });
  }

  wallet(address: string, vmType: string, action: string): void {
    this.info(`Wallet ${action}`, {
      address: this.maskAddress(address),
      vmType,
      action,
    });
  }

  private maskAddress(address: string): string {
    if (address.length <= 10) return address;
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }
}

// Create contextual loggers for different components
export const createContextualLogger = (context: string): ContextualLogger => {
  return new ContextualLogger(context);
};

// Pre-configured loggers for common components
export const loggers = {
  cli: createContextualLogger('CLI'),
  chain: createContextualLogger('ChainManager'),
  wallet: createContextualLogger('WalletManager'),
  intent: createContextualLogger('IntentBuilder'),
  adapter: createContextualLogger('VMAdapter'),
  registry: createContextualLogger('TokenRegistry'),
  command: createContextualLogger('Command'),
};

// Performance logging utility
export class PerformanceLogger {
  private static timers = new Map<string, number>();

  static start(operation: string, context?: string): void {
    const key = context ? `${context}:${operation}` : operation;
    PerformanceLogger.timers.set(key, Date.now());

    const contextLogger = context ? createLogger(context) : logger;
    contextLogger.debug(`Starting operation: ${operation}`);
  }

  static end(operation: string, context?: string): number {
    const key = context ? `${context}:${operation}` : operation;
    const startTime = PerformanceLogger.timers.get(key);

    if (!startTime) {
      const contextLogger = context ? createLogger(context) : logger;
      contextLogger.warn(`No start time found for operation: ${operation}`);
      return 0;
    }

    const duration = Date.now() - startTime;
    PerformanceLogger.timers.delete(key);

    const contextLogger = context ? createLogger(context) : logger;
    contextLogger.info(`Completed operation: ${operation}`, {
      duration: `${duration}ms`,
      operation,
    });

    return duration;
  }

  static async measure<T>(operation: string, fn: () => Promise<T>, context?: string): Promise<T> {
    PerformanceLogger.start(operation, context);
    try {
      const result = await fn();
      PerformanceLogger.end(operation, context);
      return result;
    } catch (error) {
      PerformanceLogger.end(operation, context);
      const contextLogger = context ? createLogger(context) : logger;
      contextLogger.error(`Operation failed: ${operation}`, error);
      throw error;
    }
  }
}

// Utility functions
export const logError = (error: Error, context?: string): void => {
  const contextLogger = context ? createLogger(context) : logger;
  contextLogger.error('Unhandled error', error);
};

export const logTransaction = (
  txHash: string,
  chain: string,
  status: 'pending' | 'confirmed' | 'failed',
  context?: string
): void => {
  const contextLogger = context ? createLogger(context) : loggers.chain;
  contextLogger.transaction(txHash, chain, status);
};

export const logIntent = (
  intentHash: string,
  action: string,
  details?: any,
  context?: string
): void => {
  const contextLogger = context ? createLogger(context) : loggers.intent;
  contextLogger.intent(intentHash, action, details);
};

// Set log level dynamically
export const setLogLevel = (level: LogLevel): void => {
  logger.level = level;
};

// Get current log level
export const getLogLevel = (): string => {
  return logger.level;
};

// Export the main logger
export { logger };
export default logger;
