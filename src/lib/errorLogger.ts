/**
 * Error Logging Service
 * 
 * Centralized error logging with:
 * - Structured error data
 * - Context enrichment
 * - Batch sending
 * - Offline queue
 * - Console fallback
 */

export type ErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface ErrorContext {
  userId?: string;
  sessionId?: string;
  component?: string;
  action?: string;
  model?: string;
  [key: string]: unknown;
}

export interface ErrorLog {
  id: string;
  timestamp: number;
  severity: ErrorSeverity;
  message: string;
  error?: {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
  };
  context: ErrorContext;
  metadata: {
    userAgent?: string;
    url?: string;
    referrer?: string;
    screenSize?: string;
    connection?: string;
  };
}

interface ErrorLoggerConfig {
  endpoint?: string;
  batchSize?: number;
  flushInterval?: number;
  maxQueueSize?: number;
  enableConsole?: boolean;
  minSeverity?: ErrorSeverity;
  onError?: (log: ErrorLog) => void;
}

const SEVERITY_LEVELS: Record<ErrorSeverity, number> = {
  debug: 0,
  info: 1,
  warning: 2,
  error: 3,
  critical: 4,
};

const DEFAULT_CONFIG: Required<ErrorLoggerConfig> = {
  endpoint: '/api/logs',
  batchSize: 10,
  flushInterval: 30000, // 30 seconds
  maxQueueSize: 100,
  enableConsole: true,
  minSeverity: 'warning',
  onError: () => {},
};

