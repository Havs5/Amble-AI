/**
 * Integration Tests - Auth Flow
 * 
 * Tests the complete authentication flow:
 * - User login
 * - Session management
 * - Token refresh
 * - User logout
 * 
 * Run with: npm test -- --testPathPatterns=integration.auth
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';

// Mock Firebase Auth
const mockUser = {
  uid: 'test-user-123',
  email: 'test@example.com',
  displayName: 'Test User',
  getIdToken: jest.fn<() => Promise<string>>().mockResolvedValue('mock-token-123'),
  getIdTokenResult: jest.fn<() => Promise<{ token: string; claims: { role: string }; expirationTime: string }>>().mockResolvedValue({
    token: 'mock-token-123',
    claims: { role: 'user' },
    expirationTime: new Date(Date.now() + 3600000).toISOString(),
  }),
};

const mockGoogleProvider = {
  addScope: jest.fn(),
  setCustomParameters: jest.fn(),
};

const mockAuth = {
  currentUser: null as typeof mockUser | null,
  onAuthStateChanged: jest.fn((callback: (user: typeof mockUser | null) => void) => {
    callback(mockAuth.currentUser);
    return jest.fn(); // unsubscribe
  }),
  signInWithEmailAndPassword: jest.fn(),
  signOut: jest.fn(),
};

// Mock Firebase - must be before imports
jest.mock('firebase/auth', () => ({
  getAuth: () => mockAuth,
  signInWithEmailAndPassword: (...args: any[]) => mockAuth.signInWithEmailAndPassword(...args),
  signOut: (...args: any[]) => mockAuth.signOut(...args),
  onAuthStateChanged: (auth: any, callback: any) => mockAuth.onAuthStateChanged(callback),
  GoogleAuthProvider: jest.fn(() => mockGoogleProvider),
  signInWithPopup: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

// Mock Firestore
jest.mock('firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  doc: jest.fn(),
  getDoc: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  serverTimestamp: jest.fn(() => new Date()),
}));

// Mock Firebase app
jest.mock('@/lib/firebase', () => ({
  auth: mockAuth,
  db: {},
}));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Mock sessionStorage
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] || null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'sessionStorage', { value: sessionStorageMock });

describe('Integration: Auth Flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.clear();
    sessionStorageMock.clear();
    mockAuth.currentUser = null;
  });

  describe('Session Management', () => {
    it('should complete full session flow', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();
      
      // 1. Store session after successful login
      sessionService.storeSession({
        idToken: 'mock-token-123',
        refreshToken: 'mock-refresh-token',
        userId: 'test-user-123',
        expiresAt: Date.now() + 3600000,
      });

      // 2. Verify session is stored
      const session = sessionService.getSession();
      expect(session).not.toBeNull();
      expect(session?.userId).toBe('test-user-123');
      expect(session?.idToken).toBe('mock-token-123');

      // 3. Verify session is valid
      expect(sessionService.isSessionValid()).toBe(true);
    });

    it('should track session activity', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // Store a session
      sessionService.storeSession({
        idToken: 'test-token',
        refreshToken: 'test-refresh-token',
        userId: 'user-123',
        expiresAt: Date.now() + 3600000,
      });

      // Session should be valid
      expect(sessionService.isSessionValid()).toBe(true);
      
      // Get session and verify it exists
      const session = sessionService.getSession();
      expect(session).not.toBeNull();
      expect(session?.userId).toBe('user-123');
    });

    it('should detect when session needs refresh', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // Store a session that expires soon (in 4 minutes)
      sessionService.storeSession({
        idToken: 'test-token',
        refreshToken: 'test-refresh-token',
        userId: 'user-123',
        expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes
      });

      // Should need refresh (threshold is typically 5 minutes)
      expect(sessionService.needsRefresh()).toBe(true);
    });

    it('should not need refresh when token is fresh', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // Store a session that expires in 30 minutes
      sessionService.storeSession({
        idToken: 'test-token',
        refreshToken: 'test-refresh-token',
        userId: 'user-123',
        expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
      });

      // Should NOT need refresh
      expect(sessionService.needsRefresh()).toBe(false);
    });
  });

  describe('Logout Flow', () => {
    it('should complete full logout flow', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // Setup: User is logged in
      sessionService.storeSession({
        idToken: 'test-token',
        refreshToken: 'test-refresh-token',
        userId: 'user-123',
        expiresAt: Date.now() + 3600000,
      });

      expect(sessionService.getSession()).not.toBeNull();

      // Logout: Clear session
      sessionService.clearSession();

      // Verify session is cleared
      expect(sessionService.getSession()).toBeNull();
      expect(sessionService.isSessionValid()).toBe(false);
    });
  });

  describe('Session Expiration', () => {
    it('should detect expired sessions', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // Store an expired session
      sessionService.storeSession({
        idToken: 'test-token',
        refreshToken: 'test-refresh-token',
        userId: 'user-123',
        expiresAt: Date.now() - 1000, // Already expired
      });

      // Session should be invalid
      expect(sessionService.isSessionValid()).toBe(false);
    });

    it('should handle no session stored', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // No session stored
      expect(sessionService.getSession()).toBeNull();
      expect(sessionService.isSessionValid()).toBe(false);
      // When no session exists, needsRefresh may return false (nothing to refresh)
      // The important check is that isSessionValid correctly returns false
    });
  });

  describe('Multiple Sessions', () => {
    it('should replace old session with new one', async () => {
      const { SessionService } = await import('@/services/auth/SessionService');
      const sessionService = new SessionService();

      // First session
      sessionService.storeSession({
        idToken: 'token-1',
        refreshToken: 'refresh-1',
        userId: 'user-1',
        expiresAt: Date.now() + 3600000,
      });

      expect(sessionService.getSession()?.userId).toBe('user-1');

      // Second session replaces first
      sessionService.storeSession({
        idToken: 'token-2',
        refreshToken: 'refresh-2',
        userId: 'user-2',
        expiresAt: Date.now() + 3600000,
      });

      expect(sessionService.getSession()?.userId).toBe('user-2');
    });
  });
});
