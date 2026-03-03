/**
 * useFirebaseAuth - Hook for Firebase Auth state management
 * 
 * Features:
 * - Firebase Auth state subscription
 * - Automatic token refresh
 * - Session persistence
 * - Loading states
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Auth, User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { AuthService, AppUser, AuthSession, AuthError, getAuthService } from '@/services/auth/AuthService';
import { auth, db, isFirebaseInitialized } from '@/lib/firebase';

// ============================================================================
// Types
// ============================================================================

export interface UseFirebaseAuthOptions {
  onAuthStateChange?: (user: AppUser | null) => void;
  onError?: (error: AuthError) => void;
}

export interface UseFirebaseAuthResult {
  user: AppUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: AuthError | null;
  
  // Actions
  signInWithEmail: (email: string, password: string) => Promise<AppUser>;
  signInWithGoogle: () => Promise<AppUser>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (updates: { name?: string; photoURL?: string }) => Promise<AppUser>;
  
  // Token management
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
  
  // Session info
  session: AuthSession | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useFirebaseAuth(options: UseFirebaseAuthOptions = {}): UseFirebaseAuthResult {
  const { onAuthStateChange, onError } = options;
  
  const [user, setUser] = useState<AppUser | null>(null);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  
  const authServiceRef = useRef<AuthService | null>(null);
  const mountedRef = useRef(true);

  // Initialize auth service
  useEffect(() => {
    mountedRef.current = true;
    
    const initAuth = async () => {
      if (!isFirebaseInitialized() || !auth || !db) {
        setIsLoading(false);
        return;
      }

      try {
        const service = getAuthService(auth, db);
        authServiceRef.current = service;

        // Subscribe to auth state changes
        const unsubscribe = service.onAuthStateChange((appUser) => {
          if (!mountedRef.current) return;
          
          setUser(appUser);
          setSession(service.getSession());
          onAuthStateChange?.(appUser);
        });

        // Initialize and restore session
        const initialUser = await service.initialize();
        
        if (mountedRef.current) {
          setUser(initialUser);
          setSession(service.getSession());
          setIsLoading(false);
        }

        return unsubscribe;
      } catch (err) {
        console.error('[useFirebaseAuth] Init error:', err);
        if (mountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    initAuth();

    return () => {
      mountedRef.current = false;
    };
  }, [onAuthStateChange]);

  // Activity tracking for session timeout
  useEffect(() => {
    if (!user) return;

    const recordActivity = () => {
      authServiceRef.current?.recordActivity();
    };

    // Throttle activity recording to once per minute
    let lastRecorded = 0;
    const throttledRecordActivity = () => {
      const now = Date.now();
      if (now - lastRecorded > 60000) { // 1 minute
        lastRecorded = now;
        recordActivity();
      }
    };

    // Listen for user activity events
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, throttledRecordActivity, { passive: true });
    });

    // Also record on visibility change (user comes back to tab)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        recordActivity();
        // Also check if session is still valid when user returns
        if (authServiceRef.current && !authServiceRef.current.isSessionValid()) {
          authServiceRef.current.signOut().catch(console.error);
        }
        // Clean up expired Google Drive tokens (but do NOT sign out — Drive token != auth session)
        const googleTokenExpiry = localStorage.getItem('googleTokenExpiry');
        if (googleTokenExpiry && Date.now() > parseInt(googleTokenExpiry, 10)) {
          console.log('[useFirebaseAuth] Google Drive token expired, clearing Drive tokens (user stays logged in)');
          localStorage.removeItem('googleAccessToken');
          localStorage.removeItem('googleTokenExpiry');
          localStorage.removeItem('googleRefreshToken');
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Periodic Google Drive token cleanup (every 2 minutes) — only clears tokens, never signs out
    const driveTokenCheckInterval = setInterval(() => {
      const googleTokenExpiry = localStorage.getItem('googleTokenExpiry');
      if (googleTokenExpiry && Date.now() > parseInt(googleTokenExpiry, 10)) {
        console.log('[useFirebaseAuth] Google Drive token expired (periodic cleanup)');
        localStorage.removeItem('googleAccessToken');
        localStorage.removeItem('googleTokenExpiry');
        localStorage.removeItem('googleRefreshToken');
      }
    }, 2 * 60 * 1000);

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, throttledRecordActivity);
      });
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(driveTokenCheckInterval);
    };
  }, [user]);

  // Sign in with email
  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AppUser> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    setError(null);
    setIsLoading(true);

    try {
      const appUser = await authServiceRef.current.signInWithEmail(email, password);
      setUser(appUser);
      setSession(authServiceRef.current.getSession());
      return appUser;
    } catch (err: any) {
      const authError = err as AuthError;
      setError(authError);
      onError?.(authError);
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  // Sign in with Google
  const signInWithGoogle = useCallback(async (): Promise<AppUser> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    setError(null);
    setIsLoading(true);

    try {
      const appUser = await authServiceRef.current.signInWithGoogle();
      setUser(appUser);
      setSession(authServiceRef.current.getSession());
      return appUser;
    } catch (err: any) {
      const authError = err as AuthError;
      setError(authError);
      onError?.(authError);
      throw authError;
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  // Sign out
  const signOut = useCallback(async (): Promise<void> => {
    if (!authServiceRef.current) return;

    setError(null);

    try {
      await authServiceRef.current.signOut();
      setUser(null);
      setSession(null);
    } catch (err: any) {
      const authError = err as AuthError;
      setError(authError);
      onError?.(authError);
      throw authError;
    }
  }, [onError]);

  // Send password reset
  const sendPasswordReset = useCallback(async (email: string): Promise<void> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    setError(null);

    try {
      await authServiceRef.current.sendPasswordReset(email);
    } catch (err: any) {
      const authError = err as AuthError;
      setError(authError);
      onError?.(authError);
      throw authError;
    }
  }, [onError]);

  // Update password
  const updatePassword = useCallback(async (
    currentPassword: string,
    newPassword: string
  ): Promise<void> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    setError(null);

    try {
      await authServiceRef.current.updatePassword(currentPassword, newPassword);
    } catch (err: any) {
      const authError = err as AuthError;
      setError(authError);
      onError?.(authError);
      throw authError;
    }
  }, [onError]);

  // Update profile
  const updateProfile = useCallback(async (
    updates: { name?: string; photoURL?: string }
  ): Promise<AppUser> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    setError(null);

    try {
      const updatedUser = await authServiceRef.current.updateUserProfile(updates);
      setUser(updatedUser);
      return updatedUser;
    } catch (err: any) {
      const authError = err as AuthError;
      setError(authError);
      onError?.(authError);
      throw authError;
    }
  }, [onError]);

  // Get ID token
  const getIdToken = useCallback(async (forceRefresh = false): Promise<string | null> => {
    if (!authServiceRef.current) return null;
    return authServiceRef.current.getIdToken(forceRefresh);
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    signInWithEmail,
    signInWithGoogle,
    signOut,
    sendPasswordReset,
    updatePassword,
    updateProfile,
    getIdToken,
    session,
  };
}

// ============================================================================
// Admin Hook
// ============================================================================

export interface UseAuthAdminResult {
  users: AppUser[];
  isLoading: boolean;
  error: AuthError | null;
  
  // Admin actions
  createUser: (
    email: string,
    password: string,
    name: string,
    role?: 'admin' | 'user',
    permissions?: Partial<AppUser['permissions']>,
    capabilities?: Partial<AppUser['capabilities']>
  ) => Promise<AppUser>;
  
  preRegisterUser: (
    email: string,
    name: string,
    role?: 'admin' | 'user',
    permissions?: Partial<AppUser['permissions']>,
    capabilities?: Partial<AppUser['capabilities']>
  ) => Promise<string>;
  
  updateUserPermissions: (userId: string, permissions: AppUser['permissions']) => Promise<void>;
  updateUserCapabilities: (userId: string, capabilities: AppUser['capabilities']) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
}

export function useAuthAdmin(): UseAuthAdminResult {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<AuthError | null>(null);
  
  const authServiceRef = useRef<AuthService | null>(null);

  // Initialize and fetch users
  useEffect(() => {
    const init = async () => {
      if (!isFirebaseInitialized() || !auth || !db) {
        setIsLoading(false);
        return;
      }

      const service = getAuthService(auth, db);
      authServiceRef.current = service;

      try {
        const allUsers = await service.getAllUsers();
        setUsers(allUsers);
      } catch (err: any) {
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const refreshUsers = useCallback(async () => {
    if (!authServiceRef.current) return;
    
    setIsLoading(true);
    try {
      const allUsers = await authServiceRef.current.getAllUsers();
      setUsers(allUsers);
    } catch (err: any) {
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createUser = useCallback(async (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'user' = 'user',
    permissions?: Partial<AppUser['permissions']>,
    capabilities?: Partial<AppUser['capabilities']>
  ): Promise<AppUser> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    const newUser = await authServiceRef.current.createUser(
      email, password, name, role, permissions, capabilities
    );
    await refreshUsers();
    return newUser;
  }, [refreshUsers]);

  const preRegisterUser = useCallback(async (
    email: string,
    name: string,
    role: 'admin' | 'user' = 'user',
    permissions?: Partial<AppUser['permissions']>,
    capabilities?: Partial<AppUser['capabilities']>
  ): Promise<string> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    const userId = await authServiceRef.current.preRegisterUser(
      email, name, role, permissions, capabilities
    );
    await refreshUsers();
    return userId;
  }, [refreshUsers]);

  const updateUserPermissions = useCallback(async (
    userId: string,
    permissions: AppUser['permissions']
  ): Promise<void> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    await authServiceRef.current.updateUserPermissions(userId, permissions);
    await refreshUsers();
  }, [refreshUsers]);

  const updateUserCapabilities = useCallback(async (
    userId: string,
    capabilities: AppUser['capabilities']
  ): Promise<void> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    await authServiceRef.current.updateUserCapabilities(userId, capabilities);
    await refreshUsers();
  }, [refreshUsers]);

  const deleteUser = useCallback(async (userId: string): Promise<void> => {
    if (!authServiceRef.current) {
      throw { code: 'NOT_INITIALIZED', message: 'Auth service not initialized' };
    }

    await authServiceRef.current.deleteUser(userId);
    await refreshUsers();
  }, [refreshUsers]);

  return {
    users,
    isLoading,
    error,
    createUser,
    preRegisterUser,
    updateUserPermissions,
    updateUserCapabilities,
    deleteUser,
    refreshUsers,
  };
}

export default useFirebaseAuth;
