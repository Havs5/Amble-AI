/**
 * RetryQueue - Automatic retry mechanism for failed operations
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Maximum retry attempts
 * - Dead letter queue for persistent failures
 * - Priority-based processing
 * - Persistence across page refreshes
 */

export interface RetryableOperation<T = unknown> {
  id: string;
  type: 'message' | 'session' | 'search' | 'generic';
  payload: T;
  attempts: number;
  maxAttempts: number;
  lastError?: string;
  createdAt: number;
  nextRetryAt: number;
  priority: 'high' | 'normal' | 'low';
}

export interface RetryQueueConfig {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterMs?: number;
  persistenceKey?: string;
}

type RetryHandler<T> = (operation: RetryableOperation<T>) => Promise<void>;
type FailureHandler<T> = (operation: RetryableOperation<T>) => void;

const DEFAULT_CONFIG: Required<RetryQueueConfig> = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterMs: 500,
  persistenceKey: 'amble_retry_queue',
};

class RetryQueueService {
  private queue: Map<string, RetryableOperation> = new Map();
  private deadLetterQueue: Map<string, RetryableOperation> = new Map();
  private handlers: Map<string, RetryHandler<unknown>> = new Map();
  private failureHandlers: Map<string, FailureHandler<unknown>> = new Map();
  private config: Required<RetryQueueConfig>;
  private processingInterval: ReturnType<typeof setInterval> | null = null;
  private isProcessing = false;

  constructor(config: RetryQueueConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.loadFromStorage();
  }

  /**
   * Register a handler for a specific operation type
   */
  registerHandler<T>(type: string, handler: RetryHandler<T>, onFailure?: FailureHandler<T>): void {
    this.handlers.set(type, handler as RetryHandler<unknown>);
    if (onFailure) {
      this.failureHandlers.set(type, onFailure as FailureHandler<unknown>);
    }
  }

  /**
   * Add an operation to the retry queue
   */
  enqueue<T>(
    type: RetryableOperation['type'],
    payload: T,
    options: {
      priority?: RetryableOperation['priority'];
      maxAttempts?: number;
    } = {}
  ): string {
    const id = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    
    const operation: RetryableOperation<T> = {
      id,
      type,
      payload,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? this.config.maxAttempts,
      createdAt: Date.now(),
      nextRetryAt: Date.now(), // Immediate first attempt
      priority: options.priority ?? 'normal',
    };

    this.queue.set(id, operation as RetryableOperation);
    this.saveToStorage();
    this.startProcessing();
    
    return id;
  }

  /**
   * Remove an operation from the queue
   */
  dequeue(id: string): boolean {
    const removed = this.queue.delete(id);
    if (removed) {
      this.saveToStorage();
    }
    return removed;
  }

