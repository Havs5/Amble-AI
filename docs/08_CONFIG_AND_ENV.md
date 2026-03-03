# 08 — Config & Environment

> **Last updated:** 2025-07-15  
> **Scope:** Environment variables, Firebase config, feature flags, build config

---

## Environment Variables

### Required Secrets (Cloud Functions — via `defineSecret`)

| Variable | Purpose | Used By |
|----------|---------|---------|
| `OPENAI_API_KEY` | OpenAI API access (chat, embeddings, images, video, audio) | route.ts, Functions routes, EmbeddingService, MemoryService, RAGService |
| `GEMINI_API_KEY` | Google Gemini API access (chat, vision, video) | route.ts, Functions routes, knowledgeContext |
| `TAVILY_API_KEY` | Tavily web search + extraction | Functions searchService |
| `GOOGLE_SEARCH_API_KEY` | Google Custom Search API | Functions searchService |
| `GOOGLE_SEARCH_CX` | Google Custom Search engine ID | Functions searchService |

### Firebase Config (Client-side — `NEXT_PUBLIC_*`)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase project API key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Auth domain |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Project ID (`amble-ai`) |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase App ID |
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics measurement ID |

### Other Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `KB_DRIVE_FOLDER_ID` | Google Drive root folder ID for KB sync | Hardcoded fallback in `lib/constants.ts` |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Base64-encoded service account JSON for Drive access | Used by driveSearchService |
| `SERPER_API_KEY` | Serper.dev search API (used by RAGPipeline) | Optional |
| `SKIP_NEXT_BUILD` | Skip Next.js build in deploy script if `BUILD_ID` exists | `undefined` |

### Deployment Secret Filtering

