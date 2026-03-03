/**
 * useMutation - Mutation hook for async operations with optimistic updates
 * 
 * Features:
 * - Async mutation handling
 * - Loading and error states
 * - Optimistic updates with rollback
 * - Retry with exponential backoff
 * - Success/error callbacks
 * - Mutation queue for ordering
 */

'use client';

import { useState, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface MutationOptions<TData, TVariables, TContext = unknown> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  onMutate?: (variables: TVariables) => TContext | Promise<TContext>;
  onSuccess?: (data: TData, variables: TVariables, context: TContext) => void | Promise<void>;
  onError?: (error: Error, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
  onSettled?: (data: TData | undefined, error: Error | null, variables: TVariables, context: TContext | undefined) => void | Promise<void>;
  retry?: number | boolean;
  retryDelay?: number | ((attempt: number, error: Error) => number);
}

export interface MutationResult<TData, TVariables> {
  data: TData | null;
  error: Error | null;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
  isIdle: boolean;
  mutate: (variables: TVariables) => void;
  mutateAsync: (variables: TVariables) => Promise<TData>;
  reset: () => void;
}

export type MutationStatus = 'idle' | 'loading' | 'success' | 'error';

// ============================================================================
// Hook
// ============================================================================

export function useMutation<TData = unknown, TVariables = void, TContext = unknown>({
  mutationFn,
  onMutate,
  onSuccess,
  onError,
  onSettled,
  retry = 0,
  retryDelay = 1000,
}: MutationOptions<TData, TVariables, TContext>): MutationResult<TData, TVariables> {
  const [status, setStatus] = useState<MutationStatus>('idle');
  const [data, setData] = useState<TData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  
  const mountedRef = useRef(true);
  const attemptRef = useRef(0);

  // Calculate retry delay
  const getRetryDelay = useCallback((attempt: number, err: Error): number => {
    if (typeof retryDelay === 'function') {
      return retryDelay(attempt, err);
    }
    // Exponential backoff
    return retryDelay * Math.pow(2, attempt);
  }, [retryDelay]);

  // Get max retries
  const getMaxRetries = useCallback((): number => {
    if (retry === true) return 3;
    if (retry === false) return 0;
    return retry;
  }, [retry]);

  // Execute mutation
  const executeMutation = useCallback(async (
    variables: TVariables,
    context?: TContext
  ): Promise<TData> => {
    try {
      const result = await mutationFn(variables);
      
      if (!mountedRef.current) throw new Error('Component unmounted');

      setData(result);
      setStatus('success');
      setError(null);
      attemptRef.current = 0;

      await onSuccess?.(result, variables, context as TContext);
      await onSettled?.(result, null, variables, context);

      return result;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      // Check for retry
      const maxRetries = getMaxRetries();
      if (attemptRef.current < maxRetries) {
        attemptRef.current++;
        const delay = getRetryDelay(attemptRef.current, error);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (mountedRef.current) {
          return executeMutation(variables, context);
        }
      }

      if (!mountedRef.current) throw error;

      setError(error);
      setStatus('error');
      attemptRef.current = 0;

      await onError?.(error, variables, context);
      await onSettled?.(undefined, error, variables, context);

      throw error;
    }
  }, [mutationFn, onSuccess, onError, onSettled, getMaxRetries, getRetryDelay]);

  // Async mutation
  const mutateAsync = useCallback(async (variables: TVariables): Promise<TData> => {
    setStatus('loading');
    setError(null);

    let context: TContext | undefined;

    try {
      context = await onMutate?.(variables);
    } catch (err) {
      // onMutate failed
    }

    return executeMutation(variables, context);
  }, [executeMutation, onMutate]);

  // Sync mutation (fire and forget)
  const mutate = useCallback((variables: TVariables): void => {
    mutateAsync(variables).catch(() => {
      // Error is already handled in executeMutation
    });
  }, [mutateAsync]);

  // Reset state
  const reset = useCallback(() => {
    setStatus('idle');
    setData(null);
    setError(null);
    attemptRef.current = 0;
  }, []);

  return {
    data,
    error,
    isLoading: status === 'loading',
    isError: status === 'error',
    isSuccess: status === 'success',
    isIdle: status === 'idle',
    mutate,
    mutateAsync,
    reset,
  };
}

// ============================================================================
// useOptimisticMutation - Pre-built optimistic update pattern
// ============================================================================

export interface OptimisticMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables) => Promise<TData>;
  optimisticUpdate: (variables: TVariables) => TData;
  onSuccess?: (data: TData, variables: TVariables) => void;
  onError?: (error: Error, variables: TVariables, rollback: TData) => void;
  getCurrentData: () => TData;
  setData: (data: TData) => void;
}

