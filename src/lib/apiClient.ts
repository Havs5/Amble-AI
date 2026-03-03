/**
 * API Client - Type-safe HTTP client with interceptors
 * 
 * Features:
 * - Type-safe request/response handling
 * - Request/response interceptors
 * - Automatic retry with exponential backoff
 * - Request deduplication
 * - Timeout handling
 * - Error normalization
 */

// ============================================================================
// Types
// ============================================================================

export interface ApiClientConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
  retries?: number;
  retryDelay?: number;
  deduplication?: boolean;
}

export interface RequestConfig extends RequestInit {
  timeout?: number;
  retries?: number;
  dedupe?: boolean;
  params?: Record<string, string | number | boolean | undefined>;
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  statusText: string;
  headers: Headers;
}

export interface ApiError extends Error {
  status?: number;
  statusText?: string;
  data?: unknown;
  code?: string;
}

type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
type ResponseInterceptor = <T>(response: ApiResponse<T>) => ApiResponse<T> | Promise<ApiResponse<T>>;
type ErrorInterceptor = (error: ApiError) => ApiError | Promise<never>;

// ============================================================================
// API Client Class
// ============================================================================

export class ApiClient {
  private config: Required<ApiClientConfig>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private pendingRequests = new Map<string, Promise<unknown>>();

  constructor(config: ApiClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? '',
      timeout: config.timeout ?? 30000,
      headers: config.headers ?? {},
      credentials: config.credentials ?? 'same-origin',
      retries: config.retries ?? 0,
      retryDelay: config.retryDelay ?? 1000,
      deduplication: config.deduplication ?? true,
    };
  }

  /**
   * Add request interceptor
   */
  onRequest(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const index = this.requestInterceptors.indexOf(interceptor);
      if (index > -1) this.requestInterceptors.splice(index, 1);
    };
  }

  /**
   * Add response interceptor
   */
  onResponse(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const index = this.responseInterceptors.indexOf(interceptor);
      if (index > -1) this.responseInterceptors.splice(index, 1);
    };
  }

  /**
   * Add error interceptor
   */
  onError(interceptor: ErrorInterceptor): () => void {
    this.errorInterceptors.push(interceptor);
    return () => {
      const index = this.errorInterceptors.indexOf(interceptor);
      if (index > -1) this.errorInterceptors.splice(index, 1);
    };
  }

  /**
   * Make a request
   */
  async request<T>(
    method: string,
    url: string,
    data?: unknown,
    requestConfig: RequestConfig = {}
  ): Promise<ApiResponse<T>> {
    let config: RequestConfig = {
      method,
      headers: { ...this.config.headers },
      credentials: this.config.credentials,
      timeout: requestConfig.timeout ?? this.config.timeout,
      retries: requestConfig.retries ?? this.config.retries,
      dedupe: requestConfig.dedupe ?? this.config.deduplication,
      ...requestConfig,
    };

    // Build URL with params
    let fullUrl = this.config.baseUrl + url;
    if (config.params) {
      const searchParams = new URLSearchParams();
      Object.entries(config.params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
      }
    }

    // Add body
    if (data !== undefined) {
      if (data instanceof FormData) {
        config.body = data;
      } else {
        config.headers = {
          ...config.headers,
          'Content-Type': 'application/json',
        };
        config.body = JSON.stringify(data);
      }
    }

    // Apply request interceptors
    for (const interceptor of this.requestInterceptors) {
      config = await interceptor(config);
    }

    // Deduplication
    const dedupeKey = config.dedupe && method === 'GET' 
      ? `${method}:${fullUrl}` 
      : null;

    if (dedupeKey && this.pendingRequests.has(dedupeKey)) {
      return this.pendingRequests.get(dedupeKey) as Promise<ApiResponse<T>>;
    }

    const requestPromise = this.executeRequest<T>(fullUrl, config);

    if (dedupeKey) {
      this.pendingRequests.set(dedupeKey, requestPromise);
      requestPromise.finally(() => this.pendingRequests.delete(dedupeKey));
    }

    return requestPromise;
  }

  /**
   * Execute the actual request with retries
   */
  private async executeRequest<T>(
    url: string,
    config: RequestConfig,
    attempt = 0
  ): Promise<ApiResponse<T>> {
    const controller = new AbortController();
    const timeoutId = config.timeout 
      ? setTimeout(() => controller.abort(), config.timeout) 
      : null;

    try {
      const response = await fetch(url, {
        ...config,
        signal: controller.signal,
      });

      if (timeoutId) clearTimeout(timeoutId);

      // Parse response
      let data: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        data = await response.json();
      } else if (contentType?.includes('text/')) {
        data = await response.text() as unknown as T;
      } else {
        data = await response.blob() as unknown as T;
      }

      // Handle error responses
      if (!response.ok) {
        const error = this.createError(
          response.statusText || 'Request failed',
          response.status,
          response.statusText,
          data
        );
        throw error;
      }

      // Build response object
      let apiResponse: ApiResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      };

      // Apply response interceptors
      for (const interceptor of this.responseInterceptors) {
        apiResponse = await interceptor(apiResponse);
      }

      return apiResponse;
    } catch (err) {
      if (timeoutId) clearTimeout(timeoutId);

      let error = this.normalizeError(err);

      // Retry logic
      const maxRetries = config.retries ?? this.config.retries;
      const shouldRetry = 
        attempt < maxRetries &&
        this.isRetryableError(error);

      if (shouldRetry) {
        const delay = this.config.retryDelay * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.executeRequest<T>(url, config, attempt + 1);
      }

      // Apply error interceptors
      for (const interceptor of this.errorInterceptors) {
        error = await interceptor(error) as ApiError;
      }

      throw error;
    }
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: ApiError): boolean {
    if (error.code === 'ABORT_ERR') return false;
    if (error.status && error.status >= 400 && error.status < 500) return false;
    return true;
  }

  /**
   * Create a standardized error
   */
  private createError(
    message: string,
    status?: number,
    statusText?: string,
    data?: unknown
  ): ApiError {
    const error = new Error(message) as ApiError;
    error.name = 'ApiError';
    error.status = status;
    error.statusText = statusText;
    error.data = data;
    return error;
  }

  /**
   * Normalize various error types
   */
  private normalizeError(err: unknown): ApiError {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        const error = this.createError('Request timeout');
        error.code = 'ABORT_ERR';
        return error;
      }
      return Object.assign(err, { 
        name: 'ApiError' 
      }) as ApiError;
    }
    return this.createError(String(err));
  }

  // HTTP method shortcuts
  async get<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('GET', url, undefined, config);
  }

  async post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('POST', url, data, config);
  }

  async put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', url, data, config);
  }

  async patch<T>(url: string, data?: unknown, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', url, data, config);
  }

  async delete<T>(url: string, config?: RequestConfig): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', url, undefined, config);
  }
}

