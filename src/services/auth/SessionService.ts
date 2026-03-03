/**
 * SessionService - Secure Session Management
 * 
 * Handles JWT token storage, refresh, and session validation.
 * Replaces insecure localStorage-based session storage.
 */

// ============================================================================
// Types
// ============================================================================

export interface SessionData {
  idToken: string;
  refreshToken: string;
  expiresAt: number;
  userId: string;
}

export interface SessionConfig {
  /** Storage key prefix */
  storagePrefix: string;
  /** Token refresh threshold in milliseconds (default: 5 minutes) */
  refreshThreshold: number;
  /** Session timeout in milliseconds (default: 24 hours) */
  sessionTimeout: number;
  /** Enable secure storage (default: true) */
  useSecureStorage: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: SessionConfig = {
  storagePrefix: 'amble_session_',
  refreshThreshold: 5 * 60 * 1000, // 5 minutes
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  useSecureStorage: true,
};

// ============================================================================
// SessionService
// ============================================================================

export class SessionService {
  private config: SessionConfig;
  private refreshTimer: NodeJS.Timeout | null = null;
  private onRefreshCallback: (() => Promise<string | null>) | null = null;
  private onSessionExpiredCallback: (() => void) | null = null;

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // --------------------------------------------------------------------------
  // Token Storage
  // --------------------------------------------------------------------------

  /**
   * Store session data securely
   */
  storeSession(session: SessionData): void {
    if (typeof window === 'undefined') return;

    try {
      const data = this.encodeSession(session);
      
      if (this.config.useSecureStorage) {
        // Use sessionStorage for better security (cleared on browser close)
        sessionStorage.setItem(this.getKey('token'), data);
        
        // Also store a flag in localStorage for "remember me" functionality
        const expiresAt = Date.now() + this.config.sessionTimeout;
        localStorage.setItem(this.getKey('expires'), expiresAt.toString());
      } else {
        localStorage.setItem(this.getKey('token'), data);
      }

      // Start refresh timer
      this.scheduleRefresh(session.expiresAt);
      
      console.log('[SessionService] Session stored successfully');
    } catch (error) {
      console.error('[SessionService] Failed to store session:', error);
    }
  }

  /**
   * Retrieve stored session data
   */
  getSession(): SessionData | null {
    if (typeof window === 'undefined') return null;

    try {
      let data: string | null = null;

      if (this.config.useSecureStorage) {
        data = sessionStorage.getItem(this.getKey('token'));
        
        // Check if session has expired
        const expiresAt = localStorage.getItem(this.getKey('expires'));
        if (expiresAt && Date.now() > parseInt(expiresAt, 10)) {
          this.clearSession();
          return null;
        }
      } else {
        data = localStorage.getItem(this.getKey('token'));
      }

      if (!data) return null;

      const session = this.decodeSession(data);
      
      // Validate session hasn't expired
      if (session.expiresAt < Date.now()) {
        this.clearSession();
        return null;
      }

      return session;
    } catch (error) {
      console.error('[SessionService] Failed to retrieve session:', error);
      return null;
    }
  }

  /**
   * Clear stored session
   */
  clearSession(): void {
    if (typeof window === 'undefined') return;

    try {
      sessionStorage.removeItem(this.getKey('token'));
      localStorage.removeItem(this.getKey('token'));
      localStorage.removeItem(this.getKey('expires'));
      
      // Clear refresh timer
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }
      
      console.log('[SessionService] Session cleared');
    } catch (error) {
      console.error('[SessionService] Failed to clear session:', error);
    }
  }

  // --------------------------------------------------------------------------
  // Token Refresh
  // --------------------------------------------------------------------------

  /**
   * Set the callback for refreshing tokens
   */
  setRefreshCallback(callback: () => Promise<string | null>): void {
    this.onRefreshCallback = callback;
  }

  /**
   * Set the callback for when session expires
   */
  setSessionExpiredCallback(callback: () => void): void {
    this.onSessionExpiredCallback = callback;
  }

  /**
   * Schedule automatic token refresh
   */
  private scheduleRefresh(expiresAt: number): void {
    // Clear existing timer
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    const timeUntilExpiry = expiresAt - Date.now();
    const refreshIn = Math.max(0, timeUntilExpiry - this.config.refreshThreshold);

    if (refreshIn <= 0) {
      // Token already needs refresh
      this.refreshToken();
      return;
    }

    console.log(`[SessionService] Scheduling token refresh in ${Math.round(refreshIn / 1000)}s`);

    this.refreshTimer = setTimeout(() => {
      this.refreshToken();
    }, refreshIn);
  }

  /**
   * Refresh the current token
   */
  private async refreshToken(): Promise<void> {
    if (!this.onRefreshCallback) {
      console.warn('[SessionService] No refresh callback set');
      return;
    }

    try {
      console.log('[SessionService] Refreshing token...');
      const newToken = await this.onRefreshCallback();
      
      if (newToken) {
        // Token refresh successful - the callback should have updated the session
        console.log('[SessionService] Token refreshed successfully');
      } else {
        // Token refresh failed
        console.warn('[SessionService] Token refresh returned null');
        this.handleSessionExpired();
      }
    } catch (error) {
      console.error('[SessionService] Token refresh failed:', error);
      this.handleSessionExpired();
    }
  }

