/**
 * SessionService Unit Tests
 * 
 * Tests for the JWT session management service
 */

import { SessionService, SessionData, SessionConfig } from '@/services/auth/SessionService';

// Mock sessionStorage and localStorage
const mockSessionStorage: Record<string, string> = {};
const mockLocalStorage: Record<string, string> = {};

const sessionStorageMock = {
  getItem: jest.fn((key: string) => mockSessionStorage[key] || null),
  setItem: jest.fn((key: string, value: string) => { mockSessionStorage[key] = value; }),
  removeItem: jest.fn((key: string) => { delete mockSessionStorage[key]; }),
  clear: jest.fn(() => { Object.keys(mockSessionStorage).forEach(k => delete mockSessionStorage[k]); }),
};

const localStorageMock = {
  getItem: jest.fn((key: string) => mockLocalStorage[key] || null),
  setItem: jest.fn((key: string, value: string) => { mockLocalStorage[key] = value; }),
  removeItem: jest.fn((key: string) => { delete mockLocalStorage[key]; }),
  clear: jest.fn(() => { Object.keys(mockLocalStorage).forEach(k => delete mockLocalStorage[k]); }),
};

Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock btoa and atob
global.btoa = jest.fn((str: string) => Buffer.from(str).toString('base64'));
global.atob = jest.fn((str: string) => Buffer.from(str, 'base64').toString());

describe('SessionService', () => {
  let sessionService: SessionService;

  const mockSessionData: SessionData = {
    idToken: 'test-id-token',
    refreshToken: 'test-refresh-token',
    expiresAt: Date.now() + 3600000, // 1 hour from now
    userId: 'user-123',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    sessionStorageMock.clear();
    localStorageMock.clear();
    sessionService = new SessionService({ useSecureStorage: true });
  });

  describe('storeSession', () => {
    it('should store session in sessionStorage when useSecureStorage is true', () => {
      sessionService.storeSession(mockSessionData);

      expect(sessionStorageMock.setItem).toHaveBeenCalled();
      const storedKey = sessionStorageMock.setItem.mock.calls[0][0];
      expect(storedKey).toContain('token');
    });

    it('should store expiry in localStorage', () => {
      sessionService.storeSession(mockSessionData);

      expect(localStorageMock.setItem).toHaveBeenCalled();
      const storedKey = localStorageMock.setItem.mock.calls[0][0];
      expect(storedKey).toContain('expires');
    });
  });

  describe('getSession', () => {
    it('should return null when no session is stored', () => {
      const result = sessionService.getSession();
      expect(result).toBeNull();
    });

    it('should return session data when valid session exists', () => {
      // Store a session first
      const encoded = btoa(JSON.stringify(mockSessionData));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.getSession();

      expect(result).not.toBeNull();
      expect(result?.userId).toBe('user-123');
    });

    it('should return null for expired session', () => {
      const expiredSession = {
        ...mockSessionData,
        expiresAt: Date.now() - 1000, // Already expired
      };
      const encoded = btoa(JSON.stringify(expiredSession));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.getSession();

      expect(result).toBeNull();
    });
  });

  describe('clearSession', () => {
    it('should remove session from both storages', () => {
      sessionService.storeSession(mockSessionData);
      sessionService.clearSession();

      expect(sessionStorageMock.removeItem).toHaveBeenCalled();
      expect(localStorageMock.removeItem).toHaveBeenCalled();
    });
  });

  describe('isSessionValid', () => {
    it('should return false when no session exists', () => {
      const result = sessionService.isSessionValid();
      expect(result).toBe(false);
    });

    it('should return true for valid non-expired session', () => {
      const encoded = btoa(JSON.stringify(mockSessionData));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.isSessionValid();

      expect(result).toBe(true);
    });
  });

  describe('needsRefresh', () => {
    it('should return false when no session exists', () => {
      const result = sessionService.needsRefresh();
      expect(result).toBe(false);
    });

    it('should return true when token is about to expire', () => {
      const soonToExpireSession = {
        ...mockSessionData,
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes (within 5 min threshold)
      };
      const encoded = btoa(JSON.stringify(soonToExpireSession));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.needsRefresh();

      expect(result).toBe(true);
    });

    it('should return false when token has plenty of time', () => {
      const encoded = btoa(JSON.stringify(mockSessionData));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.needsRefresh();

      expect(result).toBe(false);
    });
  });

  describe('getUserId', () => {
    it('should return null when no session exists', () => {
      const result = sessionService.getUserId();
      expect(result).toBeNull();
    });

    it('should return user ID from session', () => {
      const encoded = btoa(JSON.stringify(mockSessionData));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.getUserId();

      expect(result).toBe('user-123');
    });
  });

  describe('getTimeUntilExpiry', () => {
    it('should return 0 when no session exists', () => {
      const result = sessionService.getTimeUntilExpiry();
      expect(result).toBe(0);
    });

    it('should return time until expiry in milliseconds', () => {
      const encoded = btoa(JSON.stringify(mockSessionData));
      mockSessionStorage['amble_session_token'] = encoded;
      mockLocalStorage['amble_session_expires'] = (Date.now() + 3600000).toString();

      const result = sessionService.getTimeUntilExpiry();

      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(3600000);
    });
  });

  describe('setRefreshCallback', () => {
    it('should set refresh callback', () => {
      const mockCallback = jest.fn().mockResolvedValue('new-token');
      
      sessionService.setRefreshCallback(mockCallback);

      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });

  describe('setSessionExpiredCallback', () => {
    it('should set session expired callback', () => {
      const mockCallback = jest.fn();
      
      sessionService.setSessionExpiredCallback(mockCallback);

      // Just verify it doesn't throw
      expect(true).toBe(true);
    });
  });
});
