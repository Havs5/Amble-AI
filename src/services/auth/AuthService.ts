/**
 * AuthService - Firebase Authentication Service
 * 
 * Centralized authentication service using Firebase Auth SDK.
 * Replaces custom bcrypt authentication with proper Firebase Auth.
 * 
 * Features:
 * - Firebase Auth integration (Email/Password + Google)
 * - Proper session management with ID tokens
 * - Token refresh handling
 * - User metadata sync with Firestore
 */

import {
  Auth,
  User as FirebaseUser,
  UserCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail,
  updatePassword,
  updateEmail,
  updateProfile,
  onAuthStateChanged,
  GoogleAuthProvider,
  getIdToken,
  getIdTokenResult,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from 'firebase/auth';
import {
  Firestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { getCached, setCache, invalidateCache, CACHE_TTL, CACHE_KEYS } from '@/lib/clientCache';

// ============================================================================
// Types
// ============================================================================

export interface UserPermissions {
  accessAmble: boolean;
  accessBilling: boolean;
  accessStudio?: boolean;
  accessKnowledge?: boolean;
  accessPharmacy?: boolean;
}

export interface UserCapabilities {
  webBrowse: boolean;
  imageGen: boolean;
  codeInterpreter: boolean;
  realtimeVoice: boolean;
  vision: boolean;
  videoIn: boolean;
  longContext: boolean;
  aiDictation?: boolean;
  dictationMode?: 'auto' | 'browser' | 'whisper' | 'hybrid';
  skipCorrection?: boolean;
}

export interface AIConfig {
  systemPrompt: string;
  policies: string[];
  temperature: number;
  maxTokens: number;
}

export interface AppUser {
  id: string;
  uid: string; // Firebase Auth UID
  email: string;
  name: string;
  role: 'admin' | 'user' | 'superadmin';
  permissions: UserPermissions;
  capabilities: UserCapabilities;
  ambleConfig?: AIConfig;
  cxConfig?: AIConfig;
  department?: string;
  photoURL?: string;
  authProvider: 'email' | 'google';
  emailVerified: boolean;
  createdAt: Date;
  lastLoginAt: Date;
}

export interface AuthSession {
  user: AppUser;
  token: string;
  expiresAt: number;
  refreshToken?: string;
}

export interface AuthError {
  code: string;
  message: string;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_PERMISSIONS: UserPermissions = {
  accessAmble: true,
  accessBilling: true,
  accessStudio: false,
  accessKnowledge: false,
  accessPharmacy: false,
};

const DEFAULT_CAPABILITIES: UserCapabilities = {
  webBrowse: false,
  imageGen: false,
  codeInterpreter: false,
  realtimeVoice: false,
  vision: false,
  videoIn: false,
  longContext: false,
  aiDictation: false,
  dictationMode: 'auto',
  skipCorrection: false,
};

const DEFAULT_AI_CONFIG: AIConfig = {
  systemPrompt: 'You are Amble AI, a helpful general assistant.',
  policies: [],
  temperature: 0.7,
  maxTokens: 8192,
};

const SESSION_KEY = 'amble_auth_session';
const LAST_ACTIVITY_KEY = 'amble_last_activity';
const SESSION_START_KEY = 'amble_session_start';
const TAB_SESSION_KEY = 'amble_tab_active'; // sessionStorage — cleared when tab/browser closes
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes before expiry
const INACTIVITY_TIMEOUT = 12 * 60 * 60 * 1000; // 12 hours inactivity timeout
const MAX_SESSION_DURATION = 12 * 60 * 60 * 1000; // 12 hours absolute session timeout

// ============================================================================
// Auth Service Class
// ============================================================================

export class AuthService {
  private auth: Auth;
  private db: Firestore;
  private googleProvider: GoogleAuthProvider;
  private currentSession: AuthSession | null = null;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private sessionCheckTimer: ReturnType<typeof setInterval> | null = null;
  private authStateListeners: Set<(user: AppUser | null) => void> = new Set();

  constructor(auth: Auth, db: Firestore) {
    this.auth = auth;
    this.db = db;
    this.googleProvider = new GoogleAuthProvider();
    
    // Configure Google provider with necessary scopes
    this.googleProvider.addScope('https://www.googleapis.com/auth/userinfo.email');
    this.googleProvider.addScope('https://www.googleapis.com/auth/userinfo.profile');
    this.googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
  }

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Initialize the auth service and restore session if valid
   */
  async initialize(): Promise<AppUser | null> {
    return new Promise((resolve) => {
      const unsubscribe = onAuthStateChanged(this.auth, async (firebaseUser) => {
        unsubscribe();
        
        if (firebaseUser) {
          // If sessionStorage tab marker is missing, the tab/browser was closed
          // and re-opened — treat as a forced logout ("hard refresh").
          const isTabAlive = typeof window !== 'undefined' && sessionStorage.getItem(TAB_SESSION_KEY);

          if (!isTabAlive) {
            // First check if we ever had a session (avoids logging out on the
            // very first login where sessionStorage hasn't been set yet).
            const hadPreviousSession = localStorage.getItem(SESSION_KEY);
            if (hadPreviousSession) {
              console.log('[AuthService] Tab session marker missing — forcing sign-out');
              this.clearSession();
              await signOut(this.auth).catch(console.error);
              resolve(null);
              return;
            }
          }

          // Check if session has expired due to inactivity or max duration
          if (!this.isSessionValid()) {
            console.log('[AuthService] Session expired, signing out');
            this.clearSession();
            await signOut(this.auth).catch(console.error);
            resolve(null);
            return;
          }

          try {
            const appUser = await this.syncUserWithFirestore(firebaseUser);
            await this.createSession(firebaseUser, appUser);
            this.scheduleTokenRefresh(firebaseUser);
            this.startSessionCheck();
            resolve(appUser);
          } catch (error) {
            console.error('[AuthService] Error initializing user:', error);
            resolve(null);
          }
        } else {
          this.clearSession();
          resolve(null);
        }
      });
    });
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (user: AppUser | null) => void): () => void {
    this.authStateListeners.add(callback);
    
    // Immediately call with current state
    if (this.currentSession) {
      callback(this.currentSession.user);
    }

    return () => {
      this.authStateListeners.delete(callback);
    };
  }

  /**
   * Sign in with email and password
   */
  async signInWithEmail(email: string, password: string): Promise<AppUser> {
    try {
      const credential = await signInWithEmailAndPassword(this.auth, email, password);
      
      // Verify user exists in Firestore and has access
      const appUser = await this.syncUserWithFirestore(credential.user);
      await this.createSession(credential.user, appUser);
      this.scheduleTokenRefresh(credential.user);
      this.notifyListeners(appUser);
      
      return appUser;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Sign in with Google
   */
  async signInWithGoogle(): Promise<AppUser> {
    try {
      const result = await signInWithPopup(this.auth, this.googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      // Check if user is pre-registered in Firestore
      const appUser = await this.syncUserWithFirestore(result.user, true);
      
      // Store Google Drive access token if available
      if (credential?.accessToken) {
        await this.storeGoogleDriveToken(appUser.id, credential.accessToken);
      }
      
      await this.createSession(result.user, appUser);
      this.scheduleTokenRefresh(result.user);
      this.notifyListeners(appUser);
      
      return appUser;
    } catch (error: any) {
      // If user not registered, sign them out
      if (error.code === 'USER_NOT_REGISTERED') {
        await signOut(this.auth);
      }
      throw this.normalizeError(error);
    }
  }

  /**
   * Create a new user account (admin function)
   * Uses server-side API to create users with Firebase Admin SDK
   */
  async createUser(
    email: string,
    password: string,
    name: string,
    role: 'admin' | 'user' = 'user',
    permissions?: Partial<UserPermissions>,
    capabilities?: Partial<UserCapabilities>,
    department?: string
  ): Promise<AppUser> {
    try {
      // Get the current user's ID token for authentication
      const idToken = await this.getIdToken();
      if (!idToken) {
        throw { code: 'NOT_AUTHENTICATED', message: 'You must be logged in to create users' };
      }

      // Call the server-side API to create the user
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          email,
          password,
          name,
          role,
          permissions,
          capabilities,
          department,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw { 
          code: response.status === 409 ? 'auth/email-already-in-use' : 'CREATE_USER_FAILED',
          message: data.error || 'Failed to create user' 
        };
      }

      // Convert the response to AppUser format
      return {
        id: data.user.id,
        uid: data.user.uid,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        permissions: data.user.permissions,
        capabilities: data.user.capabilities,
        department: data.user.department,
        authProvider: 'email',
        emailVerified: false,
        createdAt: new Date(data.user.createdAt),
        lastLoginAt: new Date(data.user.lastLoginAt),
      };
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Pre-register a user for Google sign-in (admin function)
   */
  async preRegisterUser(
    email: string,
    name: string,
    role: 'admin' | 'user' = 'user',
    permissions?: Partial<UserPermissions>,
    capabilities?: Partial<UserCapabilities>
  ): Promise<string> {
    try {
      // Check if user already exists
      const existingQuery = query(
        collection(this.db, 'users'),
        where('email', '==', email)
      );
      const existingSnap = await getDocs(existingQuery);
      
      if (!existingSnap.empty) {
        throw { code: 'USER_EXISTS', message: 'User with this email already exists' };
      }

      // Create pre-registration document
      const preRegRef = doc(collection(this.db, 'users'));
      await setDoc(preRegRef, {
        email,
        name,
        role,
        permissions: { ...DEFAULT_PERMISSIONS, ...permissions },
        capabilities: { ...DEFAULT_CAPABILITIES, ...capabilities },
        ambleConfig: DEFAULT_AI_CONFIG,
        cxConfig: { ...DEFAULT_AI_CONFIG, systemPrompt: 'You are an expert billing and dispute specialist assistant.' },
        preRegistered: true,
        createdAt: Timestamp.now(),
      });

      return preRegRef.id;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Sign out current user
   */
  async signOut(): Promise<void> {
    try {
      const userId = this.currentSession?.user.id;
      const uid = this.currentSession?.user.uid;
      
      await signOut(this.auth);
      this.clearSession();
      this.notifyListeners(null);
      
      // Clean up user-specific storage and cache
      if (userId) {
        this.cleanupUserStorage(userId);
      }
      if (uid) {
        // Invalidate user cache on signout
        invalidateCache(CACHE_KEYS.USER_PROFILE(uid));
      }
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Record user activity to reset inactivity timer
   */
  recordActivity(): void {
    try {
      localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
    } catch {
      // localStorage not available
    }
  }

  /**
   * Check if session has expired due to inactivity or max duration
   * Returns true if session is still valid, false if expired
   */
  isSessionValid(): boolean {
    const now = Date.now();
    
    try {
      // Check if we have any session evidence (in-memory OR persisted)
      const hasPersistedSession = localStorage.getItem(SESSION_KEY);
      if (!this.currentSession && !hasPersistedSession) return false;

      // Check inactivity timeout
      const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
      if (lastActivity) {
        const lastActivityTime = parseInt(lastActivity, 10);
        if (now - lastActivityTime > INACTIVITY_TIMEOUT) {
          console.log('[AuthService] Session expired due to inactivity');
          return false;
        }
      }

      // Check max session duration
      const sessionStart = localStorage.getItem(SESSION_START_KEY);
      if (sessionStart) {
        const sessionStartTime = parseInt(sessionStart, 10);
        if (now - sessionStartTime > MAX_SESSION_DURATION) {
          console.log('[AuthService] Session expired due to max duration');
          return false;
        }
      }
    } catch {
      // localStorage not available, assume valid
    }

    return true;
  }

  /**
   * Start periodic session validity check
   */
  startSessionCheck(): void {
    // Check every 5 minutes
    this.sessionCheckTimer = setInterval(() => {
      if (!this.isSessionValid()) {
        this.signOut().catch(console.error);
      }
    }, 5 * 60 * 1000);
    
    // Also record initial activity
    this.recordActivity();
  }

  /**
   * Stop session validity check
   */
  stopSessionCheck(): void {
    if (this.sessionCheckTimer) {
      clearInterval(this.sessionCheckTimer);
      this.sessionCheckTimer = null;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email);
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update current user's password
   */
  async updatePassword(currentPassword: string, newPassword: string): Promise<void> {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser || !firebaseUser.email) {
      throw { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' };
    }

    try {
      // Re-authenticate first
      const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
      await reauthenticateWithCredential(firebaseUser, credential);
      
      // Update password
      await updatePassword(firebaseUser, newPassword);
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update current user's profile
   */
  async updateUserProfile(updates: { name?: string; photoURL?: string }): Promise<AppUser> {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser || !this.currentSession) {
      throw { code: 'NOT_AUTHENTICATED', message: 'User not authenticated' };
    }

    try {
      // Update Firebase Auth profile
      await updateProfile(firebaseUser, {
        displayName: updates.name,
        photoURL: updates.photoURL,
      });

      // Update Firestore document
      const userRef = doc(this.db, 'users', this.currentSession.user.id);
      await updateDoc(userRef, {
        ...(updates.name && { name: updates.name }),
        ...(updates.photoURL && { photoURL: updates.photoURL }),
        updatedAt: Timestamp.now(),
      });

      // Update session
      const updatedUser = {
        ...this.currentSession.user,
        ...updates,
      };
      this.currentSession.user = updatedUser;
      this.saveSessionToStorage();
      this.notifyListeners(updatedUser);

      return updatedUser;
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update user permissions (admin function)
   */
  async updateUserPermissions(userId: string, permissions: UserPermissions): Promise<void> {
    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, { permissions, updatedAt: Timestamp.now() });

      // Update session if it's the current user
      if (this.currentSession?.user.id === userId) {
        this.currentSession.user.permissions = permissions;
        this.saveSessionToStorage();
        this.notifyListeners(this.currentSession.user);
      }
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update user department (admin function)
   */
  async updateUserDepartment(userId: string, department: string): Promise<void> {
    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, { department, updatedAt: Timestamp.now() });

      // Update session if it's the current user
      if (this.currentSession?.user.id === userId) {
        this.currentSession.user.department = department;
        this.saveSessionToStorage();
        this.notifyListeners(this.currentSession.user);
      }
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update user capabilities (admin function)
   */
  async updateUserCapabilities(userId: string, capabilities: UserCapabilities): Promise<void> {
    try {
      const userRef = doc(this.db, 'users', userId);
      await updateDoc(userRef, { capabilities, updatedAt: Timestamp.now() });

      // Update session if it's the current user
      if (this.currentSession?.user.id === userId) {
        this.currentSession.user.capabilities = capabilities;
        this.saveSessionToStorage();
        this.notifyListeners(this.currentSession.user);
      }
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Update user AI configuration (admin function)
   */
  async updateUserConfig(userId: string, type: 'amble' | 'cx', config: AIConfig): Promise<void> {
    try {
      const userRef = doc(this.db, 'users', userId);
      const field = type === 'amble' ? 'ambleConfig' : 'cxConfig';
      await updateDoc(userRef, { [field]: config, updatedAt: Timestamp.now() });

      // Update session if it's the current user
      if (this.currentSession?.user.id === userId) {
        if (type === 'amble') {
          this.currentSession.user.ambleConfig = config;
        } else {
          this.currentSession.user.cxConfig = config;
        }
        this.saveSessionToStorage();
        this.notifyListeners(this.currentSession.user);
      }
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Delete a user (admin function)
   * Uses server-side API to delete from both Firebase Auth and Firestore
   */
  async deleteUser(userId: string): Promise<void> {
    try {
      const idToken = await this.getIdToken();
      if (!idToken) {
        throw { code: 'NOT_AUTHENTICATED', message: 'You must be logged in to delete users' };
      }

      const response = await fetch('/api/admin/delete-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw {
          code: 'DELETE_USER_FAILED',
          message: data.error || 'Failed to delete user',
        };
      }
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get all users (admin function)
   */
  async getAllUsers(): Promise<AppUser[]> {
    try {
      const snapshot = await getDocs(collection(this.db, 'users'));
      return snapshot.docs.map(doc => this.docToAppUser(doc.id, doc.data()));
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  /**
   * Get current session
   */
  getSession(): AuthSession | null {
    return this.currentSession;
  }

  /**
   * Get current ID token (for API calls)
   */
  async getIdToken(forceRefresh = false): Promise<string | null> {
    const firebaseUser = this.auth.currentUser;
    if (!firebaseUser) return null;

    try {
      return await getIdToken(firebaseUser, forceRefresh);
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async syncUserWithFirestore(
    firebaseUser: FirebaseUser,
    requirePreRegistration = false
  ): Promise<AppUser> {
    // PERFORMANCE: Check cache first to reduce Firestore reads
    const cacheKey = CACHE_KEYS.USER_PROFILE(firebaseUser.uid);
    const cached = getCached<AppUser>(cacheKey);
    if (cached) {
      console.log('[AuthService] User loaded from cache');
      return cached;
    }
    
    // Check for existing user by UID
    const userRef = doc(this.db, 'users_by_uid', firebaseUser.uid);
    const uidSnap = await getDoc(userRef);

    if (uidSnap.exists()) {
      // User exists, get their document
      const userId = uidSnap.data().userId;
      const userDoc = await getDoc(doc(this.db, 'users', userId));
      
      if (userDoc.exists()) {
        // Update last login
        await updateDoc(doc(this.db, 'users', userId), {
          lastLoginAt: Timestamp.now(),
          photoURL: firebaseUser.photoURL || undefined,
        });
        const appUser = this.docToAppUser(userId, userDoc.data());
        // Cache the user profile for 30 minutes
        setCache(cacheKey, appUser, CACHE_TTL.MEDIUM);
        return appUser;
      }
    }

    // Check for pre-registered user by email
    const emailQuery = query(
      collection(this.db, 'users'),
      where('email', '==', firebaseUser.email)
    );
    const emailSnap = await getDocs(emailQuery);

    if (!emailSnap.empty) {
      // Link pre-registered user to Firebase Auth UID
      const userDoc = emailSnap.docs[0];
      const userId = userDoc.id;

      // Create UID mapping
      await setDoc(doc(this.db, 'users_by_uid', firebaseUser.uid), { userId });

      // Update user document
      await updateDoc(doc(this.db, 'users', userId), {
        uid: firebaseUser.uid,
        emailVerified: firebaseUser.emailVerified,
        photoURL: firebaseUser.photoURL || undefined,
        preRegistered: false,
        lastLoginAt: Timestamp.now(),
      });

      const appUser = this.docToAppUser(userId, { ...userDoc.data(), uid: firebaseUser.uid });
      // Cache the user profile
      setCache(cacheKey, appUser, CACHE_TTL.MEDIUM);
      return appUser;
    }

    // User not found
    if (requirePreRegistration) {
      throw { code: 'USER_NOT_REGISTERED', message: 'User must be pre-registered by an administrator' };
    }

    // Auto-create user (only for email/password flow when pre-registration not required)
    return this.createUserDocument(firebaseUser, {
      authProvider: 'email',
    });
  }

  private async createUserDocument(
    firebaseUser: FirebaseUser,
    overrides: Partial<AppUser> = {}
  ): Promise<AppUser> {
    const userRef = doc(collection(this.db, 'users'));
    const now = Timestamp.now();

    const userData = {
      uid: firebaseUser.uid,
      email: firebaseUser.email!,
      name: overrides.name || firebaseUser.displayName || 'User',
      role: overrides.role || 'user',
      permissions: overrides.permissions || DEFAULT_PERMISSIONS,
      capabilities: overrides.capabilities || DEFAULT_CAPABILITIES,
      ambleConfig: DEFAULT_AI_CONFIG,
      cxConfig: { ...DEFAULT_AI_CONFIG, systemPrompt: 'You are an expert billing and dispute specialist assistant.' },
      photoURL: firebaseUser.photoURL || undefined,
      authProvider: overrides.authProvider || 'email',
      emailVerified: firebaseUser.emailVerified,
      createdAt: now,
      lastLoginAt: now,
    };

    await setDoc(userRef, userData);

    // Create UID mapping for fast lookups
    await setDoc(doc(this.db, 'users_by_uid', firebaseUser.uid), { userId: userRef.id });

    return {
      id: userRef.id,
      ...userData,
      createdAt: now.toDate(),
      lastLoginAt: now.toDate(),
    } as AppUser;
  }

  private async createSession(firebaseUser: FirebaseUser, appUser: AppUser): Promise<void> {
    const token = await getIdToken(firebaseUser);
    const tokenResult = await getIdTokenResult(firebaseUser);

    this.currentSession = {
      user: appUser,
      token: token!,
      expiresAt: new Date(tokenResult.expirationTime).getTime(),
    };

    // Set session start time for max duration tracking
    try {
      if (!localStorage.getItem(SESSION_START_KEY)) {
        localStorage.setItem(SESSION_START_KEY, Date.now().toString());
      }
      // Record initial activity
      this.recordActivity();
      // Mark the tab as alive (persists through F5 / Ctrl+R refreshes,
      // but is cleared when the tab or browser is closed).
      sessionStorage.setItem(TAB_SESSION_KEY, '1');
    } catch {
      // localStorage/sessionStorage not available
    }

    this.saveSessionToStorage();
  }

  private saveSessionToStorage(): void {
    if (this.currentSession) {
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify({
          user: this.currentSession.user,
          expiresAt: this.currentSession.expiresAt,
        }));
      } catch {
        // localStorage not available
      }
    }
  }

  private clearSession(): void {
    this.currentSession = null;
    
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }

    // Stop session check timer
    this.stopSessionCheck();

    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      localStorage.removeItem(SESSION_START_KEY);
      sessionStorage.removeItem(TAB_SESSION_KEY);
    } catch {
      // localStorage/sessionStorage not available
    }
  }

  private scheduleTokenRefresh(firebaseUser: FirebaseUser): void {
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
    }

    if (!this.currentSession) return;

    const timeUntilExpiry = this.currentSession.expiresAt - Date.now();
    const refreshIn = Math.max(0, timeUntilExpiry - TOKEN_REFRESH_THRESHOLD);

    this.tokenRefreshTimer = setTimeout(async () => {
      try {
        const newToken = await getIdToken(firebaseUser, true);
        const tokenResult = await getIdTokenResult(firebaseUser);

        if (this.currentSession) {
          this.currentSession.token = newToken;
          this.currentSession.expiresAt = new Date(tokenResult.expirationTime).getTime();
          this.saveSessionToStorage();
        }

        // Schedule next refresh
        this.scheduleTokenRefresh(firebaseUser);
      } catch (error) {
        console.error('[AuthService] Token refresh failed:', error);
        // Token refresh failed, user will need to re-authenticate
      }
    }, refreshIn);
  }

  private async storeGoogleDriveToken(userId: string, accessToken: string): Promise<void> {
    try {
      localStorage.setItem(`gdrive_access_token_${userId}`, accessToken);
      // Also store under generic key for KnowledgeBaseView compatibility
      localStorage.setItem('googleAccessToken', accessToken);
      
      await setDoc(doc(this.db, 'google_drive_tokens', userId), {
        accessToken,
        expiresAt: Date.now() + 3600 * 1000, // 1 hour
        updatedAt: Date.now(),
      }, { merge: true });
      
      // Trigger Knowledge Base sync with Drive files
      this.syncDriveToKnowledgeBase(userId, accessToken);
    } catch {
      // Non-critical, continue
    }
  }
  
  /**
   * Sync Google Drive files to Knowledge Base
   * Called after Google sign-in to index user's Drive content
   */
  private async syncDriveToKnowledgeBase(userId: string, accessToken: string): Promise<void> {
    try {
      console.log('[AuthService] Starting Knowledge Base sync from Drive...');
      
      // Get Firebase ID token for API authentication
      const firebaseToken = await this.getIdToken();
      if (!firebaseToken) {
        console.warn('[AuthService] No Firebase token available for KB sync');
        return;
      }

      const response = await fetch('/api/knowledge/drive-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${firebaseToken}`,
        },
        body: JSON.stringify({
          accessToken,
          folderId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID || undefined,
        }),
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.warn('[AuthService] KB sync failed:', error.error || response.status);
        return;
      }
      
      const result = await response.json();
      console.log('[AuthService] KB sync complete:', result.message);
    } catch (error) {
      // Non-critical - KB sync is background operation
      console.warn('[AuthService] KB sync error:', error);
    }
  }

  private cleanupUserStorage(userId: string): void {
    const keysToRemove = [
      SESSION_KEY,
      'amble_session',
      'amble_username',
      'amble_theme',
      `amble_sessions_${userId}`,
      `amble_last_session_id_${userId}`,
      `gdrive_access_token_${userId}`,
      `drive_folder_map_${userId}`,
    ];

    keysToRemove.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {
        // localStorage not available
      }
    });

    // Clean up pattern-based keys
    try {
      const patterns = ['amble_messages_', 'amble_notes_', 'amble_capabilities_', 'amble_usage_'];
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && patterns.some(p => key.startsWith(p))) {
          localStorage.removeItem(key);
        }
      }
    } catch {
      // localStorage not available
    }
  }

  private docToAppUser(id: string, data: any): AppUser {
    return {
      id,
      uid: data.uid || '',
      email: data.email,
      name: data.name || 'User',
      role: data.role || 'user',
      permissions: { ...DEFAULT_PERMISSIONS, ...data.permissions },
      capabilities: { ...DEFAULT_CAPABILITIES, ...data.capabilities },
      ambleConfig: data.ambleConfig,
      cxConfig: data.cxConfig,
      department: data.department,
      photoURL: data.photoURL,
      authProvider: data.authProvider || 'email',
      emailVerified: data.emailVerified ?? false,
      createdAt: data.createdAt?.toDate?.() || new Date(),
      lastLoginAt: data.lastLoginAt?.toDate?.() || new Date(),
    };
  }

  private notifyListeners(user: AppUser | null): void {
    this.authStateListeners.forEach(listener => listener(user));
  }

  private normalizeError(error: any): AuthError {
    const errorMap: Record<string, string> = {
      'auth/email-already-in-use': 'An account with this email already exists',
      'auth/invalid-email': 'Invalid email address',
      'auth/user-disabled': 'This account has been disabled',
      'auth/user-not-found': 'No account found with this email',
      'auth/wrong-password': 'Incorrect password',
      'auth/weak-password': 'Password should be at least 6 characters',
      'auth/popup-closed-by-user': 'Sign-in popup was closed',
      'auth/network-request-failed': 'Network error. Please check your connection',
      'auth/too-many-requests': 'Too many failed attempts. Please try again later',
      'auth/requires-recent-login': 'Please sign in again to complete this action',
      'USER_NOT_REGISTERED': 'User must be pre-registered by an administrator',
      'USER_EXISTS': 'User with this email already exists',
      'NOT_AUTHENTICATED': 'User not authenticated',
    };

    return {
      code: error.code || 'UNKNOWN_ERROR',
      message: errorMap[error.code] || error.message || 'An unexpected error occurred',
    };
  }
}

// ============================================================================
// Singleton Instance Factory
// ============================================================================

let authServiceInstance: AuthService | null = null;

export function getAuthService(auth: Auth, db: Firestore): AuthService {
  if (!authServiceInstance) {
    authServiceInstance = new AuthService(auth, db);
  }
  return authServiceInstance;
}

export function resetAuthService(): void {
  authServiceInstance = null;
}

export default AuthService;