The deploy script (`scripts/deploy_ssr.js`) copies `.env.local` to `functions/.env` but **filters out** these keys (they're provided via Cloud Functions secrets):
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- `TAVILY_API_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `GOOGLE_SEARCH_API_KEY`
- `GOOGLE_SEARCH_CX`

---

## Firebase Configuration

### `firebase.json`

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "functions": {
    "source": "functions"
  },
  "hosting": {
    "public": "public",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "function": "ssrambleai" }
    ]
  }
}
```

**Key points:**
- Single catch-all rewrite: all traffic → `ssrambleai` Cloud Function
- Static files in `public/` served directly by CDN (before rewrite)
- `public/_next/static/` deployed for client-side JS/CSS

### Cloud Function: `ssrambleai`

| Setting | Value |
|---------|-------|
| Region | `us-central1` |
| Memory | `2GiB` |
| Timeout | `540s` (9 minutes) |
| Runtime | Node 22 |
| Concurrency | Default (80) |
| Secrets | 5 (OPENAI, GEMINI, TAVILY, GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_CX) |

---

## Next.js Configuration

### `next.config.js`

```javascript
{
  experimental: {
    serverActions: { bodySizeLimit: '10mb' },
    optimizePackageImports: [
      'lucide-react', 'framer-motion', '@google/generative-ai',
      'openai', 'firebase', 'markdown-it'
    ]
  },
  compiler: {
    // Remove console.log in production
    removeConsole: process.env.NODE_ENV === 'production'
      ? { exclude: ['error', 'warn'] }
      : false
  },
  headers: async () => [{
    source: '/(.*)',
    headers: [{
      key: 'Cross-Origin-Opener-Policy',
      value: 'unsafe-none'  // Required for Google OAuth popup
    }]
  }],
  cacheHandler: undefined,
  distDir: '.next',
  output: undefined  // Not `standalone` — uses default SSR
}
```

**Bundle analyzer:** Available when `ANALYZE=true` env var is set (via `@next/bundle-analyzer`).

---

## TypeScript Configuration

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "strict": true,
    "noEmit": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules", "functions"]
}
```

---

## Jest Configuration

### `jest.config.js`

```javascript
{
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', 'Executor.test.ts'],
  coverageThreshold: {
    global: { branches: 50, functions: 50, lines: 50, statements: 50 }
  },
  // BUG: typo — should be "setupFilesAfterSetup"
  setupFilesAfterEnup: ['<rootDir>/jest.setup.js']
}
```

**Known issue:** The `setupFilesAfterEnup` key is a typo. Should be `setupFilesAfterSetup`. This means `jest.setup.js` may not be loaded, and Firebase/localStorage mocks may not be active during tests.

### `jest.setup.js` (may not load due to typo)
- Mocks: `firebase/app`, `firebase/auth`, `firebase/firestore`, `localStorage`
- Polyfills: `TextEncoder`, `TextDecoder`, `ReadableStream`, `WritableStream`, `TransformStream`

---

## PostCSS Configuration

### `postcss.config.mjs`

```javascript
export default {
  plugins: {
    '@tailwindcss/postcss': {}
  }
}
```

Tailwind CSS v4 with PostCSS plugin (no separate `tailwind.config.js` — configuration via CSS).

---

## `.gitignore`

**Current contents (MINIMAL):**
```
amble-kb-sync-key.json
```

**Missing recommended entries:**
```
node_modules/
.next/
functions/.next/
functions/node_modules/
functions/public/
functions/.env
public/_next/
.env.local
.env
*.log
.DS_Store
```

**Risk:** Build artifacts, secrets, and large directories may be accidentally committed.

---

## Firestore Indexes

### `firestore.indexes.json` — 8 indexes

| Collection | Fields | Type |
|-----------|--------|------|
| `knowledge` | `__vector__` (1536-dim) | Vector (COSINE) |
| `knowledge_vectors` | `__vector__` (1536-dim) | Vector (COSINE) |
| `knowledge` | `projectId` ASC + `updatedAt` DESC | Composite |
| `generated_assets` | `userId` ASC + `createdAt` DESC | Composite |
| `chats` | `ownerId` ASC + `updatedAt` DESC | Composite |
| `chats` | `projectId` ASC + `updatedAt` DESC | Composite |
| `kb_articles` | `status` ASC + `publishedAt` DESC | Composite |
| `news_posts` | `status` ASC + `publishedAt` DESC | Composite |
| `news_posts` | `status` ASC + `pinned` DESC + `publishedAt` DESC | Composite |

---

## Firestore Security Rules Summary

### `firestore.rules`

| Collection | Read | Write | Notes |
|-----------|------|-------|-------|
| `users` | Authenticated | Admin only | Via `isAdmin()` helper |
| `users_by_uid` | Owner (uid match) | Authenticated | |
| `chats` | Owner (ownerId match) | Owner + create | |
| `knowledge` | Authenticated | Authenticated | Open to all auth users |
| `knowledge_vectors` | Authenticated | Authenticated | Open to all auth users |
| `kb_articles` | Authenticated | Admin only | |
| `generated_assets` | Authenticated | Authenticated | No ownership check on read |
| `news_posts` | Authenticated | Admin only | |
| `news_audit` | Admin only | Admin only | |

---

## Feature Flags (Unused System)

**File:** `hooks/useFeatureFlags.tsx` — **DEAD CODE** (never mounted)

Defines a feature flag system with:
```typescript
DEFAULT_FLAGS = {
  newChat: true,
  darkMode: true,
  voiceInput: true,
  multiModal: false,
  advancedSearch: false,
  collaboration: false,
  plugins: false,
  ai_agents: false,
  studio: false,
  pharmacy: false,
  billing: false,
  knowledge_base: false
}
```

**Note:** Feature gating is currently done via user permissions and capabilities in Firestore, not via this flag system.

---

## Package.json Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `dev` | `next dev` | Local development server |
| `build` | `next build` | Production build |
| `start` | `next start` | Production server (local) |
| `lint` | `next lint` | ESLint |
| `deploy` | `node scripts/deploy_ssr.js` | Full SSR deploy pipeline |
| `test` | `jest` | Run tests |
| `test:watch` | `jest --watch` | Watch mode tests |
| `test:coverage` | `jest --coverage` | Coverage report |
| `analyze` | `ANALYZE=true next build` | Bundle analysis |