class ErrorLogger {
  private config: Required<ErrorLoggerConfig>;
  private queue: ErrorLog[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private globalContext: ErrorContext = {};

  constructor(config: ErrorLoggerConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    if (typeof window !== 'undefined') {
      this.startAutoFlush();
      this.setupGlobalHandlers();
    }
  }

  /**
   * Set global context that will be included in all logs
   */
  setGlobalContext(context: ErrorContext): void {
    this.globalContext = { ...this.globalContext, ...context };
  }

  /**
   * Clear global context
   */
  clearGlobalContext(): void {
    this.globalContext = {};
  }

  /**
   * Log an error
   */
  log(
    severity: ErrorSeverity,
    message: string,
    error?: Error | unknown,
    context?: ErrorContext
  ): string {
    // Check minimum severity
    if (SEVERITY_LEVELS[severity] < SEVERITY_LEVELS[this.config.minSeverity]) {
      return '';
    }

    const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const log: ErrorLog = {
      id,
      timestamp: Date.now(),
      severity,
      message,
      error: error ? this.serializeError(error) : undefined,
      context: { ...this.globalContext, ...context },
      metadata: this.collectMetadata(),
    };

    // Console output
    if (this.config.enableConsole) {
      this.logToConsole(log);
    }

    // Callback
    this.config.onError(log);

    // Queue for batch sending
    this.addToQueue(log);

    return id;
  }

  /**
   * Convenience methods
   */
  debug(message: string, context?: ErrorContext): string {
    return this.log('debug', message, undefined, context);
  }

  info(message: string, context?: ErrorContext): string {
    return this.log('info', message, undefined, context);
  }

  warning(message: string, error?: Error | unknown, context?: ErrorContext): string {
    return this.log('warning', message, error, context);
  }

  error(message: string, error?: Error | unknown, context?: ErrorContext): string {
    return this.log('error', message, error, context);
  }

  critical(message: string, error?: Error | unknown, context?: ErrorContext): string {
    // Critical errors flush immediately
    const id = this.log('critical', message, error, context);
    this.flush();
    return id;
  }

  /**
   * Capture an error with automatic severity detection
   */
  capture(error: Error | unknown, context?: ErrorContext): string {
    const err = error instanceof Error ? error : new Error(String(error));
    
    // Detect severity from error type
    let severity: ErrorSeverity = 'error';
    if (err.name === 'AbortError' || err.name === 'CancelledError') {
      severity = 'info';
    } else if (err.name === 'NetworkError' || err.message.includes('network')) {
      severity = 'warning';
    } else if (err.name === 'TypeError' || err.name === 'ReferenceError') {
      severity = 'critical';
    }

    return this.log(severity, err.message, err, context);
  }

  /**
   * Flush queued logs to server
   */
  async flush(): Promise<void> {
    if (this.queue.length === 0) return;

    const logs = [...this.queue];
    this.queue = [];

    try {
      if (typeof fetch !== 'undefined' && this.config.endpoint) {
        await fetch(this.config.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ logs }),
        });
      }
    } catch (error) {
      // Re-queue on failure (up to max)
      this.queue = [...logs, ...this.queue].slice(0, this.config.maxQueueSize);
      console.error('[ErrorLogger] Failed to flush logs:', error);
    }
  }

  /**
   * Destroy the logger
   */
  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }

  // Private methods

  private serializeError(error: unknown): ErrorLog['error'] {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
        cause: error.cause,
      };
    }
    
    return {
      name: 'Unknown',
      message: String(error),
    };
  }

  private collectMetadata(): ErrorLog['metadata'] {
    if (typeof window === 'undefined') return {};

    const metadata: ErrorLog['metadata'] = {
      url: window.location.href,
      referrer: document.referrer,
      userAgent: navigator.userAgent,
      screenSize: `${window.innerWidth}x${window.innerHeight}`,
    };

    // Connection info
    const connection = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
    if (connection?.effectiveType) {
      metadata.connection = connection.effectiveType;
    }

    return metadata;
  }

  private logToConsole(log: ErrorLog): void {
    const prefix = `[${log.severity.toUpperCase()}] ${new Date(log.timestamp).toISOString()}`;
    const contextStr = Object.keys(log.context).length > 0 
      ? `\nContext: ${JSON.stringify(log.context, null, 2)}` 
      : '';

    switch (log.severity) {
      case 'debug':
        console.debug(prefix, log.message, contextStr);
        break;
      case 'info':
        console.info(prefix, log.message, contextStr);
        break;
      case 'warning':
        console.warn(prefix, log.message, log.error?.stack || '', contextStr);
        break;
      case 'error':
      case 'critical':
        console.error(prefix, log.message, log.error?.stack || '', contextStr);
        break;
    }
  }

  private addToQueue(log: ErrorLog): void {
    this.queue.push(log);

    // Flush if batch size reached
    if (this.queue.length >= this.config.batchSize) {
      this.flush();
    }

    // Trim queue if too large
    if (this.queue.length > this.config.maxQueueSize) {
      this.queue = this.queue.slice(-this.config.maxQueueSize);
    }
  }

  private startAutoFlush(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.config.flushInterval);
  }

  private setupGlobalHandlers(): void {
    // Unhandled errors
    window.addEventListener('error', (event) => {
      this.error(
        event.message || 'Unhandled error',
        event.error,
        { component: 'window', action: 'unhandled-error' }
      );
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.error(
        'Unhandled promise rejection',
        event.reason,
        { component: 'window', action: 'unhandled-rejection' }
      );
    });
  }
}

// Singleton instance
let loggerInstance: ErrorLogger | null = null;

export function getErrorLogger(config?: ErrorLoggerConfig): ErrorLogger {
  if (!loggerInstance) {
    loggerInstance = new ErrorLogger(config);
  }
  return loggerInstance;
}

export function initErrorLogger(config: ErrorLoggerConfig): ErrorLogger {
  if (loggerInstance) {
    loggerInstance.destroy();
  }
  loggerInstance = new ErrorLogger(config);
  return loggerInstance;
}

// Convenience exports
export const logger = {
  debug: (message: string, context?: ErrorContext) => 
    getErrorLogger().debug(message, context),
  info: (message: string, context?: ErrorContext) => 
    getErrorLogger().info(message, context),
  warning: (message: string, error?: Error | unknown, context?: ErrorContext) => 
    getErrorLogger().warning(message, error, context),
  error: (message: string, error?: Error | unknown, context?: ErrorContext) => 
    getErrorLogger().error(message, error, context),
  critical: (message: string, error?: Error | unknown, context?: ErrorContext) => 
    getErrorLogger().critical(message, error, context),
  capture: (error: Error | unknown, context?: ErrorContext) => 
    getErrorLogger().capture(error, context),
  setContext: (context: ErrorContext) => 
    getErrorLogger().setGlobalContext(context),
};

export default ErrorLogger;
