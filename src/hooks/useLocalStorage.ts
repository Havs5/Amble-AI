/**
 * useLocalStorage - Enhanced localStorage hook
 * 
 * Features:
 * - Type-safe storage
 * - JSON serialization/deserialization
 * - SSR-safe
 * - Storage event sync across tabs
 * - Expiration support
 * - Error handling
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface UseLocalStorageOptions<T> {
  serializer?: (value: T) => string;
  deserializer?: (value: string) => T;
  onError?: (error: Error) => void;
  syncTabs?: boolean;
  expireMs?: number;
}

interface StoredValue<T> {
  value: T;
  timestamp: number;
  expireAt?: number;
}

// ============================================================================
// useLocalStorage
// ============================================================================

/**
 * Type-safe localStorage hook with sync support
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: UseLocalStorageOptions<T> = {}
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    onError,
    syncTabs = true,
    expireMs,
  } = options;

  // Get initial value from storage or use default
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      if (item) {
        const stored: StoredValue<T> = deserializer(item);
        
        // Check expiration
        if (stored.expireAt && Date.now() > stored.expireAt) {
          window.localStorage.removeItem(key);
          return initialValue;
        }
        
        return stored.value;
      }
      return initialValue;
    } catch (error) {
      onError?.(error as Error);
      return initialValue;
    }
  });

  // Track if this is initial mount
  const isFirstMount = useRef(true);

  // Persist to localStorage when value changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Skip initial mount to avoid unnecessary write
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    try {
      const stored: StoredValue<T> = {
        value: storedValue,
        timestamp: Date.now(),
        expireAt: expireMs ? Date.now() + expireMs : undefined,
      };
      window.localStorage.setItem(key, serializer(stored));
    } catch (error) {
      onError?.(error as Error);
    }
  }, [key, storedValue, serializer, expireMs, onError]);

  // Sync across tabs
  useEffect(() => {
    if (typeof window === 'undefined' || !syncTabs) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key !== key || e.newValue === null) return;

      try {
        const stored: StoredValue<T> = deserializer(e.newValue);
        
        // Check expiration
        if (stored.expireAt && Date.now() > stored.expireAt) {
          return;
        }
        
        setStoredValue(stored.value);
      } catch (error) {
        onError?.(error as Error);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key, deserializer, syncTabs, onError]);

  // Setter that supports function updates
  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      return newValue;
    });
  }, []);

  // Remove from storage
  const remove = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [key, initialValue, onError]);

  return [storedValue, setValue, remove];
}

// ============================================================================
// useSessionStorage
// ============================================================================

/**
 * Type-safe sessionStorage hook
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T,
  options: Omit<UseLocalStorageOptions<T>, 'syncTabs'> = {}
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const {
    serializer = JSON.stringify,
    deserializer = JSON.parse,
    onError,
  } = options;

  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      return item ? deserializer(item) : initialValue;
    } catch (error) {
      onError?.(error as Error);
      return initialValue;
    }
  });

  const isFirstMount = useRef(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }

    try {
      window.sessionStorage.setItem(key, serializer(storedValue));
    } catch (error) {
      onError?.(error as Error);
    }
  }, [key, storedValue, serializer, onError]);

  const setValue = useCallback((value: T | ((prev: T) => T)) => {
    setStoredValue(prev => {
      const newValue = value instanceof Function ? value(prev) : value;
      return newValue;
    });
  }, []);

  const remove = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    try {
      window.sessionStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [key, initialValue, onError]);

  return [storedValue, setValue, remove];
}

// ============================================================================
// Storage Utilities
// ============================================================================

/**
 * Get all keys in localStorage matching a prefix
 */
export function getStorageKeys(prefix: string): string[] {
  if (typeof window === 'undefined') return [];
  
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(prefix)) {
      keys.push(key);
    }
  }
  return keys;
}

/**
 * Clear all items with a given prefix
 */
export function clearStoragePrefix(prefix: string): number {
  if (typeof window === 'undefined') return 0;
  
  const keys = getStorageKeys(prefix);
  keys.forEach(key => localStorage.removeItem(key));
  return keys.length;
}

/**
 * Get storage usage estimate
 */
export function getStorageUsage(): { used: number; remaining: number; percentage: number } | null {
  if (typeof window === 'undefined') return null;
  
  try {
    let used = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) {
        used += (localStorage.getItem(key)?.length ?? 0) * 2; // UTF-16
      }
    }
    
    // Most browsers have 5MB limit
    const limit = 5 * 1024 * 1024;
    
    return {
      used,
      remaining: limit - used,
      percentage: (used / limit) * 100,
    };
  } catch {
    return null;
  }
}

/**
 * Check if localStorage is available
 */
export function isStorageAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const testKey = '__storage_test__';
    localStorage.setItem(testKey, testKey);
    localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Migrate storage from old key to new key
 */
export function migrateStorageKey(oldKey: string, newKey: string): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    const value = localStorage.getItem(oldKey);
    if (value) {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default useLocalStorage;
