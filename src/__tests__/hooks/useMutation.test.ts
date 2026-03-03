// @ts-nocheck
/**
 * useMutation Hook Tests
 * 
 * Tests for the mutation hook including:
 * - Basic mutation execution
 * - Loading, success, error states
 * - Retry with exponential backoff
 * - Callbacks (onMutate, onSuccess, onError, onSettled)
 * - Reset functionality
 * 
 * Run with: npm test -- --testPathPatterns=useMutation
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useMutation } from '@/hooks/useMutation';

// Use real timers for this test suite since async state management is complex with fake timers
describe('useMutation', () => {
  describe('initial state', () => {
    it('should start in idle state', () => {
      const mutationFn = jest.fn();
      const { result } = renderHook(() => 
        useMutation({ mutationFn })
      );

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.isError).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe('successful mutation', () => {
    it('should handle successful mutation', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mutationFn = jest.fn().mockResolvedValue(mockData);
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn })
      );

      await act(async () => {
        result.current.mutate({ name: 'Test' });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toEqual(mockData);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should call onSuccess callback', async () => {
      const mockData = { id: 1 };
      const mutationFn = jest.fn().mockResolvedValue(mockData);
      const onSuccess = jest.fn();
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, onSuccess })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          mockData,
          { id: 1 },
          undefined
        );
      });
    });

    it('should return data from mutateAsync', async () => {
      const mockData = { id: 1, name: 'Test' };
      const mutationFn = jest.fn().mockResolvedValue(mockData);
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn })
      );

      let returnedData: any;
      await act(async () => {
        returnedData = await result.current.mutateAsync({ name: 'Test' });
      });

      expect(returnedData).toEqual(mockData);
    });
  });

  describe('failed mutation', () => {
    it('should handle failed mutation', async () => {
      const mockError = new Error('Mutation failed');
      const mutationFn = jest.fn().mockRejectedValue(mockError);
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, retry: false })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.error).toEqual(mockError);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.data).toBeNull();
    });

    it('should call onError callback', async () => {
      const mockError = new Error('Test error');
      const mutationFn = jest.fn().mockRejectedValue(mockError);
      const onError = jest.fn();
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, onError, retry: false })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith(
          mockError,
          { id: 1 },
          undefined
        );
      });
    });

    it('should throw error from mutateAsync', async () => {
      const mockError = new Error('Async error');
      const mutationFn = jest.fn().mockRejectedValue(mockError);
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, retry: false })
      );

      await act(async () => {
        await expect(
          result.current.mutateAsync({ id: 1 })
        ).rejects.toThrow('Async error');
      });
    });
  });

  describe('loading state', () => {
    it('should set loading state during mutation', async () => {
      // Use a delayed promise to test loading state
      const mutationFn = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve({ id: 1 }), 50))
      );
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn })
      );

      // Start the mutation
      act(() => {
        result.current.mutate({ id: 1 });
      });

      // Should be loading immediately after mutate
      expect(result.current.isLoading).toBe(true);
      expect(result.current.isIdle).toBe(false);

      // Wait for the mutation to complete
      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      }, { timeout: 200 });
    });
  });

  describe('retry functionality', () => {
    it('should retry on failure', async () => {
      const mutationFn = jest.fn()
        .mockRejectedValueOnce(new Error('First fail'))
        .mockRejectedValueOnce(new Error('Second fail'))
        .mockResolvedValueOnce({ success: true });
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, retry: 2, retryDelay: 10 })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      }, { timeout: 500 });

      expect(mutationFn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should fail after max retries', async () => {
      const mutationFn = jest.fn().mockRejectedValue(new Error('Always fails'));
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, retry: 2, retryDelay: 10 })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      }, { timeout: 500 });

      // Initial + 2 retries = 3 calls
      expect(mutationFn).toHaveBeenCalledTimes(3);
    }, 10000);

    it('should use retry: true for 3 retries', async () => {
      const mutationFn = jest.fn().mockRejectedValue(new Error('Fail'));
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, retry: true, retryDelay: 10 })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      }, { timeout: 1000 });

      // Initial + 3 retries = 4 calls
      expect(mutationFn).toHaveBeenCalledTimes(4);
    }, 10000);
  });

  describe('callbacks', () => {
    it('should call onMutate before mutation', async () => {
      const callOrder: string[] = [];
      const mutationFn = jest.fn().mockImplementation(async () => {
        callOrder.push('mutationFn');
        return { id: 1 };
      });
      const onMutate = jest.fn().mockImplementation(() => {
        callOrder.push('onMutate');
        return { previousData: 'old' };
      });
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, onMutate })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(onMutate).toHaveBeenCalled();
      });

      expect(onMutate).toHaveBeenCalledWith({ id: 1 });
      expect(callOrder).toEqual(['onMutate', 'mutationFn']);
    });

    it('should call onSettled on success', async () => {
      const mockData = { id: 1 };
      const mutationFn = jest.fn().mockResolvedValue(mockData);
      const onSettled = jest.fn();
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, onSettled })
      );

      await act(async () => {
        result.current.mutate({ name: 'test' });
      });

      await waitFor(() => {
        expect(onSettled).toHaveBeenCalledWith(
          mockData,
          null,
          { name: 'test' },
          undefined
        );
      });
    });

    it('should call onSettled on error', async () => {
      const mockError = new Error('Failed');
      const mutationFn = jest.fn().mockRejectedValue(mockError);
      const onSettled = jest.fn();
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, onSettled, retry: false })
      );

      await act(async () => {
        result.current.mutate({ name: 'test' });
      });

      await waitFor(() => {
        expect(onSettled).toHaveBeenCalledWith(
          undefined,
          mockError,
          { name: 'test' },
          undefined
        );
      });
    });

    it('should pass context through callbacks', async () => {
      const mockData = { id: 1 };
      const context = { previousData: 'old' };
      const mutationFn = jest.fn().mockResolvedValue(mockData);
      const onMutate = jest.fn().mockReturnValue(context);
      const onSuccess = jest.fn();
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, onMutate, onSuccess })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalledWith(
          mockData,
          { id: 1 },
          context
        );
      });
    });
  });

  describe('reset', () => {
    it('should reset state to idle', async () => {
      const mutationFn = jest.fn().mockResolvedValue({ id: 1 });
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isSuccess).toBe(false);
      expect(result.current.data).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it('should reset error state', async () => {
      const mutationFn = jest.fn().mockRejectedValue(new Error('Failed'));
      
      const { result } = renderHook(() => 
        useMutation({ mutationFn, retry: false })
      );

      await act(async () => {
        result.current.mutate({ id: 1 });
      });

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      act(() => {
        result.current.reset();
      });

      expect(result.current.isIdle).toBe(true);
      expect(result.current.isError).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });
});