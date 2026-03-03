# 05 — Auth & Session

> **Last updated:** 2025-07-15  
> **Scope:** Authentication flow, session management, permissions model

---

## Authentication Providers

| Provider | Method | Implementation |
|----------|--------|---------------|
| **Email/Password** | Firebase Auth `signInWithEmailAndPassword` | Standard Firebase flow |
| **Google OAuth** | Firebase Auth `signInWithPopup` | Google provider with Drive scopes |

### Google OAuth Scopes
- `https://www.googleapis.com/auth/drive.readonly` — Read access to Google Drive
- `prompt: 'select_account'` — Always show account chooser

---

## Auth Architecture

### Components & Services

| File | Role |
|------|------|
| `components/auth/AuthContextRefactored.tsx` | React context provider; wraps entire app |
| `components/auth/LoginRefactored.tsx` | Login page UI (email + Google buttons) |
| `hooks/useFirebaseAuth.ts` | Firebase `onAuthStateChanged` listener + session init |
| `services/auth/AuthService.ts` | Core auth logic (968 lines) — singleton |
| `services/auth/SessionService.ts` | JWT-like session management (446 lines) |

### Auth Flow

```
1. App mount → AuthContextRefactored renders
2. → useFirebaseAuth() → AuthService.initialize()
3. → Firebase onAuthStateChanged fires
4. If user exists:
   a. syncUserWithFirestore()
      - Cache-first: check clientCache (30min TTL)
      - Firestore: lookup users_by_uid/{uid} → users/{email}
      - Merge Firebase Auth profile + Firestore user doc
   b. createSession()
      - Store base64-encoded session in sessionStorage
      - Set expiry in localStorage (12h)
   c. Schedule token refresh every 50 minutes
   d. Start periodic session validation (every 5 minutes)
5. Context provides: { user, isAuthenticated, isLoading, permissions, capabilities }
```

---

## Session Management

### Session Config

| Parameter | Value |
|-----------|-------|
| **Inactivity timeout** | 12 hours |
| **Max session duration** | 12 hours |
| **Token refresh interval** | 50 minutes |
| **Session validation interval** | 5 minutes |
| **Storage** | `sessionStorage` (session data) + `localStorage` (expiry, activity) |

### Session Lifecycle

```
createSession()
├── Encode session as base64 → sessionStorage
├── Set expiry timestamp → localStorage
├── Set lastActivity → localStorage
└── Schedule periodic checks

isSessionValid()
├── Check: now - lastActivity < 12h (inactivity)
├── Check: now - sessionStart < 12h (max duration)
└── If invalid → signOut()

recordActivity()
└── Update lastActivity on user interaction

Token refresh:
└── Every 50min → Firebase getIdToken(forceRefresh: true)
```

### Session Storage Keys

| Key | Storage | Content |
|-----|---------|---------|
| `amble_session` | sessionStorage | Base64-encoded session object |
| `amble_session_expiry` | localStorage | Unix timestamp |
| `amble_last_activity` | localStorage | Unix timestamp |
| `amble_user_cache` | localStorage (via clientCache) | Cached user profile (30min TTL) |

---

## User Model

### Firestore Schema: `users/{email}`

```typescript
{
  uid: string;                    // Firebase Auth UID
  email: string;                  // Primary key
  displayName: string;
  photoURL?: string;
  role: 'admin' | 'user';
  createdAt: Timestamp;
  lastLogin: Timestamp;
  lastActive: Timestamp;
  
  permissions: {
    accessAmble: boolean;         // Can use Amble AI chat
    accessBilling: boolean;       // Can use Billing CX
    accessKnowledge: boolean;     // Can view Knowledge Base
    accessPharmacy: boolean;      // Can view Pharmacy view
  };
  
  capabilities: {
    dictation: boolean;           // Can use voice dictation
    enableStudio: boolean;        // Can access Media Studio
    realtimeVoice: boolean;       // Real-time voice features
    audioIn: boolean;             // Audio input
    webBrowse: boolean;           // Web browsing tool
    fileSearch: boolean;          // File search tool
    codeInterpreter: boolean;     // Code interpreter
    imageGen: boolean;            // Image generation
    jsonSchema: boolean;          // Structured output
    videoIn: boolean;             // Video input
  };
  
  aiConfig?: {
    model?: string;               // Preferred model
    temperature?: number;
    maxTokens?: number;
  };
}
```

