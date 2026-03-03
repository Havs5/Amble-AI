/**
 * useDebounce & useThrottle Hook Tests
 * 
 * Tests for debounce and throttle hooks including:
 * - Value debouncing
 * - Callback debouncing with cancel/flush
 * - Value throttling
 * - Callback throttling
 * - Cleanup on unmount
 * 
 * Run with: npm test -- --testPathPatterns=useDebounce
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { 
  useDebounce, 
  useDebouncedCallback, 
  useThrottle, 
  useThrottledCallback 
} from '@/hooks/useDebounce';

// Use fake timers for all tests
beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

describe('useDebounce', () => {
  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should debounce value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'initial' } }
    );

    expect(result.current).toBe('initial');

    // Change value
    rerender({ value: 'updated' });
    expect(result.current).toBe('initial'); // Still initial

    // Advance time partially
    act(() => {
      jest.advanceTimersByTime(300);
    });
    expect(result.current).toBe('initial'); // Still initial

    // Complete the delay
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(result.current).toBe('updated'); // Now updated
  });

  it('should reset timer on rapid changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 500),
      { initialProps: { value: 'a' } }
    );

    // Rapid changes
    rerender({ value: 'b' });
    act(() => { jest.advanceTimersByTime(200); });
    
    rerender({ value: 'c' });
    act(() => { jest.advanceTimersByTime(200); });
    
    rerender({ value: 'd' });
    act(() => { jest.advanceTimersByTime(200); });

    // Still at initial value
    expect(result.current).toBe('a');

    // Complete the delay after last change
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('d');
  });

  it('should handle number values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 0 } }
    );

    rerender({ value: 100 });
    
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe(100);
  });

  it('should handle object values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: { count: 0 } } }
    );

    rerender({ value: { count: 5 } });
    
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toEqual({ count: 5 });
  });
});

describe('useDebouncedCallback', () => {
  it('should debounce callback execution', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useDebouncedCallback(mockFn, 500)
    );

    // Call multiple times rapidly
    act(() => {
      result.current.callback('a');
      result.current.callback('b');
      result.current.callback('c');
    });

    expect(mockFn).not.toHaveBeenCalled();

    // Advance time
    act(() => { jest.advanceTimersByTime(500); });

    // Should only be called once with last args
    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('c');
  });

  it('should track pending state', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useDebouncedCallback(mockFn, 500)
    );

    expect(result.current.isPending).toBe(false);

    act(() => {
      result.current.callback();
    });

    expect(result.current.isPending).toBe(true);

    act(() => { jest.advanceTimersByTime(500); });

    expect(result.current.isPending).toBe(false);
  });

  it('should cancel pending callback', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useDebouncedCallback(mockFn, 500)
    );

    act(() => {
      result.current.callback('test');
    });

    expect(result.current.isPending).toBe(true);

    act(() => {
      result.current.cancel();
    });

    expect(result.current.isPending).toBe(false);

    // Advance time - callback should not fire
    act(() => { jest.advanceTimersByTime(500); });

    expect(mockFn).not.toHaveBeenCalled();
  });

  it('should flush pending callback immediately', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useDebouncedCallback(mockFn, 500)
    );

    act(() => {
      result.current.callback('test');
    });

    expect(mockFn).not.toHaveBeenCalled();

    act(() => {
      result.current.flush();
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('test');
    expect(result.current.isPending).toBe(false);
  });

  it('should preserve multiple arguments', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useDebouncedCallback(mockFn, 300)
    );

    act(() => {
      result.current.callback('arg1', 'arg2', 123);
    });

    act(() => { jest.advanceTimersByTime(300); });

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2', 123);
  });
});

describe('useThrottle', () => {
  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useThrottle('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should update after throttle interval passes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 500),
      { initialProps: { value: 'a' } }
    );

    expect(result.current).toBe('a');

    // Change value
    rerender({ value: 'b' });
    
    // Value is scheduled, wait for the full throttle interval
    act(() => { jest.advanceTimersByTime(500); });
    
    expect(result.current).toBe('b');
  });

  it('should throttle rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 500),
      { initialProps: { value: 'a' } }
    );

    // Immediate first update is always allowed
    expect(result.current).toBe('a');

    // Rapid changes within throttle window
    rerender({ value: 'b' });
    rerender({ value: 'c' });
    
    // Should still be 'a' since we're within the throttle window
    // (first render was at t=0)
    expect(result.current).toBe('a');

    // Advance past throttle interval
    act(() => { jest.advanceTimersByTime(500); });

    // Now should have updated to latest value
    expect(result.current).toBe('c');
  });

  it('should handle number values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 300),
      { initialProps: { value: 0 } }
    );

    rerender({ value: 100 });
    
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe(100);
  });
});

describe('useThrottledCallback', () => {
  it('should execute immediately on first call', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useThrottledCallback(mockFn, 500)
    );

    // First render happens, wait for interval to pass
    act(() => { jest.advanceTimersByTime(500); });

    act(() => {
      result.current.callback('first');
    });

    expect(mockFn).toHaveBeenCalledTimes(1);
    expect(mockFn).toHaveBeenCalledWith('first');
  });

  it('should throttle subsequent calls', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useThrottledCallback(mockFn, 500)
    );

    // Wait for initial interval
    act(() => { jest.advanceTimersByTime(500); });

    // First call - immediate
    act(() => { result.current.callback('first'); });
    expect(mockFn).toHaveBeenCalledTimes(1);

    // Second call within interval - throttled
    act(() => { result.current.callback('second'); });
    expect(mockFn).toHaveBeenCalledTimes(1); // Still 1

    // Wait for throttle interval
    act(() => { jest.advanceTimersByTime(500); });

    // Now the second call should have fired
    expect(mockFn).toHaveBeenCalledTimes(2);
  });

  it('should track pending state', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useThrottledCallback(mockFn, 500)
    );

    // Wait for initial interval and call
    act(() => { jest.advanceTimersByTime(500); });
    act(() => { result.current.callback(); });

    // Call again - should be pending
    act(() => { result.current.callback(); });
    expect(result.current.isPending).toBe(true);

    // Wait for throttle
    act(() => { jest.advanceTimersByTime(500); });
    expect(result.current.isPending).toBe(false);
  });

  it('should cancel pending callback', () => {
    const mockFn = jest.fn();
    const { result } = renderHook(() => 
      useThrottledCallback(mockFn, 500)
    );

    // Wait for initial interval and make first call
    act(() => { jest.advanceTimersByTime(500); });
    act(() => { result.current.callback(); });
    expect(mockFn).toHaveBeenCalledTimes(1);

    // Second call - throttled
    act(() => { result.current.callback(); });
    expect(result.current.isPending).toBe(true);

    // Cancel
    act(() => { result.current.cancel(); });
    expect(result.current.isPending).toBe(false);

    // Wait - callback should not have been called
    act(() => { jest.advanceTimersByTime(500); });
    expect(mockFn).toHaveBeenCalledTimes(1);
  });
});
