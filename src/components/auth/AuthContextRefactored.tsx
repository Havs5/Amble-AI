/**
 * AuthContextRefactored - Firebase Auth based authentication context
 * 
 * This is a refactored version using proper Firebase Auth SDK.
 * Replaces bcrypt-based authentication with Firebase Auth.
 * 
 * Key Changes:
 * - Uses Firebase Auth SDK for all authentication
 * - Proper session management with ID tokens
 * - Token refresh handling
 * - Pre-registration flow for Google sign-in
 * - No hardcoded admin credentials
 */

'use client';

import React, { createContext, useContext, useMemo, useState, useEffect } from 'react';
import { 
  useFirebaseAuth, 
  useAuthAdmin,
  type UseFirebaseAuthResult,
  type UseAuthAdminResult,
} from '@/hooks/useFirebaseAuth';
import { type AppUser, type UserPermissions, type UserCapabilities, type AIConfig } from '@/services/auth/AuthService';

// ============================================================================
// Legacy Type Aliases (for backward compatibility)
// ============================================================================

// Re-export types for existing code
export type { UserPermissions, UserCapabilities, AIConfig };

// Legacy User type (alias to AppUser for compatibility)
export type User = AppUser;

// ============================================================================
// Context Type
// ============================================================================

interface AuthContextType {
  // User state
  user: AppUser | null;
  users: AppUser[];
  isLoading: boolean;
  isGoogleConnected: boolean;
  
  // Legacy methods (maintained for backward compatibility)
  login: (email: string, password: string) => Promise<boolean>;
  loginWithGoogle: () => Promise<boolean>;
  logout: () => void;
  addUser: (
    email: string, 
    password: string, 
    name: string, 
    role: 'admin' | 'user', 
    permissions?: UserPermissions, 
    capabilities?: UserCapabilities,
    department?: string
  ) => Promise<boolean>;
  resetPassword: (newPassword: string) => Promise<boolean>;
  updateProfile: (name: string, email: string) => Promise<boolean>;
  updateUserPermissions: (userId: string, permissions: UserPermissions, skipRefresh?: boolean) => Promise<void>;
  updateUserCapabilities: (userId: string, capabilities: UserCapabilities, skipRefresh?: boolean) => Promise<void>;
  updateUserConfig: (userId: string, type: 'amble' | 'cx', config: AIConfig, skipRefresh?: boolean) => Promise<void>;
  updateUserDepartment: (userId: string, department: string, skipRefresh?: boolean) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  refreshUsers: () => Promise<void>;
  
  // New methods
  sendPasswordResetEmail: (email: string) => Promise<void>;
  preRegisterUser: (
    email: string,
    name: string,
    role?: 'admin' | 'user',
    permissions?: Partial<UserPermissions>,
    capabilities?: Partial<UserCapabilities>
  ) => Promise<string>;
  getIdToken: (forceRefresh?: boolean) => Promise<string | null>;
}

// ============================================================================
// Context
// ============================================================================

const AuthContext = createContext<AuthContextType | null>(null);

// ============================================================================
// Provider
// ============================================================================

// Default context value for SSR (before hydration)
const defaultContextValue: AuthContextType = {
  user: null,
  users: [],
  isLoading: true,
  isGoogleConnected: false,
  login: async () => false,
  loginWithGoogle: async () => false,
  logout: () => {},
  addUser: async () => false,
  resetPassword: async () => false,
  updateProfile: async () => false,
  updateUserPermissions: async () => {},
  updateUserCapabilities: async () => {},
  updateUserConfig: async () => {},
  updateUserDepartment: async () => {},
  deleteUser: async () => {},
  refreshUsers: async () => {},
  sendPasswordResetEmail: async () => {},
  preRegisterUser: async () => '',
  getIdToken: async () => null,
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Track if we're mounted (client-side)
  const [isMounted, setIsMounted] = useState(false);
  
  useEffect(() => {
    setIsMounted(true);
  }, []);
  
  // Provide default context during SSR
  if (!isMounted) {
    return (
      <AuthContext.Provider value={defaultContextValue}>
        {children}
      </AuthContext.Provider>
    );
  }
  
  return <AuthProviderInner>{children}</AuthProviderInner>;
}