### Pre-Registration Flow

```
Admin action: AuthService.preRegisterUser(email, role, permissions, capabilities)
    │
    ├── Creates Firestore doc at users/{email} with status: 'pre-registered'
    │
    ▼
User signs in with Google (matching email)
    │
    ├── AuthService.signInWithGoogle()
    ├── Check: Firestore users/{email} exists?
    │   ├── YES (pre-registered) → Link UID, set status 'active', proceed
    │   └── NO → Reject with "not pre-registered" error
    └── Store Google OAuth credentials, trigger KB sync
```

---

## Permissions Model

### View-Level Gating

| Permission | Gates |
|-----------|-------|
| `accessAmble` | "Amble AI" nav item + ChatInterface view |
| `accessBilling` | "Billing CX" nav item + BillingView |
| `accessKnowledge` | "Knowledge Base" nav item + KnowledgeBaseView |
| `accessPharmacy` | "Pharmacies" nav item + PharmacyView |

### Capability-Level Gating

| Capability | Gates |
|-----------|-------|
| `enableStudio` | "Media Studio" nav item (shows "Beta" badge) |
| `dictation` | Voice dictation buttons in Composer + BillingView |
| `webBrowse` | Enables web search tool in chat |

### Admin-Only Features

| Feature | Check |
|---------|-------|
| User Management modal | `user.role === 'admin'` |
| KB Admin panel | `user.role === 'admin'` |
| Pre-register users | `user.role === 'admin'` |
| Edit permissions/capabilities | `user.role === 'admin'` |
| News post CRUD | `user.role === 'admin'` (enforced by Firestore rules) |

---

## Firestore Security Rules (Auth-Related)

```javascript
// users collection
match /users/{email} {
  allow read: if request.auth != null;           // Any authenticated user
  allow write: if request.auth != null && isAdmin(); // Admin only
}

match /users_by_uid/{uid} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if request.auth != null;
}

// isAdmin helper
function isAdmin() {
  return get(/databases/$(database)/documents/users_by_uid/$(request.auth.uid))
    .data.role == 'admin';
}

// chats — owner-scoped
match /chats/{chatId} {
  allow read, write: if request.auth != null 
    && resource.data.ownerId == request.auth.uid;
  allow create: if request.auth != null;
}
```

---

## Google Drive Token Management

### Token Storage: `google_drive_tokens/{userId}`

```typescript
{
  accessToken: string;            // OAuth access token
  refreshToken: string;           // OAuth refresh token
  expiresAt: Timestamp;           // Token expiry
  email: string;                  // Google account email
}
```

### Token Refresh Flow

```
getDriveAccessToken(userId) — in DriveSearchService
    │
    ├── Read token doc from Firestore
    ├── Check: expiresAt > now?
    │   ├── YES → return accessToken
    │   └── NO → POST to Google OAuth refresh endpoint
    │         → Update Firestore with new token + expiry
    │         → Return new accessToken
    └── Error → return null (UI shows "reconnect Drive" prompt)
```

---

## API Authentication

### Server-Side (Functions + Next.js API routes)

| Route | Auth Method | Enforcement |
|-------|------------|-------------|
| `POST /api/chat` | None explicit | Rate limiting only |
| `POST /api/knowledge/search` | Bearer token (Firebase ID token) | Token verified, userId extracted |
| `POST /api/knowledge/drive-sync` | Bearer token + accessToken in body | Both required |
| `POST /api/gallery` | userId in query/body | Honor system (no server verification) |
| `POST /api/admin/*` | None | **Security gap** — admin routes lack auth |

### Security Observations

1. **Most API routes lack server-side auth verification.** The chat route accepts a `userId` in the body without verifying it matches the authenticated user.
2. **Admin routes in functions/index.js have no authentication.** Anyone who can reach `/api/admin/fix-duplicates` or `/api/admin/restore-users` can execute them.
3. **Rate limiting** is in-memory (per function instance) and resets on cold start.
4. **Firestore rules** provide the primary security layer for data access.