  /**
   * Handle session expiration
   */
  private handleSessionExpired(): void {
    this.clearSession();
    
    if (this.onSessionExpiredCallback) {
      this.onSessionExpiredCallback();
    }
  }

  // --------------------------------------------------------------------------
  // Token Validation
  // --------------------------------------------------------------------------

  /**
   * Check if the current session is valid
   */
  isSessionValid(): boolean {
    const session = this.getSession();
    return session !== null && session.expiresAt > Date.now();
  }

  /**
   * Check if the token needs to be refreshed
   */
  needsRefresh(): boolean {
    const session = this.getSession();
    if (!session) return false;
    
    return session.expiresAt - Date.now() < this.config.refreshThreshold;
  }

  /**
   * Get the current ID token (refreshing if needed)
   */
  async getValidToken(): Promise<string | null> {
    const session = this.getSession();
    if (!session) return null;

    // Check if token needs refresh
    if (this.needsRefresh() && this.onRefreshCallback) {
      const newToken = await this.onRefreshCallback();
      return newToken || session.idToken;
    }

    return session.idToken;
  }

  // --------------------------------------------------------------------------
  // Session Info
  // --------------------------------------------------------------------------

  /**
   * Get time until session expires (in milliseconds)
   */
  getTimeUntilExpiry(): number {
    const session = this.getSession();
    if (!session) return 0;
    
    return Math.max(0, session.expiresAt - Date.now());
  }

  /**
   * Get the current user ID from session
   */
  getUserId(): string | null {
    const session = this.getSession();
    return session?.userId || null;
  }

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  private getKey(key: string): string {
    return `${this.config.storagePrefix}${key}`;
  }

  /**
   * Encode session data for storage
   * In production, consider adding encryption
   */
  private encodeSession(session: SessionData): string {
    return btoa(JSON.stringify(session));
  }

  /**
   * Decode session data from storage
   */
  private decodeSession(data: string): SessionData {
    return JSON.parse(atob(data));
  }

  // --------------------------------------------------------------------------
  // Activity Tracking
  // --------------------------------------------------------------------------

  private activityTimer: NodeJS.Timeout | null = null;
  private lastActivity: number = Date.now();

  /**
   * Start tracking user activity for session timeout
   */
  startActivityTracking(timeoutMs: number = 30 * 60 * 1000): void {
    if (typeof window === 'undefined') return;

    const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart'];
    
    const updateActivity = () => {
      this.lastActivity = Date.now();
    };

    events.forEach(event => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    // Check for inactivity periodically
    this.activityTimer = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivity;
      if (inactiveTime > timeoutMs) {
        console.log('[SessionService] User inactive, expiring session');
        this.handleSessionExpired();
      }
    }, 60000); // Check every minute
  }

  /**
   * Stop activity tracking
   */
  stopActivityTracking(): void {
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // Cleanup
  // --------------------------------------------------------------------------

  /**
   * Clean up all timers and listeners
   */
  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }
    
    this.stopActivityTracking();
    this.onRefreshCallback = null;
    this.onSessionExpiredCallback = null;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let sessionServiceInstance: SessionService | null = null;

export function getSessionService(config?: Partial<SessionConfig>): SessionService {
  if (!sessionServiceInstance) {
    sessionServiceInstance = new SessionService(config);
  }
  return sessionServiceInstance;
}

// ============================================================================
// React Hook for Session Management
// ============================================================================

import { useState, useEffect, useCallback } from 'react';

export interface UseSessionResult {
  isValid: boolean;
  userId: string | null;
  timeUntilExpiry: number;
  getToken: () => Promise<string | null>;
  clearSession: () => void;
}

export function useSession(): UseSessionResult {
  const [sessionService] = useState(() => getSessionService());
  const [isValid, setIsValid] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [timeUntilExpiry, setTimeUntilExpiry] = useState(0);

  useEffect(() => {
    // Initial check
    setIsValid(sessionService.isSessionValid());
    setUserId(sessionService.getUserId());
    setTimeUntilExpiry(sessionService.getTimeUntilExpiry());

    // Update periodically
    const interval = setInterval(() => {
      setIsValid(sessionService.isSessionValid());
      setUserId(sessionService.getUserId());
      setTimeUntilExpiry(sessionService.getTimeUntilExpiry());
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [sessionService]);

  const getToken = useCallback(async () => {
    return sessionService.getValidToken();
  }, [sessionService]);

  const clearSession = useCallback(() => {
    sessionService.clearSession();
    setIsValid(false);
    setUserId(null);
    setTimeUntilExpiry(0);
  }, [sessionService]);

  return {
    isValid,
    userId,
    timeUntilExpiry,
    getToken,
    clearSession,
  };
}

export default SessionService;
