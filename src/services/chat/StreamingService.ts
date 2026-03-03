/**
 * StreamingService
 * 
 * Handles Server-Sent Events (SSE) streaming with:
 * - Batched UI updates (default 50ms) to prevent render thrashing
 * - Abort controller for cancellation
 * - Automatic timeout handling
 * - Usage and metadata extraction
 * 
 * Key Performance Improvement:
 * - Instead of updating React state on every chunk (1000+ renders),
 *   we batch updates to ~20 renders per second max
 * 
 * Extracted from ChatContext to enable:
 * - Independent testing
 * - Reuse across components (chat, image studio, etc.)
 * - Cleaner error handling
 */

import { 
  StreamOptions, 
  StreamResult, 
  StreamChunk, 
  StreamMeta, 
  UsageData,
  ChatAPIRequest,
  IStreamingService 
} from './types';

export class StreamingService implements IStreamingService {
  private abortController: AbortController | null = null;
  private buffer: string = '';
  private batchInterval: ReturnType<typeof setInterval> | null = null;
  private lastFlushedContent: string = '';
  private _isStreaming: boolean = false;
  
  /**
   * Stream a response from the chat API
   * 
   * @param url - API endpoint URL
   * @param body - Request body
   * @param options - Stream options including batch interval and callbacks
   */
  async stream(
    url: string, 
    body: ChatAPIRequest, 
    options: StreamOptions = {}
  ): Promise<StreamResult> {
    const { 
      batchMs = 50,  // Update UI max 20 times per second
      timeout = 300000, // 5 minute timeout for reasoning models
      onChunk,
      onMeta 
    } = options;
    
    this.buffer = '';
    this.lastFlushedContent = '';
    this._isStreaming = true;
    
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abort(), timeout);
    
    let usage: UsageData | null = null;
    let meta: StreamMeta | null = null;
    let aborted = false;
    
    // Start batched UI updates
    if (onChunk) {
      this.batchInterval = setInterval(() => {
        if (this.buffer !== this.lastFlushedContent) {
          onChunk({ type: 'content', content: this.buffer });
          this.lastFlushedContent = this.buffer;
        }
      }, batchMs);
    }
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, stream: true }),
        signal: this.abortController.signal,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg = errorData.details || errorData.error || response.statusText;
        const errorTip = errorData.tip ? ` (Tip: ${errorData.tip})` : '';
        throw new Error(`[SERVER ERROR] ${errorMsg}${errorTip}`);
      }
      
      if (!response.body) {
        throw new Error('Response body is null - streaming not supported');
      }
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          
          const jsonStr = line.slice(6);
          if (jsonStr === '[DONE]') continue;
          
          try {
            const data = JSON.parse(jsonStr);
            
            // Accumulate content
            if (data.content) {
              this.buffer += data.content;
            }
            
            // Extract usage data
            if (data.usage) {
              usage = {
                prompt_tokens: data.usage.prompt_tokens || 0,
                completion_tokens: data.usage.completion_tokens || 0,
                total_tokens: data.usage.total_tokens || 0,
              };
            }
            
            // Extract metadata
            if (data.meta) {
              meta = {
                model: data.meta.model,
                tier: data.meta.tier,
                isReasoning: data.meta.isReasoning,
                usedWebSearch: data.meta.usedWebSearch,
                status: data.meta.status,
                trace: data.meta.trace,
              };
              
              if (onMeta) {
                onMeta(meta);
              }
              
              // Forward meta events immediately via onChunk
              // This ensures ChatContext receives real-time status and trace updates
              if (onChunk && (data.meta.status || data.meta.trace)) {
                onChunk({ type: 'meta', meta });
              }
            }
            
            // Handle model info
            if (data.model && !meta?.model) {
              meta = { ...meta, model: data.model };
            }
            
            // Handle errors in stream
            if (data.error) {
              console.error('[StreamingService] Error in stream:', data.error);
              this.buffer += `\n\n**Error:** ${data.error}`;
              
              if (onChunk) {
                onChunk({ type: 'error', error: data.error });
              }
            }
          } catch (parseError) {
            // Ignore JSON parse errors for partial chunks
          }
        }
      }
      
      // Final flush
      if (onChunk && this.buffer !== this.lastFlushedContent) {
        onChunk({ type: 'content', content: this.buffer });
      }
      
      // Send done signal
      if (onChunk) {
        onChunk({ type: 'done' });
      }
      
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[StreamingService] Stream aborted by user');
        aborted = true;
      } else {
        console.error('[StreamingService] Stream error:', error);
        throw error;
      }
    } finally {
      clearTimeout(timeoutId);
      this.cleanup();
    }
    
    return {
      content: this.buffer,
      usage,
      meta,
      aborted,
    };
  }
  
  /**
   * Abort the current stream
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.cleanup();
  }
  
  /**
   * Check if currently streaming
   */
  isStreaming(): boolean {
    return this._isStreaming;
  }
  
  /**
   * Get the current buffer content (for progress indication)
   */
  getCurrentContent(): string {
    return this.buffer;
  }
  
  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.batchInterval) {
      clearInterval(this.batchInterval);
      this.batchInterval = null;
    }
    this.abortController = null;
    this._isStreaming = false;
  }
}

// Singleton instance for global use (optional)
let globalStreamingService: StreamingService | null = null;

export function getStreamingService(): StreamingService {
  if (!globalStreamingService) {
    globalStreamingService = new StreamingService();
  }
  return globalStreamingService;
}

// Factory function for creating new instances
export function createStreamingService(): StreamingService {
  return new StreamingService();
}

/**
 * Helper hook-friendly class that wraps StreamingService with React-friendly callbacks
 */
export class StreamingController {
  private service: StreamingService;
  private onContentUpdate: (content: string) => void;
  private onMetaUpdate?: (meta: StreamMeta) => void;
  private onComplete?: (result: StreamResult) => void;
  private onError?: (error: Error) => void;
  
  constructor(options: {
    onContentUpdate: (content: string) => void;
    onMetaUpdate?: (meta: StreamMeta) => void;
    onComplete?: (result: StreamResult) => void;
    onError?: (error: Error) => void;
  }) {
    this.service = new StreamingService();
    this.onContentUpdate = options.onContentUpdate;
    this.onMetaUpdate = options.onMetaUpdate;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }
  
  async stream(url: string, body: ChatAPIRequest): Promise<StreamResult> {
    try {
      const result = await this.service.stream(url, body, {
        batchMs: 50,
        onChunk: (chunk) => {
          if (chunk.type === 'content' && chunk.content) {
            this.onContentUpdate(chunk.content);
          }
        },
        onMeta: this.onMetaUpdate,
      });
      
      if (this.onComplete) {
        this.onComplete(result);
      }
      
      return result;
    } catch (error: any) {
      if (this.onError) {
        this.onError(error);
      }
      throw error;
    }
  }
  
  abort(): void {
    this.service.abort();
  }
  
  isStreaming(): boolean {
    return this.service.isStreaming();
  }
}
