// @ts-nocheck
/**
 * useClipboard Hook Tests
 * 
 * Tests for the clipboard hook including:
 * - Copy to clipboard
 * - Read from clipboard
 * - Code copying
 * - Success/error states
 * - Fallback mechanisms
 * 
 * Run with: npm test -- --testPathPatterns=useClipboard
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useClipboard } from '@/hooks/useClipboard';

// Mock clipboard API
const mockClipboard = {
  writeText: jest.fn(),
  readText: jest.fn(),
  write: jest.fn(),
  read: jest.fn(),
};

// Mock secure context
Object.defineProperty(window, 'isSecureContext', {
  writable: true,
  value: true,
});

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: mockClipboard,
});

// Mock document.execCommand for fallback
const mockExecCommand = jest.fn().mockReturnValue(true);
document.execCommand = mockExecCommand as any;

describe('useClipboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockClipboard.writeText.mockResolvedValue(undefined);
    mockClipboard.readText.mockResolvedValue('clipboard content');
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should start with copied: false and no error', () => {
      const { result } = renderHook(() => useClipboard());

      expect(result.current.copied).toBe(false);
      expect(result.current.error).toBeNull();
    });
  });

  describe('copy', () => {
    it('should copy text to clipboard successfully', async () => {
      const { result } = renderHook(() => useClipboard());

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.copy('Hello, World!');
      });

      expect(success).toBe(true);
      expect(result.current.copied).toBe(true);
      expect(result.current.error).toBeNull();
      expect(mockClipboard.writeText).toHaveBeenCalledWith('Hello, World!');
    });

    it('should call onSuccess callback', async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useClipboard({ onSuccess }));

      await act(async () => {
        await result.current.copy('Test text');
      });

      expect(onSuccess).toHaveBeenCalledWith('Test text');
    });

    it('should reset copied state after timeout', async () => {
      const { result } = renderHook(() => useClipboard({ timeout: 1000 }));

      await act(async () => {
        await result.current.copy('Test');
      });

      expect(result.current.copied).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.copied).toBe(false);
    });

    it('should handle copy failure', async () => {
      mockClipboard.writeText.mockRejectedValueOnce(new Error('Permission denied'));
      const onError = jest.fn();
      const { result } = renderHook(() => useClipboard({ onError }));

      let success: boolean | undefined;
      await act(async () => {
        success = await result.current.copy('Test');
      });

      expect(success).toBe(false);
      expect(result.current.copied).toBe(false);
      expect(result.current.error).toBeInstanceOf(Error);
      expect(result.current.error?.message).toBe('Permission denied');
      expect(onError).toHaveBeenCalled();
    });

    it('should use fallback when clipboard API is unavailable', async () => {
      // Temporarily remove clipboard API
      const originalClipboard = navigator.clipboard;
      Object.defineProperty(navigator, 'clipboard', {
        writable: true,
        value: undefined,
      });

      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.copy('Fallback test');
      });

      // Should use execCommand fallback
      expect(mockExecCommand).toHaveBeenCalledWith('copy');
      expect(result.current.copied).toBe(true);

      // Restore clipboard API
      Object.defineProperty(navigator, 'clipboard', {
        writable: true,
        value: originalClipboard,
      });
    });
  });

  describe('copyCode', () => {
    it('should copy code without markdown formatting', async () => {
      const { result } = renderHook(() => useClipboard());
      const code = 'const x = 1;\nconsole.log(x);';

      await act(async () => {
        await result.current.copyCode(code, 'javascript');
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(code);
      expect(result.current.copied).toBe(true);
    });

    it('should handle multi-line code', async () => {
      const { result } = renderHook(() => useClipboard());
      const code = `function hello() {
  return 'world';
}`;

      await act(async () => {
        await result.current.copyCode(code);
      });

      expect(mockClipboard.writeText).toHaveBeenCalledWith(code);
    });
  });

  describe('read', () => {
    it('should read text from clipboard', async () => {
      const { result } = renderHook(() => useClipboard());

      let content: string | null = null;
      await act(async () => {
        content = await result.current.read();
      });

      expect(content).toBe('clipboard content');
      expect(mockClipboard.readText).toHaveBeenCalled();
    });

    it('should return null on read failure', async () => {
      mockClipboard.readText.mockRejectedValueOnce(new Error('Not allowed'));
      const { result } = renderHook(() => useClipboard());

      let content: string | null = 'initial';
      await act(async () => {
        content = await result.current.read();
      });

      expect(content).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset state manually', async () => {
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.copy('Test');
      });

      expect(result.current.copied).toBe(true);

      act(() => {
        result.current.reset();
      });

      expect(result.current.copied).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should clear pending timeouts on reset', async () => {
      const { result } = renderHook(() => useClipboard({ timeout: 5000 }));

      await act(async () => {
        await result.current.copy('Test');
      });

      act(() => {
        result.current.reset();
      });

      // Advance time past original timeout
      act(() => {
        jest.advanceTimersByTime(5000);
      });

      // State should still be reset (not triggered by old timeout)
      expect(result.current.copied).toBe(false);
    });
  });

  describe('multiple copies', () => {
    it('should reset state before new copy', async () => {
      const { result } = renderHook(() => useClipboard());

      await act(async () => {
        await result.current.copy('First');
      });

      expect(result.current.copied).toBe(true);

      // Copy again immediately
      await act(async () => {
        await result.current.copy('Second');
      });

      expect(result.current.copied).toBe(true);
      expect(mockClipboard.writeText).toHaveBeenLastCalledWith('Second');
    });
  });
});