// ============================================================================
// Default Client Instance
// ============================================================================

export const apiClient = new ApiClient({
  baseUrl: '',
  timeout: 30000,
  retries: 2,
  deduplication: true,
});

// Add auth header interceptor example
apiClient.onRequest((config) => {
  // Add auth token if available
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers = {
        ...config.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }
  return config;
});

// Add error logging interceptor
apiClient.onError((error) => {
  console.error('[API Error]', {
    message: error.message,
    status: error.status,
    data: error.data,
  });
  throw error;
});

// ============================================================================
// API Endpoints Type-Safe Helpers
// ============================================================================

export interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  model?: string;
  stream?: boolean;
}

export interface ChatResponse {
  id: string;
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface SearchRequest {
  query: string;
  limit?: number;
  filters?: Record<string, unknown>;
}

export interface SearchResponse {
  results: Array<{
    id: string;
    content: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>;
  total: number;
}

// Type-safe API methods
export const api = {
  chat: {
    send: (data: ChatRequest) => 
      apiClient.post<ChatResponse>('/api/chat', data),
  },
  
  search: {
    kb: (data: SearchRequest) => 
      apiClient.post<SearchResponse>('/api/kb/search', data),
    
    web: (data: SearchRequest) => 
      apiClient.post<SearchResponse>('/api/tools/search', data),
  },
  
  image: {
    generate: (data: { prompt: string; model?: string }) =>
      apiClient.post<{ url: string }>('/api/image', data),
  },
  
  audio: {
    transcribe: (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      return apiClient.post<{ text: string }>('/api/transcribe', formData);
    },
    
    speech: (data: { text: string; voice?: string }) =>
      apiClient.post<Blob>('/api/audio/speech', data),
  },
};

export default apiClient;
