/**
 * Input Validation Utilities
 * 
 * Centralized validation for user inputs across the application
 * - Message validation
 * - File validation
 * - URL validation
 * - Content sanitization
 */

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
  warnings?: string[];
}

export interface MessageValidationOptions {
  maxLength?: number;
  minLength?: number;
  allowEmpty?: boolean;
  allowUrls?: boolean;
  allowCode?: boolean;
  sanitize?: boolean;
}

export interface FileValidationOptions {
  maxSize?: number; // bytes
  allowedTypes?: string[];
  allowedExtensions?: string[];
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MESSAGE_OPTIONS: Required<MessageValidationOptions> = {
  maxLength: 32000,
  minLength: 1,
  allowEmpty: false,
  allowUrls: true,
  allowCode: true,
  sanitize: true,
};

const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

const SUPPORTED_DOCUMENT_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// Patterns for detection
const URL_PATTERN = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
const CODE_BLOCK_PATTERN = /```[\s\S]*?```|`[^`]+`/g;
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_PATTERN = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;

// Potentially dangerous patterns
const SCRIPT_PATTERN = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
const EVENT_HANDLER_PATTERN = /\bon\w+\s*=/gi;
const INJECTION_PATTERNS = [
  /javascript:/gi,
  /data:text\/html/gi,
  /vbscript:/gi,
];

// ============================================================================
// Message Validation
// ============================================================================

/**
 * Validate and optionally sanitize a chat message
 */
export function validateMessage(
  content: string,
  options: MessageValidationOptions = {}
): ValidationResult {
  const opts = { ...DEFAULT_MESSAGE_OPTIONS, ...options };
  const warnings: string[] = [];
  let sanitized = content;

  // Check for empty content
  if (!content || content.trim().length === 0) {
    if (!opts.allowEmpty) {
      return { valid: false, error: 'Message cannot be empty' };
    }
    return { valid: true, sanitized: '' };
  }

  // Check minimum length
  if (content.trim().length < opts.minLength) {
    return {
      valid: false,
      error: `Message must be at least ${opts.minLength} character(s)`,
    };
  }

  // Check maximum length
  if (content.length > opts.maxLength) {
    return {
      valid: false,
      error: `Message exceeds maximum length of ${opts.maxLength.toLocaleString()} characters`,
    };
  }

  // Sanitize if enabled
  if (opts.sanitize) {
    sanitized = sanitizeContent(content);
    
    if (sanitized !== content) {
      warnings.push('Some content was sanitized for security');
    }
  }

  // Detect potentially sensitive information
  if (EMAIL_PATTERN.test(content)) {
    warnings.push('Message contains email address(es)');
  }

  if (PHONE_PATTERN.test(content)) {
    warnings.push('Message contains phone number(s)');
  }

  // Count URLs
  const urls = content.match(URL_PATTERN) || [];
  if (urls.length > 10) {
    warnings.push('Message contains many URLs - this may affect processing');
  }

  return {
    valid: true,
    sanitized,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Sanitize potentially dangerous content
 */
export function sanitizeContent(content: string): string {
  let sanitized = content;

  // Remove script tags
  sanitized = sanitized.replace(SCRIPT_PATTERN, '[removed]');

  // Remove event handlers
  sanitized = sanitized.replace(EVENT_HANDLER_PATTERN, '');

  // Remove dangerous URI schemes
  for (const pattern of INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, '');
  }

  return sanitized;
}

// ============================================================================
// File Validation
// ============================================================================

/**
 * Validate a file for upload
 */
export function validateFile(
  file: File,
  options: FileValidationOptions = {}
): ValidationResult {
  const warnings: string[] = [];

  // Check file size
  const maxSize = options.maxSize ?? MAX_FILE_SIZE;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size exceeds ${formatFileSize(maxSize)} limit`,
    };
  }

  // Check file type
  const allowedTypes = options.allowedTypes ?? [
    ...SUPPORTED_IMAGE_TYPES,
    ...SUPPORTED_DOCUMENT_TYPES,
  ];

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    return {
      valid: false,
      error: `File type "${file.type || 'unknown'}" is not supported`,
    };
  }

  // Check extension if specified
  if (options.allowedExtensions && options.allowedExtensions.length > 0) {
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !options.allowedExtensions.includes(extension)) {
      return {
        valid: false,
        error: `File extension ".${extension || 'unknown'}" is not allowed`,
      };
    }
  }

  // Warn about large files
  if (file.size > 5 * 1024 * 1024) {
    warnings.push('Large file may take longer to process');
  }

  return {
    valid: true,
    warnings: warnings.length > 0 ? warnings : undefined,
  };
}

