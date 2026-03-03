/**
 * Rate Limiter Utility
 * 
 * In-memory rate limiting with sliding window algorithm.
 * For production, consider using Redis or Upstash.
 * 
 * Features:
 * - Sliding window rate limiting
 * - IP-based and user-based limiting
 * - Configurable limits per endpoint
 * - Automatic cleanup of expired entries
 */

export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Optional message for rate limit exceeded */
  message?: string;
  /** Whether to skip rate limiting for authenticated users */
  skipAuth?: boolean;
  /** Custom key generator */
  keyGenerator?: (identifier: string, endpoint?: string) => string;
}

interface RateLimitEntry {
  count: number;
  resetTime: number;
  firstRequest: number;
}

// In-memory store for rate limits
// In production, use Redis: const redis = new Redis(process.env.REDIS_URL)
const rateLimitStore = new Map<string, RateLimitEntry>();

// Cleanup interval (every 5 minutes)
const CLEANUP_INTERVAL = 5 * 60 * 1000;
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

// Default configurations for different endpoints
export const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
  // Chat API - most expensive, needs strict limits
  'chat': {
    maxRequests: 20,
    windowMs: 60 * 1000, // 20 requests per minute
    message: 'Too many chat requests. Please wait a moment before sending more messages.',
  },
  // Image generation - very expensive
  'image': {
    maxRequests: 5,
    windowMs: 60 * 1000, // 5 requests per minute
    message: 'Image generation limit reached. Please wait before generating more images.',
  },
  // Video generation - most expensive
  'veo': {
    maxRequests: 2,
    windowMs: 5 * 60 * 1000, // 2 requests per 5 minutes
    message: 'Video generation limit reached. Please wait before generating more videos.',
  },
  // Search/extraction - moderate cost
  'tools': {
    maxRequests: 30,
    windowMs: 60 * 1000, // 30 requests per minute
    message: 'Too many tool requests. Please slow down.',
  },
  // KB search - lower cost
  'kb': {
    maxRequests: 50,
    windowMs: 60 * 1000, // 50 requests per minute
    message: 'Knowledge base search limit reached.',
  },
  // Audio/transcription
  'audio': {
    maxRequests: 10,
    windowMs: 60 * 1000, // 10 requests per minute
    message: 'Audio processing limit reached.',
  },
  // Default for other endpoints
  'default': {
    maxRequests: 100,
    windowMs: 60 * 1000, // 100 requests per minute
    message: 'Rate limit exceeded. Please try again later.',
  },
};

/**
 * Start the cleanup timer for expired entries
 */
function startCleanup(): void {
  if (cleanupTimer) return;
  
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of rateLimitStore.entries()) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0 && process.env.NODE_ENV === 'development') {
      console.log(`[RateLimiter] Cleaned up ${cleaned} expired entries`);
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Stop the cleanup timer
 */
export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

/**
 * Generate a rate limit key
 */
function generateKey(identifier: string, endpoint: string): string {
  return `ratelimit:${endpoint}:${identifier}`;
}

/**
 * Check if a request should be rate limited
 */
export function checkRateLimit(
  identifier: string,
  endpoint: string = 'default',
  config?: Partial<RateLimitConfig>
): { allowed: boolean; remaining: number; resetIn: number; message?: string } {
  // Start cleanup on first call
  if (!cleanupTimer) {
    startCleanup();
  }

  const effectiveConfig = {
    ...RATE_LIMIT_CONFIGS[endpoint] || RATE_LIMIT_CONFIGS['default'],
    ...config,
  };

  const key = effectiveConfig.keyGenerator 
    ? effectiveConfig.keyGenerator(identifier, endpoint)
    : generateKey(identifier, endpoint);
  
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // No entry or expired entry
  if (!entry || entry.resetTime < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetTime: now + effectiveConfig.windowMs,
      firstRequest: now,
    };
    rateLimitStore.set(key, newEntry);
    
    return {
      allowed: true,
      remaining: effectiveConfig.maxRequests - 1,
      resetIn: effectiveConfig.windowMs,
    };
  }

  // Existing entry - check limits
  if (entry.count >= effectiveConfig.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetIn: entry.resetTime - now,
      message: effectiveConfig.message,
    };
  }

  // Increment count
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: effectiveConfig.maxRequests - entry.count,
    resetIn: entry.resetTime - now,
  };
}

/**
 * Reset rate limit for a specific identifier/endpoint
 */
export function resetRateLimit(identifier: string, endpoint: string = 'default'): void {
  const key = generateKey(identifier, endpoint);
  rateLimitStore.delete(key);
}

/**
 * Get current rate limit status without incrementing
 */
export function getRateLimitStatus(
  identifier: string,
  endpoint: string = 'default'
): { remaining: number; resetIn: number; total: number } {
  const config = RATE_LIMIT_CONFIGS[endpoint] || RATE_LIMIT_CONFIGS['default'];
  const key = generateKey(identifier, endpoint);
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    return {
      remaining: config.maxRequests,
      resetIn: 0,
      total: config.maxRequests,
    };
  }

  return {
    remaining: Math.max(0, config.maxRequests - entry.count),
    resetIn: entry.resetTime - now,
    total: config.maxRequests,
  };
}

/**
 * Middleware helper for Next.js API routes
 */
export function withRateLimit(
  endpoint: string = 'default',
  config?: Partial<RateLimitConfig>
) {
  return function <T extends (...args: unknown[]) => Promise<Response>>(handler: T): T {
    return (async (...args: unknown[]) => {
      const request = args[0] as Request;
      
      // Get identifier from IP or auth header
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
        || request.headers.get('x-real-ip') 
        || 'anonymous';
      
      const userId = request.headers.get('x-user-id');
      const identifier = userId || ip;

      const result = checkRateLimit(identifier, endpoint, config);

      if (!result.allowed) {
        return new Response(
          JSON.stringify({
            error: 'Rate limit exceeded',
            message: result.message,
            retryAfter: Math.ceil(result.resetIn / 1000),
          }),
          {
            status: 429,
            headers: {
              'Content-Type': 'application/json',
              'Retry-After': String(Math.ceil(result.resetIn / 1000)),
              'X-RateLimit-Remaining': '0',
              'X-RateLimit-Reset': String(Date.now() + result.resetIn),
            },
          }
        );
      }

      // Add rate limit headers to response
      const response = await handler(...args);
      
      // Clone response to add headers
      const newHeaders = new Headers(response.headers);
      newHeaders.set('X-RateLimit-Remaining', String(result.remaining));
      newHeaders.set('X-RateLimit-Reset', String(Date.now() + result.resetIn));

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    }) as T;
  };
}

/**
 * Simple rate limit check for use in API routes
 * Returns Response if rate limited, null if allowed
 */
export function rateLimitCheck(
  request: Request,
  endpoint: string = 'default'
): Response | null {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
    || request.headers.get('x-real-ip') 
    || 'anonymous';
  
  const userId = request.headers.get('x-user-id');
  const identifier = userId || ip;

  const result = checkRateLimit(identifier, endpoint);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: 'Rate limit exceeded',
        message: result.message,
        retryAfter: Math.ceil(result.resetIn / 1000),
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(result.resetIn / 1000)),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Date.now() + result.resetIn),
        },
      }
    );
  }

  return null;
}

export default {
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  rateLimitCheck,
  withRateLimit,
  RATE_LIMIT_CONFIGS,
};
