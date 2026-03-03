/**
 * Library Barrel Export
 * 
 * Central export for all library utilities.
 * Import from '@/lib' for cleaner imports.
 */

// Rate Limiting
export { 
  checkRateLimit,
  resetRateLimit,
  getRateLimitStatus,
  withRateLimit,
  rateLimitCheck,
  stopCleanup,
  RATE_LIMIT_CONFIGS,
  type RateLimitConfig,
} from './rateLimiter';

// Semantic Cache
export { 
  SemanticCache,
  getChatCache,
  type CacheEntry,
  type CacheConfig,
} from './semanticCache';

// Error Logging
export { 
  getErrorLogger,
  initErrorLogger,
  logger,
  type ErrorLog,
  type ErrorSeverity,
  type ErrorContext,
} from './errorLogger';
export { default as ErrorLogger } from './errorLogger';

// API Client
export {
  apiClient,
  ApiClient,
  api,
  type ApiClientConfig,
  type RequestConfig,
  type ApiResponse,
  type ApiError,
  type ChatRequest,
  type ChatResponse,
  type SearchRequest,
  type SearchResponse,
} from './apiClient';
