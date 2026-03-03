// @ts-nocheck
/**
 * useLocalStorage Hook Tests
 * 
 * Tests for the localStorage hook including:
 * - Basic read/write operations
 * - SSR safety
 * - Expiration handling
 * - Tab synchronization
 * - Error handling
 * 
 * Run with: npm test -- --testPathPatterns=useLocalStorage
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react';
import { useLocalStorage, useSessionStorage } from '@/hooks/useLocalStorage';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: jest.fn((index: number) => Object.keys(store)[index] || null),
  };
})();

Object.defineProperty(global, 'localStorage', { value: localStorageMock });
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

describe('useLocalStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
  });

  describe('initialization', () => {
    it('should return initial value when localStorage is empty', () => {
      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'default-value')
      );

      expect(result.current[0]).toBe('default-value');
    });

    it('should return stored value when it exists', () => {
      const stored = JSON.stringify({
        value: 'stored-value',
        timestamp: Date.now(),
      });
      localStorageMock.setItem('test-key', stored);

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'default-value')
      );

      expect(result.current[0]).toBe('stored-value');
    });

    it('should handle complex objects', () => {
      const complexObject = {
        name: 'Test',
        count: 42,
        nested: { a: 1, b: 2 },
        array: [1, 2, 3],
      };
      const stored = JSON.stringify({
        value: complexObject,
        timestamp: Date.now(),
      });
      localStorageMock.setItem('test-key', stored);

      const { result } = renderHook(() => 
        useLocalStorage('test-key', {})
      );

      expect(result.current[0]).toEqual(complexObject);
    });
  });

  describe('setValue', () => {
    it('should update state with direct value', () => {
      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'initial')
      );

      act(() => {
        result.current[1]('updated');
      });

      expect(result.current[0]).toBe('updated');
    });

    it('should update state with function', () => {
      const { result } = renderHook(() => 
        useLocalStorage('test-key', 10)
      );

      act(() => {
        result.current[1](prev => prev + 5);
      });

      expect(result.current[0]).toBe(15);
    });

    it('should persist to localStorage after update', async () => {
      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'initial')
      );

      act(() => {
        result.current[1]('updated');
      });

      // Wait for useEffect to run
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      // Verify localStorage was called
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'test-key',
        expect.stringContaining('"value":"updated"')
      );
    });
  });

  describe('remove', () => {
    it('should remove from localStorage and reset to initial', () => {
      const stored = JSON.stringify({
        value: 'stored-value',
        timestamp: Date.now(),
      });
      localStorageMock.setItem('test-key', stored);

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'initial')
      );

      expect(result.current[0]).toBe('stored-value');

      act(() => {
        result.current[2](); // remove function
      });

      expect(result.current[0]).toBe('initial');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key');
    });
  });

  describe('expiration', () => {
    it('should return initial value when data is expired', () => {
      const expiredData = JSON.stringify({
        value: 'expired-value',
        timestamp: Date.now() - 10000,
        expireAt: Date.now() - 5000, // Expired 5 seconds ago
      });
      localStorageMock.setItem('test-key', expiredData);

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'default-value', { expireMs: 1000 })
      );

      expect(result.current[0]).toBe('default-value');
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('test-key');
    });

    it('should return stored value when not expired', () => {
      const validData = JSON.stringify({
        value: 'valid-value',
        timestamp: Date.now(),
        expireAt: Date.now() + 60000, // Expires in 60 seconds
      });
      localStorageMock.setItem('test-key', validData);

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'default-value', { expireMs: 60000 })
      );

      expect(result.current[0]).toBe('valid-value');
    });
  });

  describe('error handling', () => {
    it('should call onError when deserialization fails', () => {
      localStorageMock.setItem('test-key', 'invalid-json{{{');
      const onError = jest.fn();

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'default', { onError })
      );

      expect(result.current[0]).toBe('default');
      expect(onError).toHaveBeenCalled();
    });

    it('should return initial value on parse error', () => {
      localStorageMock.setItem('test-key', 'not-json');

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'fallback')
      );

      expect(result.current[0]).toBe('fallback');
    });
  });

  describe('custom serializers', () => {
    it('should use custom serializer', async () => {
      const customSerializer = jest.fn((value: string) => `CUSTOM:${value}`);
      
      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'value', { 
          serializer: customSerializer 
        })
      );

      act(() => {
        result.current[1]('new-value');
      });

      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 0));
      });

      expect(customSerializer).toHaveBeenCalled();
    });

    it('should use custom deserializer', () => {
      localStorageMock.setItem('test-key', 'CUSTOM:stored');
      const customDeserializer = jest.fn((value: string) => ({
        value: value.replace('CUSTOM:', ''),
        timestamp: Date.now(),
      }));

      const { result } = renderHook(() => 
        useLocalStorage('test-key', 'default', { 
          deserializer: customDeserializer 
        })
      );

      expect(customDeserializer).toHaveBeenCalledWith('CUSTOM:stored');
    });
  });
});

describe('useSessionStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorageMock.clear();
  });

  it('should return initial value when sessionStorage is empty', () => {
    const { result } = renderHook(() => 
      useSessionStorage('test-key', 'default')
    );

    expect(result.current[0]).toBe('default');
  });

  it('should return stored value', () => {
    sessionStorageMock.setItem('test-key', JSON.stringify('stored'));

    const { result } = renderHook(() => 
      useSessionStorage('test-key', 'default')
    );

    expect(result.current[0]).toBe('stored');
  });

  it('should update and persist value', async () => {
    const { result } = renderHook(() => 
      useSessionStorage('test-key', 'initial')
    );

    act(() => {
      result.current[1]('updated');
    });

    expect(result.current[0]).toBe('updated');

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });

    expect(sessionStorageMock.setItem).toHaveBeenCalled();
  });

  it('should remove value', () => {
    sessionStorageMock.setItem('test-key', JSON.stringify('stored'));

    const { result } = renderHook(() => 
      useSessionStorage('test-key', 'initial')
    );

    act(() => {
      result.current[2]();
    });

    expect(result.current[0]).toBe('initial');
    expect(sessionStorageMock.removeItem).toHaveBeenCalledWith('test-key');
  });
});
