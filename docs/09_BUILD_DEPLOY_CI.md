# 09 — Build & Deploy

> **Last updated:** 2025-07-15  
> **Scope:** Build pipeline, SSR deployment, scripts, hosting architecture

---

## Deployment Architecture

```
┌────────────────────── Developer Machine ──────────────────────┐
│                                                                │
│  npm run deploy  →  scripts/deploy_ssr.js                     │
│                                                                │
│  Step 1: Clean public/_next (remove stale static assets)      │
│  Step 2: next build (with retry on failure)                   │
│  Step 3: Copy .next/ → functions/.next/ (SSR runtime)         │
│  Step 4: Copy public/ → functions/public/ (static assets)     │
│  Step 5: Copy next.config.js → functions/next.config.js       │
│  Step 6: Filter .env.local → functions/.env (strip secrets)   │
│  Step 7: Copy .next/static/ → public/_next/static/ (CDN)     │
│  Step 8: Print "firebase deploy --only functions,hosting"     │
│                                                                │
│  Then manually: firebase deploy --only functions,hosting       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────── Firebase ───────────────────────────────┐
│                                                                │
│  Hosting:                                                      │
│  ├── public/_next/static/* → CDN (JS/CSS bundles)             │
│  └── ** → ssrambleai Cloud Function                           │
│                                                                │
│  Cloud Function: ssrambleai                                    │
│  ├── functions/index.js (entry)                               │
│  ├── functions/.next/ (SSR runtime)                           │
│  ├── functions/public/ (static fallback)                      │
│  ├── functions/next.config.js                                 │
│  ├── functions/.env (non-secret env vars)                     │
│  └── functions/node_modules/ (dependencies)                   │
│                                                                │
│  Secrets (Cloud Functions):                                    │
│  ├── OPENAI_API_KEY                                           │
│  ├── GEMINI_API_KEY                                           │
│  ├── TAVILY_API_KEY                                           │
│  ├── GOOGLE_SEARCH_API_KEY                                    │
│  └── GOOGLE_SEARCH_CX                                        │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Deploy Script Details

### `scripts/deploy_ssr.js`

**Full pipeline:**

1. **Clean** `public/_next` if it exists (prevents build conflicts from stale static files)

2. **Build** Next.js: `npm run build`
   - If build fails: clean `.next/` + `public/_next/`, retry once
   - Supports `SKIP_NEXT_BUILD=1` to skip if `.next/BUILD_ID` already exists

3. **Copy `.next/`** → `functions/.next/`
   - Recursive copy of the entire SSR build output
   - This is what Next.js uses to serve pages at runtime

4. **Copy `public/`** → `functions/public/`
   - Static assets needed by SSR (favicons, manifests, etc.)

5. **Copy `next.config.js`** → `functions/next.config.js`
   - Function needs the same config as the build

6. **Filter `.env` + `.env.local`** → `functions/.env`
   - Strips conflicting secrets that are provided via Cloud Functions secret manager:
     - `OPENAI_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`
     - `NEXT_PUBLIC_FIREBASE_API_KEY`
     - `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`

7. **Copy `.next/static/`** → `public/_next/static/`
   - These files are served directly by Firebase Hosting CDN
   - Bypasses the Cloud Function for better performance

8. **Print deploy command:**
   ```
   firebase deploy --only functions,hosting
   ```
   (Manual step — the script does NOT auto-deploy)

---

## Build Configuration

### Next.js Build

| Setting | Value | Purpose |
|---------|-------|---------|
| `output` | default (not `standalone`) | Standard SSR output |
| `distDir` | `.next` | Build output directory |
| `removeConsole` | `{ exclude: ['error', 'warn'] }` (prod only) | Strip console.log from production |
| `optimizePackageImports` | lucide-react, framer-motion, @google/generative-ai, openai, firebase, markdown-it | Tree-shake large packages |
| `serverActions.bodySizeLimit` | `10mb` | Support large file uploads |

### Functions Runtime

| Setting | Value |
|---------|-------|
| Node.js version | 22 |
| Region | us-central1 |
| Memory | 2 GiB |
| Timeout | 540 seconds (9 minutes) |
| Concurrency | Default (~80) |

---

## Scripts Inventory

### `scripts/deploy_ssr.js` — Deployment Pipeline
- **Purpose:** Build + prepare files for Firebase deployment
- **Invoked by:** `npm run deploy`
- **Duration:** ~2-5 minutes (mostly Next.js build time)
- **Idempotent:** Yes (cleans before copying)

### `scripts/clean_public_next.js` — Build Cleanup
- **Purpose:** Remove `public/_next` directory
- **Invoked by:** Deploy script (step 1), or manually
- **Duration:** <1 second
- **Safety:** Only deletes `public/_next`, nothing else

### `scripts/seed_news.js` — Data Seeding
- **Purpose:** Seed 6 sample `news_posts` documents into Firestore
- **Invoked by:** Manual (`node scripts/seed_news.js`)
- **Idempotent:** No (creates new docs each run)
- **Posts seeded:**
  1. Scheduled Maintenance (CRITICAL, pinned)
  2. New Knowledge Base Features (pinned)
  3. Updated Billing Response Policy (dept-only visibility)
  4. Welcome to Company News
  5. AI Model Upgrade: GPT-5 & Gemini 3
  6. Team Wellness Day (HR, with expiry)

---

## Hosting Architecture

### Request Flow

```
Client Request
    │
    ▼
