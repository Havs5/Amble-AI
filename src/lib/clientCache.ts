/**
 * Client-side caching utility for reducing Firestore reads
 * Uses localStorage with TTL for persistence across sessions
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

const CACHE_PREFIX = 'amble_cache_';

// Default TTLs in milliseconds
export const CACHE_TTL = {
  SHORT: 5 * 60 * 1000,      // 5 minutes
  MEDIUM: 30 * 60 * 1000,    // 30 minutes
  LONG: 2 * 60 * 60 * 1000,  // 2 hours
  DAY: 24 * 60 * 60 * 1000,  // 24 hours
};

/**
 * Get cached data
 */
export function getCached<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    
    const entry: CacheEntry<T> = JSON.parse(raw);
    const now = Date.now();
    
    // Check if expired
    if (now - entry.timestamp > entry.ttl) {
      localStorage.removeItem(CACHE_PREFIX + key);
      return null;
    }
    
    return entry.data;
  } catch (e) {
    console.warn('[Cache] Error reading cache:', e);
    return null;
  }
}

/**
 * Set cached data
 */
export function setCache<T>(key: string, data: T, ttl: number = CACHE_TTL.MEDIUM): void {
  if (typeof window === 'undefined') return;
  
  try {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl,
    };
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
  } catch (e) {
    console.warn('[Cache] Error setting cache:', e);
    // If localStorage is full, clear old entries
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      clearExpiredCache();
    }
  }
}

/**
 * Invalidate specific cache entry
 */
export function invalidateCache(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CACHE_PREFIX + key);
}

/**
 * Invalidate all cache entries matching a pattern
 */
export function invalidateCachePattern(pattern: string): void {
  if (typeof window === 'undefined') return;
  
  const keys = Object.keys(localStorage);
  const regex = new RegExp(pattern);
  
  keys.forEach(key => {
    if (key.startsWith(CACHE_PREFIX) && regex.test(key.slice(CACHE_PREFIX.length))) {
      localStorage.removeItem(key);
    }
  });
}

/**
 * Clear all expired cache entries
 */
export function clearExpiredCache(): void {
  if (typeof window === 'undefined') return;
  
  const now = Date.now();
  const keys = Object.keys(localStorage);
  
  keys.forEach(key => {
    if (key.startsWith(CACHE_PREFIX)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const entry = JSON.parse(raw);
          if (now - entry.timestamp > entry.ttl) {
            localStorage.removeItem(key);
          }
        }
      } catch (e) {
        // Remove corrupted entries
        localStorage.removeItem(key);
      }
    }
  });
}

/**
 * Hook-friendly cache with automatic refresh
 * Returns [data, refresh, isStale]
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = CACHE_TTL.MEDIUM
): {
  get: () => T | null;
  refresh: () => Promise<T>;
  isStale: () => boolean;
} {
  return {
    get: () => getCached<T>(key),
    refresh: async () => {
      const data = await fetcher();
      setCache(key, data, ttl);
      return data;
    },
    isStale: () => {
      const cached = getCached<T>(key);
      return cached === null;
    },
  };
}

// Cache keys for common data
export const CACHE_KEYS = {
  USER_PROFILE: (uid: string) => `user_${uid}`,
  USER_SETTINGS: (uid: string) => `settings_${uid}`,
  USAGE_STATS: (uid: string) => `usage_${uid}`,
  CHAT_LIST: (uid: string) => `chats_${uid}`,
  KB_FOLDERS: (uid: string) => `kb_${uid}`,
};

// Initialize cache cleanup on module load
if (typeof window !== 'undefined') {
  // Clear expired entries on load
  clearExpiredCache();
  
  // Set up periodic cleanup (every 5 minutes)
  setInterval(clearExpiredCache, 5 * 60 * 1000);
}