function AuthProviderInner({ children }: { children: React.ReactNode }) {
  // Use the new Firebase Auth hook
  const auth = useFirebaseAuth();
  const admin = useAuthAdmin(auth.user);

  // Derive Google connected status
  const isGoogleConnected = auth.user?.authProvider === 'google';

  // Legacy-compatible login wrapper
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      await auth.signInWithEmail(email, password);
      return true;
    } catch (error) {
      console.error('[AuthContext] Login error:', error);
      return false;
    }
  };

  // Legacy-compatible Google login wrapper
  const loginWithGoogle = async (): Promise<boolean> => {
    try {
      await auth.signInWithGoogle();
      return true;
    } catch (error: any) {
      console.error('[AuthContext] Google login error:', error);
      // Re-throw specific errors for the Login component to handle
      if (error.code === 'USER_NOT_REGISTERED' || error.code === 'auth/popup-closed-by-user') {
        throw error;
      }
      return false;
    }
  };

  // Legacy-compatible logout wrapper
  const logout = () => {
    auth.signOut().catch(err => console.error('[AuthContext] Logout error:', err));
  };

  // Legacy-compatible addUser wrapper
  const addUser = async (
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'user',
    permissions?: UserPermissions,
    capabilities?: UserCapabilities,
    department?: string
  ): Promise<boolean> => {
    try {
      await admin.createUser(email, password, name, role, permissions, capabilities, department);
      return true;
    } catch (error: any) {
      console.error('[AuthContext] Add user error:', error);
      // Re-throw the error so the caller can access the actual error message
      throw error;
    }
  };

  // Legacy-compatible resetPassword wrapper
  const resetPassword = async (newPassword: string): Promise<boolean> => {
    if (!auth.user) return false;
    
    // Note: This requires the current password in the new system
    // For now, return false as this needs UI changes
    console.warn('[AuthContext] resetPassword needs to be updated to require current password');
    return false;
  };

  // Legacy-compatible updateProfile wrapper
  const updateProfile = async (name: string, email: string): Promise<boolean> => {
    try {
      // Note: Email update is handled differently in Firebase Auth
      await auth.updateProfile({ name });
      return true;
    } catch (error) {
      console.error('[AuthContext] Update profile error:', error);
      return false;
    }
  };

  // Legacy-compatible permission update
  const updateUserPermissions = async (userId: string, permissions: UserPermissions, skipRefresh?: boolean): Promise<void> => {
    await admin.updateUserPermissions(userId, permissions, skipRefresh);
  };

  // Legacy-compatible capability update
  const updateUserCapabilities = async (userId: string, capabilities: UserCapabilities, skipRefresh?: boolean): Promise<void> => {
    await admin.updateUserCapabilities(userId, capabilities, skipRefresh);
  };

  // Config update - now properly implemented
  const updateUserConfig = async (userId: string, type: 'amble' | 'cx', config: AIConfig, skipRefresh?: boolean): Promise<void> => {
    await admin.updateUserConfig(userId, type, config, skipRefresh);
  };

  // Department update
  const updateUserDepartment = async (userId: string, department: string, skipRefresh?: boolean): Promise<void> => {
    await admin.updateUserDepartment(userId, department, skipRefresh);
  };

  // Legacy-compatible delete
  const deleteUser = async (userId: string): Promise<void> => {
    await admin.deleteUser(userId);
  };

  // New methods
  const sendPasswordResetEmail = async (email: string): Promise<void> => {
    await auth.sendPasswordReset(email);
  };

  const preRegisterUser = async (
    email: string,
    name: string,
    role: 'admin' | 'user' = 'user',
    permissions?: Partial<UserPermissions>,
    capabilities?: Partial<UserCapabilities>
  ): Promise<string> => {
    return admin.preRegisterUser(email, name, role, permissions, capabilities);
  };

  const getIdToken = async (forceRefresh = false): Promise<string | null> => {
    return auth.getIdToken(forceRefresh);
  };

  // Memoized context value
  const value = useMemo<AuthContextType>(() => ({
    user: auth.user,
    users: admin.users,
    isLoading: auth.isLoading || admin.isLoading,
    isGoogleConnected,
    login,
    loginWithGoogle,
    logout,
    addUser,
    resetPassword,
    updateProfile,
    updateUserPermissions,
    updateUserCapabilities,
    updateUserConfig,
    updateUserDepartment,
    deleteUser,
    refreshUsers: admin.refreshUsers,
    sendPasswordResetEmail,
    preRegisterUser,
    getIdToken,
  }), [
    auth.user,
    auth.isLoading,
    admin.users,
    admin.isLoading,
    isGoogleConnected,
  ]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Return default values during SSR instead of throwing
    // This allows components to render without auth during prerendering
    return {
      user: null,
      users: [],
      isLoading: true,
      isGoogleConnected: false,
      login: async () => false,
      loginWithGoogle: async () => false,
      logout: () => {},
      addUser: async () => false,
      resetPassword: async () => false,
      updateProfile: async () => false,
      updateUserPermissions: async () => {},
      updateUserCapabilities: async () => {},
      updateUserConfig: async () => {},
      updateUserDepartment: async () => {},
      deleteUser: async () => {},
      refreshUsers: async () => {},
      sendPasswordResetEmail: async () => {},
      preRegisterUser: async () => '',
      getIdToken: async () => null,
    } as AuthContextType;
  }
  return context;
}

export default AuthContext;