  /**
   * Get all operations in the queue
   */
  getQueue(): RetryableOperation[] {
    return Array.from(this.queue.values())
      .sort((a, b) => {
        // Sort by priority first, then by next retry time
        const priorityOrder = { high: 0, normal: 1, low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        return priorityDiff !== 0 ? priorityDiff : a.nextRetryAt - b.nextRetryAt;
      });
  }

  /**
   * Get all operations in the dead letter queue
   */
  getDeadLetterQueue(): RetryableOperation[] {
    return Array.from(this.deadLetterQueue.values());
  }

  /**
   * Retry a specific operation from the dead letter queue
   */
  retryFromDeadLetter(id: string): boolean {
    const operation = this.deadLetterQueue.get(id);
    if (!operation) return false;

    operation.attempts = 0;
    operation.nextRetryAt = Date.now();
    delete operation.lastError;
    
    this.deadLetterQueue.delete(id);
    this.queue.set(id, operation);
    this.saveToStorage();
    this.startProcessing();
    
    return true;
  }

  /**
   * Clear all operations from the dead letter queue
   */
  clearDeadLetterQueue(): void {
    this.deadLetterQueue.clear();
    this.saveToStorage();
  }

  /**
   * Calculate delay with exponential backoff and jitter
   */
  private calculateDelay(attempts: number): number {
    const exponentialDelay = this.config.baseDelayMs * Math.pow(2, attempts);
    const jitter = Math.random() * this.config.jitterMs;
    return Math.min(exponentialDelay + jitter, this.config.maxDelayMs);
  }

  /**
   * Process a single operation
   */
  private async processOperation(operation: RetryableOperation): Promise<boolean> {
    const handler = this.handlers.get(operation.type);
    if (!handler) {
      console.warn(`[RetryQueue] No handler registered for type: ${operation.type}`);
      return false;
    }

    try {
      await handler(operation);
      this.queue.delete(operation.id);
      this.saveToStorage();
      console.log(`[RetryQueue] Successfully processed: ${operation.id}`);
      return true;
    } catch (error) {
      operation.attempts++;
      operation.lastError = error instanceof Error ? error.message : String(error);
      
      if (operation.attempts >= operation.maxAttempts) {
        // Move to dead letter queue
        this.queue.delete(operation.id);
        this.deadLetterQueue.set(operation.id, operation);
        
        // Call failure handler if registered
        const failureHandler = this.failureHandlers.get(operation.type);
        if (failureHandler) {
          failureHandler(operation);
        }
        
        console.error(`[RetryQueue] Max attempts reached, moved to DLQ: ${operation.id}`, operation.lastError);
      } else {
        // Schedule retry with backoff
        operation.nextRetryAt = Date.now() + this.calculateDelay(operation.attempts);
        console.log(`[RetryQueue] Retry scheduled for ${operation.id}, attempt ${operation.attempts}/${operation.maxAttempts}`);
      }
      
      this.saveToStorage();
      return false;
    }
  }

  /**
   * Process all ready operations
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const readyOperations = this.getQueue().filter(op => op.nextRetryAt <= now);

      for (const operation of readyOperations) {
        await this.processOperation(operation);
        // Small delay between operations to prevent overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } finally {
      this.isProcessing = false;
      
      // Stop processing if queue is empty
      if (this.queue.size === 0) {
        this.stopProcessing();
      }
    }
  }

  /**
   * Start the processing interval
   */
  private startProcessing(): void {
    if (this.processingInterval) return;
    
    // Process immediately
    this.processQueue();
    
    // Then check every second
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 1000);
  }

  /**
   * Stop the processing interval
   */
  private stopProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Save queue state to localStorage
   */
  private saveToStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const state = {
        queue: Array.from(this.queue.entries()),
        deadLetterQueue: Array.from(this.deadLetterQueue.entries()),
      };
      localStorage.setItem(this.config.persistenceKey, JSON.stringify(state));
    } catch (error) {
      console.warn('[RetryQueue] Failed to save to storage:', error);
    }
  }

  /**
   * Load queue state from localStorage
   */
  private loadFromStorage(): void {
    if (typeof window === 'undefined') return;
    
    try {
      const stored = localStorage.getItem(this.config.persistenceKey);
      if (stored) {
        const state = JSON.parse(stored);
        this.queue = new Map(state.queue);
        this.deadLetterQueue = new Map(state.deadLetterQueue);
        
        // Resume processing if there are items in the queue
        if (this.queue.size > 0) {
          this.startProcessing();
        }
      }
    } catch (error) {
      console.warn('[RetryQueue] Failed to load from storage:', error);
    }
  }

  /**
   * Get queue statistics
   */
  getStats(): {
    pending: number;
    deadLetter: number;
    oldestPending: number | null;
    averageAttempts: number;
  } {
    const queueArray = Array.from(this.queue.values());
    
    return {
      pending: this.queue.size,
      deadLetter: this.deadLetterQueue.size,
      oldestPending: queueArray.length > 0 
        ? Math.min(...queueArray.map(op => op.createdAt))
        : null,
      averageAttempts: queueArray.length > 0
        ? queueArray.reduce((sum, op) => sum + op.attempts, 0) / queueArray.length
        : 0,
    };
  }

  /**
   * Destroy the queue service
   */
  destroy(): void {
    this.stopProcessing();
    this.queue.clear();
    this.deadLetterQueue.clear();
    this.handlers.clear();
    this.failureHandlers.clear();
  }
}

// Singleton instance
let retryQueueInstance: RetryQueueService | null = null;

export function getRetryQueue(config?: RetryQueueConfig): RetryQueueService {
  if (!retryQueueInstance) {
    retryQueueInstance = new RetryQueueService(config);
  }
  return retryQueueInstance;
}

export const retryQueue = typeof window !== 'undefined' ? getRetryQueue() : null;

export default RetryQueueService;
