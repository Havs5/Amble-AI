# Amble AI — Source of Truth (SOT)

> **Last updated:** 2026-06-14
> **Companion doc:** [ARCHITECTURE.md](./ARCHITECTURE.md) — how the system is built (with flowcharts).
> **Status:** This is the **living** record for Amble AI. Every feature, upgrade, decision, and deployment is tracked here from idea → plan → build → ship. If it isn't in this file, it isn't "done."

---

## 0. How to Use This Document

This doc is the single place we look to answer: *what does the app do, what changed, what's next, and how do we ship it safely?*

**The lifecycle for any change** (use the template in [§9](#9-feature-workflow-template)):

```
IDEA  →  PLAN  →  BUILD  →  TEST  →  DEPLOY  →  RECORD
 │        │        │         │         │          │
 │        │        │         │         │          └─ Move entry to "Changelog" (§7) + update Feature Inventory (§5)
 │        │        │         │         └─ npm run deploy → verify on amble-ai.web.app → note deploy in §7
 │        │        │         └─ npm test + manual smoke test of the surface touched
 │        │        └─ Implement on a branch; keep ARCHITECTURE.md in sync if data/flow changes
 │        └─ Add a row to "Active Work / Roadmap" (§6) with scope, files, acceptance criteria
 └─ Capture in "Backlog / Ideas" (§6)
```

**Rules of thumb**
- One source of truth for *project identity*: [§2](#2-project-identity--the-revert). Never hardcode a project ID anywhere else.
- Anything blocked or half-done goes in [§8 Open Items](#8-open-items--next-session) so the next session can resume with zero context loss.
- When you ship, write the changelog entry **in the same commit**.

---

## 1. Snapshot

| | |
|---|---|
| **Product** | Multi-modal AI assistant for healthcare/pharmacy ops (chat, billing CX, knowledge base, media studio, news) |
| **Live URL** | https://amble-ai.web.app |
| **Stack** | Next.js 15 (SSR) · React 18 · TS 5 · Tailwind v4 · Firebase (Hosting/Functions v2/Firestore/Auth/Storage) |
| **AI** | OpenAI GPT-5 family + o3/o4 · Google Gemini 3/2.5 · DALL·E/Imagen · Sora/Veo · Whisper/TTS |
| **Repo** | local `main` → GitHub `Havs5/Amble-AI` |
| **Deploy** | `npm run deploy` (build → copy into functions → `firebase deploy`); **manual, no CI** |
| **Source size** | 172 TS/TSX files · 52 components · ~15 hooks · ~33 services · 20 Next API routes · 14 Functions routes · 15+ Firestore collections |

---

## 2. Project Identity & The Revert

> **This is the canonical project configuration. Everything must point here.**

| Key | Value |
|-----|-------|
| Firebase project ID | `amble-ai` |
| Project number / messagingSenderId | `1064927104823` |
| Web App ID | `1:1064927104823:web:d022bcd94711d81e13d4b2` |
| API key (web) | `AIzaSyCE6yAJFSRAbBGavXcEcm7iC9SREL7dTuY` |
| Auth domain | `amble-ai.firebaseapp.com` |
| Storage bucket | `amble-ai.firebasestorage.app` |
| Measurement ID | `G-4ZQX74W0SX` |
| Hosting site | `amble-ai` → https://amble-ai.web.app |
| SSR function | `ssrambleai` (deployed, us-central1, Node 22) |
| GCP owner account | `hectorv@joinamble.com` |
| KB service account | `amble-kb-sync@amble-ai.iam.gserviceaccount.com` |

### What happened (the migration we are reverting)

On **2026-05-25** the project was migrated off `amble-ai` to a *different Google account's* project. Three commits did this (they are the only commits ahead of `origin/main`, which still sits on the clean amble-ai state at `48408b3`):

| Commit | Change |
|--------|--------|
| `c2bb5ff` | migrate project `amble-ai` → `rotceh-bc5fe` |
| `fdc0b20` | correct Firebase project to `rotceh-2` (was rotceh-bc5fe) |
| `945bd76` | update Google OAuth to `rotceh-2` client credentials (in `.env.local` only) |

The current Firebase CLI login (`hectorv@joinamble.com`) **owns `amble-ai` and cannot even see `rotceh-2`** — confirming amble-ai is the home project and rotceh-2 was the stray account.

### Revert checklist (rotceh-2 → amble-ai)

| File | Change | Status |
|------|--------|--------|
| `.firebaserc` | default `rotceh-2` → `amble-ai` | ✅ done |
| `.env.local` (Firebase block) | all `NEXT_PUBLIC_FIREBASE_*` → amble-ai values (§2 table) | ✅ done |
| `.env.local` (Google OAuth block) | client ID + secret → **amble-ai's** (see Open Items) | ⚠️ blocked — annotated w/ TODO |
| `functions/index.js` | reset-password email link `rotceh-2.web.app` → `amble-ai.web.app` | ✅ done |
| `functions/package.json` | name `rotceh-functions` → `amble-ai-functions`; desc "Rotceh AI" → "Amble AI" | ✅ done |
| `package.json` | name `rotceh-ai` → `amble-ai` | ✅ done |
| `scripts/seed_news.js` | `firebase use rotceh-2` + `projectId:'rotceh-2'` → `amble-ai` | ✅ done |
| `src/app/api/upload/route.ts` | default bucket `rotceh-2.firebasestorage.app` → `amble-ai.firebasestorage.app` | ✅ done |
| Firebase CLI | `firebase use amble-ai` | ✅ done |
| Deploy | `npm run deploy` to amble-ai (after OAuth resolved) | ☐ pending OAuth + your go-ahead |

> ⚠️ **The one gap:** commit `945bd76` changed the Google OAuth client ID + secret **only in `.env.local`** (gitignored), so the *original amble-ai OAuth credentials are not recoverable from git*. To finish the revert you must paste amble-ai's **OAuth 2.0 Web Client ID + secret** (Google Cloud Console → amble-ai → APIs & Services → Credentials), and ensure its **Authorized redirect URI** includes `https://amble-ai.web.app/api/auth/google/callback`. Without this, Google sign-in + Drive KB sync stay broken. See [§8](#8-open-items--next-session).

---

## 3. Surfaces & Permissions

The single React shell (`app/page.tsx` → `FeatureRouter`) switches between surfaces; each is gated.

| Surface | Permission / capability | Entry component |
|---------|------------------------|-----------------|
| Dashboard + Company News | always (default) | `DashboardView` |
| Amble AI (Chat) | `accessAmble` | `chat/` + `ChatContext` |
| Billing CX | `accessBilling` | `BillingView` |
| Knowledge Base | `accessKnowledge` | `KnowledgeBaseView` |
| Pharmacies | `accessPharmacy` | `PharmacyView` |
| Media Studio | `enableStudio` (capability) | `studio/` + `veo/` |
| Admin tools (user mgmt, news CRUD, KB admin) | `role === 'admin'` | `modals/`, `admin/`, `news/PostEditor` |

---

## 4. Environment & Secrets Reference

`.env.local` (local) and Cloud Function secrets (prod). Deploy script strips the secret keys from `functions/.env` because they're provided via Firebase secrets.

| Variable | Used for | Where |
|----------|----------|-------|
| `NEXT_PUBLIC_FIREBASE_*` | Client Firebase SDK | `.env.local` (→ amble-ai, see §2) |
| `OPENAI_API_KEY` | Chat, embeddings, image/video/audio | secret + `.env.local` |
| `GEMINI_API_KEY` / `NEXT_PUBLIC_GEMINI_API_KEY` | Gemini chat/vision/video | secret + `.env.local` |
| `TAVILY_API_KEY` | Web search/extract fallback | secret |
| `GOOGLE_SEARCH_API_KEY` / `GOOGLE_SEARCH_CX` | Google Custom Search | secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth (login + Drive) | `.env.local` ⚠️ needs amble-ai values |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Drive KB sync (service account) | `.env.local` — already `amble-ai` ✅ |
| `*_GOOGLE_DRIVE_ROOT_FOLDER_ID` | KB root folder | `.env.local` |
| `KB_*` | KB sync/relevance/vision tuning | `.env.local` |
| `WEB_SEARCH_PROVIDER` | `google` \| `tavily` | `.env.local` |

> 🔒 **Hygiene:** real API keys currently live in `.env.local` (gitignored — good) and the KB service-account key file `amble-kb-sync-key.json` (gitignored). Do not commit either. Consider rotating any key that ever touched a commit.

---

## 5. Feature Inventory (Shipped)

Legend: ✅ live · 🧪 beta/partial · 🧟 legacy/redundant (works, slated for consolidation)

### Chat — "Amble AI"
- ✅ Streaming multi-model chat (SSE) with "thinking" trace panel
- ✅ **MagicRouter** auto model selection by complexity tier + cost-first Google default w/ OpenAI fallback
- ✅ Manual model + reasoning selection (`useModelSelection`)
- ✅ 4-source context retrieval (memory · project RAG · vector KB · legacy KB) + Drive fallback
- ✅ Web search (Google CSE → Tavily) gated by `webBrowse`
- ✅ Tools (`get_patient_details`, `search_billing_codes`) + agentic tool loop (max 5 turns)
- 🧪 Multi-agent mode (Planner → Researcher; Coder is a placeholder)
- ✅ Artifacts: code blocks parsed into artifact objects
- ✅ Projects in sidebar (group chats by `projectId`)
- ✅ Auto-title new chats; right-click + inline rename/delete
- ✅ Voice dictation (`useStandardDictation` / `useAiDictation`)
- ✅ Memory extraction (fire-and-forget, gpt-4o-mini → `users/{id}/memories`)
- ✅ Semantic response cache (Jaccard dedupe)
- ✅ Embeddable chat widget (`app/embed`)

### Billing CX
- ✅ Policy-driven reply drafting from `cxConfig` (`useAmbleConfig`)
- ✅ **Triple policy injection** (system top + bottom + user message) for compliance
- ✅ Rewrite: Make Shorter / Make Firmer (via `/api/chat`, `stream:false`)
- ✅ Optional PII redaction (SSN/phone/email/dates/cards)
- ✅ Export: copy + PDF (`@react-pdf/renderer`)

### Knowledge Base
- ✅ Google Drive → Firestore sync (service account + per-user OAuth)
- ✅ Document processing: PDF/DOCX/XLSX/Google Docs + **image analysis via GPT-4o vision**
- ✅ Auto-classification (dept/pharmacy/product/category) + heading-aware chunking
- ✅ Hybrid retrieval (vector RRF + keyword), embeddings `text-embedding-3-small`
- ✅ KB views: status, documents, drive-list, debug
- 🧟 Three overlapping server RAG systems still active (consolidation pending)

### Media Studio
- ✅ Image generation: DALL·E 3 / Imagen 3 → Storage + `generated_assets`
- ✅ Video generation: Sora / Veo (poll → Storage)
- ✅ Gallery (list/delete, ownership-checked)
- ✅ Video analysis (`/api/video/analyze`, Gemini)

### Dashboard & Company News
- ✅ Editorial/magazine news layout + top-3 featured banner
- ✅ Slide-in `PostEditor` (admin CRUD), drafts section
- ✅ Pinned + critical posts, visibility scoping (dept/role), expiry
- ✅ News audit trail (`news_audit`)
- ✅ Image uploads via server-side GCS route (`/api/upload`)
- ✅ Usage dashboard (token/cost from `usage_logs`)

### Auth & Admin
- ✅ Email/Password + Google OAuth (Drive scope) login
- ✅ Pre-registration gate (Google sign-in requires existing `users/{email}`)
- ✅ Session mgmt: 12h inactivity/max, token refresh /50min, validate /5min, persist across refresh, force logout on tab close
- ✅ User management modal: permissions + capabilities editing
- ✅ Admin password reset with branded email notification
- ✅ Permission/capability gating across UI + Firestore rules

### Pharmacy
- ✅ `PharmacyView` (pharmacy directory surface)

---

## 6. Roadmap / Backlog

### Active work
| Item | Scope | Acceptance | Status |
|------|-------|-----------|--------|
| **Revert to amble-ai** | §2 checklist | App builds + signs in + deploys on amble-ai | 🔧 in progress (OAuth blocked) |

### Near-term (tech debt — from prior audits, still open)
- [ ] **Consolidate system prompt** — `lib/systemPrompt.ts` vs inline `ENHANCED_SYSTEM_PROMPT` in `route.ts` (drift risk).
- [ ] **De-duplicate API routes** — 10 routes exist in both `functions/src/routes/` and `src/app/api/`; Functions wins in prod. Pick one source of truth per route.
- [ ] **Add auth to admin endpoints** — `/api/admin/fix-duplicates`, `/api/admin/restore-users` have no auth; verify Firebase ID token server-side on sensitive routes.
- [ ] **Prune `functions/package.json`** — drop client-only deps (lucide-react, markdown-it) from the SSR bundle.

### Strategic
- [ ] **Unify RAG** — collapse `RAGService` (legacy project RAG) + `KnowledgeContextService` (folder map) into the vector `RAGPipeline`; reduces per-request latency + cost.
- [ ] **Finish CoderAgent** — currently a Phase-3 placeholder with no tools.
- [ ] **CI/CD** — GitHub Actions: build + test + deploy on push to `main` (no pipeline today).
- [ ] **Post-deploy health checks + rollback automation.**

### Ideas / parking lot
- [ ] Wire `web_extract` agent tool (available, unused).
- [ ] Real-time voice (capability flag `realtimeVoice` exists, unimplemented).
- [ ] Per-instance rate limiting → shared (Firestore/Redis) so limits survive cold starts.
- [ ] OpenTelemetry tracing actually wired to a backend.

---

## 7. Changelog

> Newest first. Record **every** shipped change here, with date + what/why. Deploys to amble-ai.web.app should be noted.

### 2026-06-14 — Docs consolidation + project revert (in progress)
- Consolidated `docs/` down to **two** living docs: `ARCHITECTURE.md` (with Mermaid flowcharts) + this `SOURCE_OF_TRUTH.md`. Deleted the legacy 00–09 + CHANGELOG split docs (content folded in here).
- Full re-analysis of the codebase; verified architecture unchanged since the March audit (the May commits only swapped project IDs).
- **Began reverting** the rotceh-2 migration back to `amble-ai` (see §2). OAuth credential restore outstanding.

### 2026-05-25 — ⚠️ Project migration to rotceh-2 (being reverted)
- `c2bb5ff` migrate amble-ai → rotceh-bc5fe; `fdc0b20` correct to rotceh-2; `945bd76` OAuth → rotceh-2. Re-added `storage.rules` to `firebase.json`. **These are the changes §2 reverses.**

### 2026-03-24 — CX policy fix + cleanup
- Triple-injection policy enforcement; fixed broken `handleRewrite` (was hitting non-existent `/api/rewrite`, now `/api/chat`); removed ~40 debug `console.log`s; deleted stale deploy artifacts; docs refresh. Deployed.

### 2026-03 — Product + UX wave
- Project system in sidebar; auto-title chats + right-click/inline rename/delete.
- Logo rebrand iterations (dark circle + lowercase "a").
- Auth: persist session across refresh; force logout on tab close.
- News: editorial/magazine redesign, top-3 featured banner, slide-in PostEditor, drafts, show-all-posts fixes, server-side GCS image upload.
- Admin: password reset with email; user management + usage report fixes (auth race, `usage_logs` rules, `updateUserConfig`).
- Firestore: projects collection rules; removed unnecessary indexes.

### 2026-03-03 — Architecture audit + Phase 1 cleanup
- Deleted 22 dead hook files (~4,100 LOC); cleaned barrel exports; expanded `.gitignore`; added the original 12-doc set (now superseded by this consolidation). Build verified clean.

---

## 8. Open Items / Next Session

> Resume here with zero context loss.

1. **🔑 Restore amble-ai Google OAuth credentials (BLOCKER for full revert).**
   - Get the **OAuth 2.0 Web Client ID + secret** from Google Cloud Console → project `amble-ai` → APIs & Services → Credentials.
   - Put them in `.env.local` as `NEXT_PUBLIC_GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`.
   - In that OAuth client, ensure **Authorized JavaScript origins** include `https://amble-ai.web.app` (+ `https://amble-ai.firebaseapp.com`) and **Authorized redirect URIs** include `https://amble-ai.web.app/api/auth/google/callback`.
   - In Firebase Auth → Sign-in method, confirm **Google** + **Email/Password** providers are enabled on amble-ai, and `amble-ai.web.app` / `amble-ai.firebaseapp.com` are in **Authorized domains**.

2. **Verify amble-ai data parity.** Confirm Firestore (users, chats, kb_*, news_posts), Storage, and Auth users exist on amble-ai as expected. If anything important was created only on rotceh-2 during the migration window, decide whether to migrate it (note: current login cannot access rotceh-2).

3. **Confirm Cloud Function secrets on amble-ai** (`OPENAI_API_KEY`, `GEMINI_API_KEY`, `TAVILY_API_KEY`, `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX`) before deploying.

4. **First clean deploy to amble-ai** — `firebase use amble-ai` → `npm run deploy` → smoke test login + chat + a KB query on https://amble-ai.web.app.

5. **Then tackle the near-term tech debt** in §6 (system-prompt consolidation, route de-dup, admin auth).

---

## 9. Feature Workflow Template

Copy this block into §6 (and later §7) for each new feature/upgrade.

```markdown
### <Feature name>
- **Why:** <problem / goal>
- **Surface(s):** chat | billing | kb | studio | news | auth | infra
- **Plan:** <approach in 2–4 bullets; note any data-model or flow change → update ARCHITECTURE.md>
- **Files:** <key files to touch>
- **Acceptance criteria:** <observable, testable outcomes>
- **Tests:** <unit/integration + manual smoke steps>
- **Risk / rollback:** <what could break; how to revert>
- **Deploy:** branch → npm test → npm run deploy → verify on amble-ai.web.app
- **Status:** idea | planned | building | testing | shipped (date)
```

**Definition of done:** code merged · tests pass · deployed to amble-ai.web.app · Feature Inventory (§5) updated · Changelog (§7) entry written · any architecture/data-flow change reflected in ARCHITECTURE.md.
