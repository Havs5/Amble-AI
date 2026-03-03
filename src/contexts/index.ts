/**
 * ChatContext Index
 * 
 * This file provides a simple way to switch between the original
 * and refactored ChatContext implementations.
 * 
 * To use the refactored version:
 * - Import from './ChatContextRefactored' instead of './ChatContext'
 * 
 * The refactored version provides:
 * - 53% code reduction (650 lines vs 1398)
 * - Batched UI updates during streaming (50ms intervals)
 * - Extracted services for better testability
 * - Same API - no changes needed in consuming components
 * 
 * Current: Using REFACTORED version (ChatContextRefactored)
 * To rollback: Change import below to './ChatContext'
 */

// Export from refactored implementation
export { ChatProvider, useChat } from './ChatContextRefactored';
