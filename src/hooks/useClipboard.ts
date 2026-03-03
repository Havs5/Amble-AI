/**
 * useClipboard - Clipboard utilities with feedback
 * 
 * Features:
 * - Copy text to clipboard
 * - Copy code blocks with formatting
 * - Read from clipboard
 * - Success/error state tracking
 */

'use client';

import { useState, useCallback, useRef } from 'react';

export interface ClipboardState {
  copied: boolean;
  error: Error | null;
}

export interface UseClipboardOptions {
  timeout?: number;
  onSuccess?: (text: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Hook for clipboard operations
 */
export function useClipboard(options: UseClipboardOptions = {}) {
  const { timeout = 2000, onSuccess, onError } = options;
  
  const [state, setState] = useState<ClipboardState>({
    copied: false,
    error: null,
  });
  
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resetState = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setState({ copied: false, error: null });
  }, []);

  /**
   * Copy text to clipboard
   */
  const copy = useCallback(async (text: string): Promise<boolean> => {
    resetState();

    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        
        if (!success) {
          throw new Error('Copy command failed');
        }
      }

      setState({ copied: true, error: null });
      onSuccess?.(text);

      // Reset after timeout
      timeoutRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, copied: false }));
      }, timeout);

      return true;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Copy failed');
      setState({ copied: false, error: err });
      onError?.(err);
      return false;
    }
  }, [timeout, onSuccess, onError, resetState]);

  /**
   * Copy code block with optional language prefix
   */
  const copyCode = useCallback(async (
    code: string, 
    language?: string
  ): Promise<boolean> => {
    // For code, we just copy the raw code without markdown formatting
    return copy(code);
  }, [copy]);

  /**
   * Copy rich content (HTML) - falls back to plain text
   */
  const copyRich = useCallback(async (
    html: string,
    plainText: string
  ): Promise<boolean> => {
    resetState();

    try {
      if (navigator.clipboard && 'write' in navigator.clipboard) {
        const blob = new Blob([html], { type: 'text/html' });
        const textBlob = new Blob([plainText], { type: 'text/plain' });
        
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': blob,
            'text/plain': textBlob,
          }),
        ]);
      } else {
        // Fallback to plain text
        return copy(plainText);
      }

      setState({ copied: true, error: null });
      onSuccess?.(plainText);

      timeoutRef.current = setTimeout(() => {
        setState(prev => ({ ...prev, copied: false }));
      }, timeout);

      return true;
    } catch (error) {
      // Fallback to plain text copy
      return copy(plainText);
    }
  }, [timeout, onSuccess, copy, resetState]);

  /**
   * Read text from clipboard
   */
  const read = useCallback(async (): Promise<string | null> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        return await navigator.clipboard.readText();
      }
      return null;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Read failed');
      setState(prev => ({ ...prev, error: err }));
      onError?.(err);
      return null;
    }
  }, [onError]);

  return {
    ...state,
    copy,
    copyCode,
    copyRich,
    read,
    reset: resetState,
  };
}

/**
 * Simple copy function without hook state
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  } catch {
    return false;
  }
}

/**
 * Format message content for clipboard
 */
export function formatForClipboard(content: string, options: {
  includeTimestamp?: boolean;
  includeRole?: boolean;
  role?: string;
} = {}): string {
  const { includeTimestamp, includeRole, role } = options;
  let formatted = content;

  if (includeRole && role) {
    formatted = `[${role}]: ${formatted}`;
  }

  if (includeTimestamp) {
    const timestamp = new Date().toISOString();
    formatted = `${formatted}\n\n---\nCopied at ${timestamp}`;
  }

  return formatted;
}

/**
 * Extract and format code blocks for clipboard
 */
export function extractCodeBlocks(content: string): Array<{
  code: string;
  language: string;
  index: number;
}> {
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  const blocks: Array<{ code: string; language: string; index: number }> = [];
  
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      language: match[1] || 'text',
      code: match[2].trim(),
      index: match.index,
    });
  }

  return blocks;
}

export default useClipboard;