export function useOptimisticMutation<TData, TVariables>({
  mutationFn,
  optimisticUpdate,
  onSuccess,
  onError,
  getCurrentData,
  setData,
}: OptimisticMutationOptions<TData, TVariables>) {
  return useMutation<TData, TVariables, TData>({
    mutationFn,
    onMutate: (variables) => {
      const previousData = getCurrentData();
      const optimisticData = optimisticUpdate(variables);
      setData(optimisticData);
      return previousData;
    },
    onSuccess: (data, variables) => {
      setData(data);
      onSuccess?.(data, variables);
    },
    onError: (error, variables, previousData) => {
      if (previousData) {
        setData(previousData);
      }
      onError?.(error, variables, previousData as TData);
    },
  });
}

// ============================================================================
// useMutationQueue - Sequential mutation processing
// ============================================================================

interface QueuedMutation<TVariables> {
  id: string;
  variables: TVariables;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
}

export function useMutationQueue<TData, TVariables>({
  mutationFn,
  onSuccess,
  onError,
}: Pick<MutationOptions<TData, TVariables, unknown>, 'mutationFn' | 'onSuccess' | 'onError'>) {
  const queueRef = useRef<QueuedMutation<TVariables>[]>([]);
  const processingRef = useRef(false);

  const [queueLength, setQueueLength] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;

    processingRef.current = true;
    setIsProcessing(true);

    while (queueRef.current.length > 0) {
      const mutation = queueRef.current[0];

      try {
        const result = await mutationFn(mutation.variables);
        onSuccess?.(result, mutation.variables, undefined);
        mutation.resolve(result);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        onError?.(error, mutation.variables, undefined);
        mutation.reject(error);
      }

      queueRef.current.shift();
      setQueueLength(queueRef.current.length);
    }

    processingRef.current = false;
    setIsProcessing(false);
  }, [mutationFn, onSuccess, onError]);

  const enqueue = useCallback((variables: TVariables): Promise<TData> => {
    return new Promise((resolve, reject) => {
      queueRef.current.push({
        id: Math.random().toString(36).slice(2),
        variables,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      setQueueLength(queueRef.current.length);
      processQueue();
    });
  }, [processQueue]);

  const clear = useCallback(() => {
    queueRef.current.forEach(mutation => {
      mutation.reject(new Error('Queue cleared'));
    });
    queueRef.current = [];
    setQueueLength(0);
  }, []);

  return {
    enqueue,
    clear,
    queueLength,
    isProcessing,
  };
}

// ============================================================================
// useBatchMutation - Batch multiple mutations
// ============================================================================

export interface BatchMutationOptions<TData, TVariables> {
  mutationFn: (variables: TVariables[]) => Promise<TData[]>;
  batchSize?: number;
  batchDelay?: number;
  onBatchSuccess?: (data: TData[], variables: TVariables[]) => void;
  onBatchError?: (error: Error, variables: TVariables[]) => void;
}

export function useBatchMutation<TData, TVariables>({
  mutationFn,
  batchSize = 10,
  batchDelay = 50,
  onBatchSuccess,
  onBatchError,
}: BatchMutationOptions<TData, TVariables>) {
  const batchRef = useRef<{
    variables: TVariables;
    resolve: (value: TData) => void;
    reject: (error: Error) => void;
  }[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);

  const processBatch = useCallback(async () => {
    if (batchRef.current.length === 0) return;

    const batch = batchRef.current.splice(0, batchSize);
    const variables = batch.map(b => b.variables);

    setIsProcessing(true);

    try {
      const results = await mutationFn(variables);
      
      batch.forEach((item, index) => {
        item.resolve(results[index]);
      });

      onBatchSuccess?.(results, variables);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      
      batch.forEach(item => {
        item.reject(error);
      });

      onBatchError?.(error, variables);
    }

    setIsProcessing(false);

    // Process remaining if any
    if (batchRef.current.length > 0) {
      processBatch();
    }
  }, [mutationFn, batchSize, onBatchSuccess, onBatchError]);

  const scheduleBatch = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      processBatch();
    }, batchDelay);
  }, [batchDelay, processBatch]);

  const mutate = useCallback((variables: TVariables): Promise<TData> => {
    return new Promise((resolve, reject) => {
      batchRef.current.push({ variables, resolve, reject });

      if (batchRef.current.length >= batchSize) {
        processBatch();
      } else {
        scheduleBatch();
      }
    });
  }, [batchSize, processBatch, scheduleBatch]);

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    processBatch();
  }, [processBatch]);

  return {
    mutate,
    flush,
    isProcessing,
    pendingCount: batchRef.current.length,
  };
}

export default useMutation;
