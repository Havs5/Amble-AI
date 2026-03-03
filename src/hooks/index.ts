/**
 * Hooks Barrel Export
 * 
 * Central export for all custom hooks in the application.
 * Import from '@/hooks' for cleaner imports.
 */

// Core utility hooks
export { 
  useDebounce, 
  useDebouncedCallback, 
  useThrottle, 
  useThrottledCallback,
  useDebouncedState,
  createDebounce,
  createThrottle,
} from './useDebounce';

export { 
  useLocalStorage, 
  useSessionStorage,
  getStorageKeys,
  clearStoragePrefix,
  getStorageUsage,
  isStorageAvailable,
  migrateStorageKey,
} from './useLocalStorage';

export { 
  useClipboard, 
  copyToClipboard,
  formatForClipboard,
  extractCodeBlocks,
} from './useClipboard';

// Mutations
export {
  useMutation,
  useOptimisticMutation,
  useMutationQueue,
  useBatchMutation,
  type MutationOptions,
  type MutationResult,
  type MutationStatus,
} from './useMutation';

// Re-export types
export type { 
  UseLocalStorageOptions 
} from './useLocalStorage';

export type { 
  ClipboardState, 
  UseClipboardOptions 
} from './useClipboard';
