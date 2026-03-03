/**
 * ChatErrorBoundary
 * 
 * Error boundary specifically for the chat interface.
 * Catches errors in chat components and provides:
 * - User-friendly error messages
 * - Retry functionality
 * - Error reporting
 * - Graceful degradation
 */

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, MessageSquare, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  retryCount: number;
}

const MAX_RETRIES = 3;

export class ChatErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ChatErrorBoundary] Caught error:', error);
    console.error('[ChatErrorBoundary] Error info:', errorInfo);
    
    this.setState({ errorInfo });
    
    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
    
    // Report to error tracking service (e.g., Sentry)
    this.reportError(error, errorInfo);
  }

  private reportError(error: Error, errorInfo: ErrorInfo) {
    // In production, send to error tracking service
    if (process.env.NODE_ENV === 'production') {
      // TODO: Integrate with Sentry or similar
      // Sentry.captureException(error, { extra: errorInfo });
      
      // For now, log to console with structured data
      console.error('[ChatErrorBoundary] Production Error Report:', {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        url: typeof window !== 'undefined' ? window.location.href : 'unknown',
      });
    }
  }

  private handleRetry = () => {
    if (this.state.retryCount < MAX_RETRIES) {
      this.setState(prev => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prev.retryCount + 1,
      }));
      this.props.onReset?.();
    }
  };

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  private handleNewChat = () => {
    // Clear local storage for current session to start fresh
    if (typeof window !== 'undefined') {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('amble_messages_')) {
          localStorage.removeItem(key);
        }
      });
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
          <div className="bg-red-50 dark:bg-red-900/20 rounded-full p-4 mb-6">
            <AlertTriangle className="w-12 h-12 text-red-500" />
          </div>
          
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            Something went wrong
          </h2>
          
          <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md">
            {this.getErrorMessage()}
          </p>
          
          {this.state.retryCount < MAX_RETRIES && (
            <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
              Retry attempt {this.state.retryCount + 1} of {MAX_RETRIES}
            </p>
          )}
          
          <div className="flex flex-wrap gap-3 justify-center">
            {this.state.retryCount < MAX_RETRIES && (
              <button
                onClick={this.handleRetry}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            )}
            
            <button
              onClick={this.handleNewChat}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <MessageSquare className="w-4 h-4" />
              New Chat
            </button>
            
            <button
              onClick={this.handleGoHome}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <Home className="w-4 h-4" />
              Go Home
            </button>
          </div>
          
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <details className="mt-8 text-left w-full max-w-2xl">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                Technical Details (Dev Only)
              </summary>
              <div className="mt-2 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-auto">
                <p className="font-mono text-sm text-red-600 dark:text-red-400 mb-2">
                  {this.state.error.message}
                </p>
                <pre className="font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                  {this.state.error.stack}
                </pre>
                {this.state.errorInfo?.componentStack && (
                  <>
                    <p className="font-mono text-sm text-gray-500 mt-4 mb-2">Component Stack:</p>
                    <pre className="font-mono text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                      {this.state.errorInfo.componentStack}
                    </pre>
                  </>
                )}
              </div>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }

  private getErrorMessage(): string {
    const error = this.state.error;
    
    if (!error) {
      return 'An unexpected error occurred. Please try again.';
    }
    
    // Provide user-friendly messages for common errors
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return 'Unable to connect to the server. Please check your internet connection and try again.';
    }
    
    if (error.message.includes('timeout')) {
      return 'The request took too long. Please try again.';
    }
    
    if (error.message.includes('auth') || error.message.includes('permission')) {
      return 'You may need to sign in again. Please refresh the page.';
    }
    
    if (error.message.includes('quota') || error.message.includes('limit')) {
      return 'Service temporarily unavailable. Please try again in a few minutes.';
    }
    
    // Generic message for other errors
    return 'Something went wrong while processing your request. Please try again.';
  }
}

/**
 * HOC to wrap components with error boundary
 */
export function withChatErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ChatErrorBoundary {...errorBoundaryProps}>
        <WrappedComponent {...props} />
      </ChatErrorBoundary>
    );
  };
}

export default ChatErrorBoundary;