Firebase Hosting CDN
    │
    ├── Match: public/_next/static/* → Serve from CDN (no function call)
    ├── Match: public/* → Serve static file
    └── No match → Rewrite to ssrambleai Cloud Function
                    │
                    ├── Match ROUTES[] → Functions handler
                    ├── Match admin routes → Inline handler
                    └── No match → Next.js SSR handler
                                  ├── React page render
                                  └── Next.js API route
```

### Cache Headers (from next.config.js)

| Resource | Cache |
|----------|-------|
| `/_next/static/*` | `public, immutable, max-age=31536000` (1 year) |
| Other static | Default Firebase Hosting cache |
| API routes | No cache (dynamic) |
| SSR pages | No cache (dynamic) |

---

## Dependencies Overview

### Main App (`package.json`) — 28 dependencies

| Category | Packages |
|----------|----------|
| **Framework** | next, react, react-dom |
| **AI/ML** | openai, @google/generative-ai, @google/genai |
| **Firebase** | firebase, firebase-admin |
| **UI** | lucide-react, framer-motion, tailwindcss, @tailwindcss/typography |
| **Content** | markdown-it, @react-pdf/renderer, mermaid |
| **Auth** | googleapis, google-auth-library |
| **Utils** | zod, jszip, pdf-parse, highlight.js |
| **Media** | recorder-rtc (audio recording) |

### Dev Dependencies — 14 packages

| Category | Packages |
|----------|----------|
| **Testing** | jest, ts-jest, @testing-library/react, @testing-library/jest-dom, jest-environment-jsdom |
| **Types** | @types/node, @types/react, @types/react-dom |
| **Build** | typescript, @next/bundle-analyzer |
| **Quality** | eslint, eslint-config-next |

### Functions (`functions/package.json`) — Notable entries

**Dependencies that may be unnecessary for SSR:**
| Package | Reason to Suspect |
|---------|------------------|
| `lucide-react` | Icon library — SSR shouldn't render icons |
| `markdown-it` | Markdown rendering — should be client-only |
| `framer-motion` | Animations — SSR shouldn't animate |
| `highlight.js` | Syntax highlighting — client-side feature |

These are likely included because the Functions deployment includes the full Next.js build output, and tree-shaking may not eliminate them from server bundles.

---

## CI/CD Status

**Current state:** No CI/CD pipeline detected.

- No `.github/workflows/` directory
- No `Dockerfile` or `docker-compose.yml`
- No Vercel/Netlify configuration
- Deployment is **manual** via `npm run deploy` + `firebase deploy`

### Recommended CI/CD Setup

```yaml
# .github/workflows/deploy.yml (suggested)
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm test
      - run: npm run deploy
      - run: firebase deploy --only functions,hosting
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
```

---

## Rollback Procedure

### Current (Manual)

1. Firebase Hosting: `firebase hosting:rollback` (reverts to previous deploy)
2. Cloud Functions: Redeploy from previous git commit
3. Firestore rules/indexes: `firebase deploy --only firestore`

### Limitations

- No automated rollback triggers
- No health checks post-deploy
- No blue/green deployment
- Function cold start after deploy (~5-10 seconds)
