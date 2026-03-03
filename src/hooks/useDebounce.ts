/**
 * useDebounce & useThrottle - Rate limiting hooks
 * 
 * Features:
 * - Debounced values and callbacks
 * - Throttled values and callbacks
 * - Configurable timing
 * - Cleanup on unmount
 */

'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ============================================================================
// useDebounce - Value
// ============================================================================

/**
 * Debounce a value - only updates after delay of no changes
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

// ============================================================================
// useDebouncedCallback
// ============================================================================

/**
 * Debounce a callback function
 */
export function useDebouncedCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  delay: number,
  deps: React.DependencyList = []
): {
  callback: (...args: Parameters<T>) => void;
  cancel: () => void;
  flush: () => void;
  isPending: boolean;
} {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const argsRef = useRef<Parameters<T> | null>(null);
  const [isPending, setIsPending] = useState(false);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      argsRef.current = null;
      setIsPending(false);
    }
  }, []);

  const flush = useCallback(() => {
    if (timeoutRef.current && argsRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      callbackRef.current(...(argsRef.current as Parameters<T>));
      argsRef.current = null;
      setIsPending(false);
    }
  }, []);

  const debouncedCallback = useCallback((...args: Parameters<T>) => {
    argsRef.current = args;
    setIsPending(true);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      if (argsRef.current) {
        callbackRef.current(...(argsRef.current as Parameters<T>));
        argsRef.current = null;
      }
      timeoutRef.current = null;
      setIsPending(false);
    }, delay);
  }, [delay, ...deps]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    callback: debouncedCallback,
    cancel,
    flush,
    isPending,
  };
}

// ============================================================================
// useThrottle - Value
// ============================================================================

/**
 * Throttle a value - updates at most once per interval
 */
export function useThrottle<T>(value: T, interval: number): T {
  const [throttledValue, setThrottledValue] = useState(value);
  const lastUpdated = useRef(Date.now());
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdated.current;

    if (timeSinceLastUpdate >= interval) {
      // Enough time has passed, update immediately
      setThrottledValue(value);
      lastUpdated.current = now;
    } else {
      // Schedule update for remaining time
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setThrottledValue(value);
        lastUpdated.current = Date.now();
      }, interval - timeSinceLastUpdate);
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [value, interval]);

  return throttledValue;
}

// ============================================================================
// useThrottledCallback
// ============================================================================

/**
 * Throttle a callback function
 */
export function useThrottledCallback<T extends (...args: Parameters<T>) => ReturnType<T>>(
  callback: T,
  interval: number,
  deps: React.DependencyList = []
): {
  callback: (...args: Parameters<T>) => void;
  cancel: () => void;
  isPending: boolean;
} {
  const lastCalledRef = useRef(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  const [isPending, setIsPending] = useState(false);

  // Update callback ref
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      setIsPending(false);
    }
  }, []);

  const throttledCallback = useCallback((...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCalledRef.current;

    if (timeSinceLastCall >= interval) {
      // Execute immediately
      lastCalledRef.current = now;
      callbackRef.current(...args);
    } else {
      // Schedule for later
      setIsPending(true);
      
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        lastCalledRef.current = Date.now();
        callbackRef.current(...args);
        timeoutRef.current = null;
        setIsPending(false);
      }, interval - timeSinceLastCall);
    }
  }, [interval, ...deps]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    callback: throttledCallback,
    cancel,
    isPending,
  };
}

// ============================================================================
// useDebounceState
// ============================================================================

/**
 * useState with built-in debouncing
 */
export function useDebouncedState<T>(
  initialValue: T,
  delay: number
): [T, T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState(initialValue);
  const debouncedValue = useDebounce(value, delay);

  return [debouncedValue, value, setValue];
}

// ============================================================================
// Utility: createDebounce
// ============================================================================

/**
 * Create a standalone debounced function
 */
export function createDebounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
  flush: () => void;
} {
  let timeoutId: NodeJS.Timeout | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      if (lastArgs) {
        fn(...(lastArgs as Parameters<T>));
        lastArgs = null;
      }
      timeoutId = null;
    }, delay);
  };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
      lastArgs = null;
    }
  };

  debounced.flush = () => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      fn(...(lastArgs as Parameters<T>));
      timeoutId = null;
      lastArgs = null;
    }
  };

  return debounced;
}

/**
 * Create a standalone throttled function
 */
export function createThrottle<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  interval: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} {
  let lastCalled = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCalled;

    if (timeSinceLastCall >= interval) {
      lastCalled = now;
      fn(...args);
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(() => {
        lastCalled = Date.now();
        fn(...args);
        timeoutId = null;
      }, interval - timeSinceLastCall);
    }
  };

  throttled.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return throttled;
}

export default {
  useDebounce,
  useDebouncedCallback,
  useThrottle,
  useThrottledCallback,
  useDebouncedState,
  createDebounce,
  createThrottle,
};