/**
 * Validate image file specifically
 */
export function validateImage(file: File): ValidationResult {
  return validateFile(file, {
    maxSize: 10 * 1024 * 1024, // 10MB for images
    allowedTypes: SUPPORTED_IMAGE_TYPES,
  });
}

/**
 * Validate document file specifically
 */
export function validateDocument(file: File): ValidationResult {
  return validateFile(file, {
    maxSize: 20 * 1024 * 1024, // 20MB for documents
    allowedTypes: SUPPORTED_DOCUMENT_TYPES,
  });
}

// ============================================================================
// URL Validation
// ============================================================================

/**
 * Validate a URL
 */
export function validateUrl(url: string): ValidationResult {
  if (!url || url.trim().length === 0) {
    return { valid: false, error: 'URL cannot be empty' };
  }

  try {
    const parsed = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are allowed' };
    }

    // Check for localhost in production
    if (
      process.env.NODE_ENV === 'production' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return { valid: false, error: 'Local URLs are not allowed' };
    }

    return { valid: true, sanitized: parsed.href };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}

/**
 * Extract and validate URLs from text
 */
export function extractUrls(text: string): Array<{ url: string; valid: boolean }> {
  const matches = text.match(URL_PATTERN) || [];
  return matches.map(url => ({
    url,
    valid: validateUrl(url).valid,
  }));
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format file size for display
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Truncate message for preview
 */
export function truncateMessage(message: string, maxLength: number = 100): string {
  if (message.length <= maxLength) return message;
  return message.slice(0, maxLength - 3) + '...';
}

/**
 * Check if content contains code blocks
 */
export function containsCodeBlocks(content: string): boolean {
  return CODE_BLOCK_PATTERN.test(content);
}

/**
 * Count words in text
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * Estimate token count (rough approximation)
 * Average: 1 token ≈ 4 characters for English
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content exceeds model context window
 */
export function checkContextLimit(
  content: string,
  modelLimit: number = 128000
): {
  withinLimit: boolean;
  estimatedTokens: number;
  percentUsed: number;
} {
  const estimatedTokens = estimateTokens(content);
  const percentUsed = (estimatedTokens / modelLimit) * 100;
  
  return {
    withinLimit: estimatedTokens < modelLimit * 0.9, // 90% threshold
    estimatedTokens,
    percentUsed: Math.round(percentUsed * 10) / 10,
  };
}

// ============================================================================
// Form Validation
// ============================================================================

/**
 * Validate session title
 */
export function validateSessionTitle(title: string): ValidationResult {
  if (!title || title.trim().length === 0) {
    return { valid: false, error: 'Title cannot be empty' };
  }

  if (title.length > 100) {
    return { valid: false, error: 'Title cannot exceed 100 characters' };
  }

  const sanitized = sanitizeContent(title.trim());
  return { valid: true, sanitized };
}

/**
 * Validate knowledge base name
 */
export function validateKnowledgeBaseName(name: string): ValidationResult {
  if (!name || name.trim().length === 0) {
    return { valid: false, error: 'Name cannot be empty' };
  }

  if (name.length > 50) {
    return { valid: false, error: 'Name cannot exceed 50 characters' };
  }

  // Only allow alphanumeric, spaces, hyphens, underscores
  const validPattern = /^[a-zA-Z0-9\s\-_]+$/;
  if (!validPattern.test(name)) {
    return { 
      valid: false, 
      error: 'Name can only contain letters, numbers, spaces, hyphens, and underscores' 
    };
  }

  return { valid: true, sanitized: name.trim() };
}

export default {
  validateMessage,
  validateFile,
  validateImage,
  validateDocument,
  validateUrl,
  validateSessionTitle,
  validateKnowledgeBaseName,
  sanitizeContent,
  extractUrls,
  formatFileSize,
  truncateMessage,
  containsCodeBlocks,
  countWords,
  estimateTokens,
  checkContextLimit,
};
