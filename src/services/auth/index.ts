/**
 * Auth Service Barrel Export
 */

export {
  AuthService,
  getAuthService,
  resetAuthService,
  type AppUser,
  type AuthSession,
  type AuthError,
  type UserPermissions,
  type UserCapabilities,
  type AIConfig,
} from './AuthService';

export {
  SessionService,
  getSessionService,
  useSession,
  type SessionData,
  type SessionConfig,
  type UseSessionResult,
} from './SessionService';
