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
| RxConnect (sidebar item, `pharmacies` view id) | `accessPharmacy` | `PharmacyView` (embeds `rxconnect.tweaking.agency`) |
| Clock In/Out (`clock` view id) | `accessClock` (default **true**); Manage tab = admin | `TimeClockView` + `TimeClockService` |
| Admin tools (user mgmt, news CRUD, KB admin) | `role === 'admin'` | `modals/`, `admin/`, `news/PostEditor` |

> **Media Studio (Amble Studio) was removed** (2026-06-14) — see Changelog. The `enableStudio` capability / `accessStudio` permission and the `veo`/`media` views are gone.

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
- ⚠️ **Prod chat retrieval is live-Drive keyword search + hand-rolled TF-IDF — NOT vector search.** The hybrid vector-RRF pipeline (`text-embedding-3-small`) exists in `src/services/knowledge/*` but the prod SSR function (`functions/src/routes/*.js`) doesn't run it. See [ARCHITECTURE §11a](./ARCHITECTURE.md).
- ✅ KB views: status, documents, drive-list, debug
- 🧟 **Three overlapping server retrieval systems** still active (live-Drive · `knowledge_vectors` findNearest · `kb_documents` in-memory cosine) — unify per **§8.5**

### Media Studio (Amble Studio) — ❌ REMOVED 2026-06-14
- **Frontend removed**: `components/studio/` (Image + Video), `components/veo/`, `lib/studio/`, the sidebar item, the `veo`/`media` views, and the `enableStudio` capability + `accessStudio` permission.
- **Backend removed** (confirmed agents won't generate images for now): Functions routes `image.js`, `video.js`, `videoAnalyze.js`, `gallery.js` + their ROUTES entries + barrel exports; the inline `/api/videos/:id/content` OpenAI video proxy; the Next.js dev routes `app/api/{image,veo,gallery}`; `AssetGallery` component; `ModelGateway.generateImage` + image types; the `apiClient.image` helper. `ModelGateway.generateText` stays (used by agents).
- **Retained:** the `generated_assets` Firestore collection (past generations) and the `usage_logs`/UsageReport categorization of historical image/video entries.
- ↩️ **If image/video generation returns, it's a dedicated project** (see Roadmap §6) — the Vertex model IDs are already probed + recorded in §8.

### Dashboard & Company News
- ✅ Editorial/magazine news layout + top-3 featured banner
- ✅ Slide-in `PostEditor` (admin CRUD), drafts section
- ✅ Pinned + critical posts, visibility scoping (dept/role), expiry
- ✅ News audit trail (`news_audit`)
- ✅ Image uploads via server-side GCS route (`/api/upload`)
- ✅ Usage dashboard (token/cost from `usage_logs`)

### Roles & Access (RBAC)
- ✅ **3-tier roles** via `lib/roles.ts` (single source of truth): **Super Admin** (`superadmin`) › **Manager** (`manager`) › **Staff** (`staff`). Backward-compatible — legacy `admin`→Super Admin, `user`→Staff (no data migration needed).
- ✅ Capability matrix `can(role, capability)`: `manageUsers` (super admin + manager), `manageManagers` (super admin only), `manageNews`, `manageTimeclock`, `manageKnowledge`, `viewReports`. Helpers: `isSuperAdmin`, `isManagerOrAbove`, `assignableRoles`, `canManageRole`.
- ✅ User Management: 3-role selector (a Manager can only assign/manage **Staff**); role badge + filter; gating routed through `can()`.
- ✅ Gating migrated to the helper: time-clock Manage tab (`manageTimeclock`), news CRUD (`manageNews`), Sidebar "Manage Users" (`manageUsers`) + role badge.
- ✅ Firestore rules mirror it: `isSuperAdmin()` / `isManagerOrAbove()`; `organizations` + `news_audit` are super-admin-only; legacy `isAdminByUid()` now = manager-or-above.
- 📌 Per-feature toggles (`accessAmble/Billing/Knowledge/Pharmacy/Clock`) are independent of role, edited per-user by `manageUsers` holders.

### Auth & Admin
- ✅ Email/Password + Google OAuth (Drive scope) login
- ✅ Pre-registration gate (Google sign-in requires existing `users/{email}`)
- ✅ Session mgmt: 12h inactivity/max, token refresh /50min, validate /5min, persist across refresh, force logout on tab close
- ✅ User management modal: permissions + capabilities editing
- ✅ Admin password reset with branded email notification
- ✅ Permission/capability gating across UI + Firestore rules

### RxConnect (formerly Pharmacy)
- ✅ Single embedded external portal — `https://rxconnect.tweaking.agency/login` in a full-height iframe (`PharmacyView`), with loading state, error fallback, refresh, and open-in-new-tab
- ✅ Session persists across tab switches via keep-alive rendering
- 🗑️ Removed the old multi-pharmacy switcher (Revive/Align), `PharmacySidebar`, and the `activePharmacy`/`mountedPharmacies` plumbing
- ⚠️ Depends on RxConnect allowing itself to be framed (no restrictive `X-Frame-Options`/CSP `frame-ancestors`); the header's "open in new tab" is the fallback if it blocks embedding

### Clock In/Out (time clock)
- ✅ **Employee punch in/out** — live clock, IN/OUT status, optional note; one open `time_entries` doc until punch-out
- ✅ **My Timecard** — weekly view (Mon–Sun), entries grouped by day with daily + week totals, week navigation, running time for open entries
- ✅ **Manager panel** (admin/superadmin) — week view of all employees grouped with totals; **adjust** clock-in/out times (datetime pickers, `edited` flag), **add** manual entries for any employee, **delete** entries; **Department filter → Employee filter** (department from the user directory; employee list scopes to the chosen dept; per-employee dept badge)
- ✅ Realtime via Firestore `onSnapshot`; secured by Firestore rules (own entries, or all for admins) + composite indexes `(userId+clockIn)`, `(userId+clockOut)`
- 📌 Possible follow-ups: CSV/payroll export, approvals, overtime rules, TIP/BON/COM amount fields (per OnTheClock reference), break tracking

### Platform
- ✅ **Keep-alive view router** — `FeatureRouter` mounts each surface once and hides inactive ones (`display:none`) instead of unmounting; instant tab switches + per-tab state persistence (scroll, open KB doc, drafts, RxConnect session)

### AI provider
- ✅ **Chat runs on Vertex AI** (`@google/genai`, ADC, **global** endpoint) with **gemini-3-flash-preview** (fast) + **gemini-3.1-pro-preview** (pro) — latest Gemini on Vertex. Preview IDs can rotate, so the prod handler **falls back to OpenAI (`gpt-5-mini`) on any Gemini error**.
- ✅ **Image on Vertex** — Imagen 4 (`imagen-4.0-generate-001`, regional us-central1) via `image.js`
- ✅ **Video-analysis on Vertex** — `videoAnalyze.js` → `gemini-2.5-flash` with the Storage video as a `gs://` URI (dropped the Developer-API file-manager upload)
- ✅ Live Studio (browser Gemini Live) **removed**
- 🔜 **Veo** video gen (`video.js`/`veo/route.ts`) + dev chat route still on the **Gemini Developer API** — Veo left working (Sora is the verified path); Vertex move documented in §8

---

## 6. Roadmap / Backlog

### Active work
| Item | Scope | Acceptance | Status |
|------|-------|-----------|--------|
| **Revert to amble-ai** | §2 checklist | App builds + signs in + deploys on amble-ai | ✅ done (login verified) |
| **Vertex AI migration** | Gemini → Vertex | Chat on Vertex (2.5 flash/pro) ✅; image/video/analyze remaining | 🔧 chat shipped — rest queued (§8) |

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

### Future projects
- [ ] **Image / Video generation (rebuild)** — removed 2026-06-14. If reintroduced, build as a dedicated surface on Vertex: Imagen `imagen-4.0-generate-001` + Veo `veo-3.0-generate-001` (regional `us-central1`), and Gemini image `gemini-3.1-flash-image` (global). Model IDs already probed (§8). Would re-add a route + a sidebar entry + the `accessStudio`-style gating.

### Ideas / parking lot
- [ ] Wire `web_extract` agent tool (available, unused).
- [ ] Real-time voice (capability flag `realtimeVoice` exists, unimplemented).
- [ ] Per-instance rate limiting → shared (Firestore/Redis) so limits survive cold starts.
- [ ] OpenTelemetry tracing actually wired to a backend.

---

## 7. Changelog

> Newest first. Record **every** shipped change here, with date + what/why. Deploys to amble-ai.web.app should be noted.

### 2026-06-14 — Time-clock department filter + KB search analysis
- **Clock In/Out → Manage:** added a **Department filter** (from the user directory) that scopes the Employee filter and shows a per-employee department badge. `DirectoryUser`/`fetchUsers()` now carry `department`; entries aren't re-stamped (reflects re-assignments instantly). Build ✅, deployed.
- **KB search analysis (no code):** documented that prod chat KB retrieval is **live-Drive keyword + TF-IDF (no vector search)** with 3 overlapping systems; wrote the unify-to-Firestore-vector + hybrid-RRF + rerank plan with phased steps, embedding/reranker options, and the owner "what to get" list. See **§8.5** + [ARCHITECTURE §11a](./ARCHITECTURE.md).
- **Embedding deep-dive + Accuracy Playbook (§8.5):** found the **Firestore 2048-dim cap**; recommended **`gemini-embedding-001` @1536 (Vertex, MTEB #1, multimodal-ready)** over `-3-small`/`-3-large`/Voyage; added the 6-layer "always grounded" playbook (recall→rerank→chunks→grounded prompt→groundedness check/abstention→RAGAS eval) — embedder is a few points; **rerank + grounding/abstention are what make it accurate every time.**

### 2026-06-14 — RBAC finalized (data migration + create-rule hardening)
- **Migrated stored roles** to canonical values (`admin`→`superadmin`, `user`→`staff`) — 2 users updated via the Firestore REST API (owner token). Added idempotent `scripts/migrate_roles.js` for any future legacy users.
- **Hardened the `users` create rule** — client create now requires `isManagerOrAbove()` and forbids a Manager minting elevated roles (legitimate creation is server-side via the Admin SDK, which bypasses rules). RBAC is now complete with no outstanding items.

### 2026-06-14 — RBAC follow-ups (edit role, rule hardening, default bundles)
- **Edit an existing user's role** in User Management (role `<select>` on the edit screen, gated by `canManageRole`; saved via a direct `users/{id}` Firestore write).
- **Firestore `users` rule refined**: Super Admin edits anyone; a Manager can only edit current-Staff and can't elevate them above Staff; a user can edit their own doc but not change their own role; delete gated the same way.
- **Role-based default permissions** — `defaultFeaturePermissions(role)` auto-fills the Add-User toggles when a role is chosen (Manager/Super Admin → KB + Pharmacy on). Build clean; deployed.
- Remaining (§8): optional stored-role data migration + tightening the `users` *create* rule.

### 2026-06-14 — RBAC redesign: Super Admin / Manager / Staff
- New 3-tier role model via **`lib/roles.ts`** (single source of truth), backward-compatible (legacy `admin`→Super Admin, `user`→Staff; no data migration needed). Capability matrix `can(role, cap)` + helpers `isSuperAdmin`/`isManagerOrAbove`/`assignableRoles`/`canManageRole`.
- User Management: 3-role selector (a Manager can only assign **Staff**), role badge + filter, all edit-gating routed through `can(...,'manageUsers')`. Migrated time-clock (`manageTimeclock`), news (`manageNews`), and Sidebar (`manageUsers` + role badge) gating to the helper. Widened `role` type fields to `string`.
- Firestore rules: `isSuperAdmin()` / `isManagerOrAbove()`; `organizations` + `news_audit` now super-admin-only; legacy `isAdminByUid()` = manager-or-above. Build clean; deployed.
- ⏭️ **Staged for next session** (§8): edit-existing-user role UI, per-target Firestore rule (Manager can't edit/elevate Managers or Super Admins), role-based default permission bundles, optional stored-role data migration.

### 2026-06-14 — Removed orphaned media backend
- Confirmed agents won't generate images for now, so removed the dead image/video backend: Functions `image.js`/`video.js`/`videoAnalyze.js`/`gallery.js` (+ ROUTES entries + barrel exports), the inline `/api/videos/:id/content` proxy, the Next.js dev routes `app/api/{image,veo,gallery}`, `AssetGallery`, `ModelGateway.generateImage` (+ image types), and the `apiClient.image` helper. Kept `ModelGateway.generateText` (agents).
- Retained `generated_assets` data + historical usage categorization. Image/video generation is now a **future project** (Roadmap §6; Vertex model IDs recorded in §8). Build clean; deployed.

### 2026-06-14 — Removed Amble Studio (Media Studio)
- Deleted the entire Media Studio surface (Image Studio + Video Generation/Veo): `components/studio/`, `components/veo/`, `lib/studio/`.
- Removed all wiring across ~12 files: sidebar item, `FeatureRouter` `veo` branch + import, `AppView`/`ViewType` `veo`/`media`, `GlobalCommandCenter` guard, the STUDIO voice command, and the **`enableStudio` capability + `accessStudio` permission** (User Management toggle/checkbox, `UserPermissions` type, defaults, `useAmbleConfig`, `ProfileModal`, test). Build verified clean.
- **Kept (orphaned) backend**: `/api/image`, `/api/veo`, `/api/video/analyze`, gallery route, `modelGateway` (imported by the agent system) — generic infra, no UI caller now. Documented in §5 for optional later removal.

### 2026-06-14 — Image + video-analysis → Vertex
- **Image generation on Vertex** — `image.js` now uses `@google/genai` Vertex (`vertexai:true`, regional `us-central1`) with **Imagen 4** (`imagen-4.0-generate-001`). Verified via prod smoke test.
- **Video-analysis on Vertex** — `videoAnalyze.js` rewritten to `gemini-2.5-flash`, passing the Storage video as a `gs://` URI (no Developer-API file upload). Simpler + no temp files.
- Probed + recorded Vertex media model IDs (Imagen 4/3, Veo 3/2) — see §8.
- **Veo video gen intentionally left on the Developer API** (untestable paid LRO this session; Sora is the verified video path) — precise migration steps in §8.

### 2026-06-14 — Gemini 3 (Vertex global) + Clock In/Out permission
- **Upgraded chat to Gemini 3** — probed the Vertex **global** endpoint and found the latest models there: **`gemini-3-flash-preview`** (fast) + **`gemini-3.1-pro-preview`** (pro). Switched the chat Vertex client to `location: global` and these IDs; picker now shows Gemini 3. (Earlier probe used `us-central1` which doesn't serve Gemini 3.)
- Added a **Gemini→OpenAI fallback** in the prod chat handler — preview IDs can rotate (e.g. `gemini-3-pro-preview` was retired), so chat degrades to `gpt-5-mini` instead of erroring.
- **Clock In/Out is now a permission** — `accessClock` (default **true**) with a toggle in User Management → Access Permissions (and the Add-User form); sidebar item gated on it. Added to `UserPermissions` type + new-user defaults.

### 2026-06-14 — Vertex AI: chat migrated + Live Studio removed
- **Chat now runs on Vertex AI** (`functions/src/routes/chat.js` → `@google/genai` `vertexai:true`, ADC auth). Enabled `aiplatform.googleapis.com` + granted the function SA `roles/aiplatform.user`.
- Probed Vertex `us-central1`: only **gemini-2.5-flash** + **gemini-2.5-pro** available (Gemini 3 = 404). `normalizeModel` + `modelConstants.ts` updated to those two; picker no longer shows Gemini 3. OpenAI fallback unchanged.
- **Removed Live Studio** (`LiveStudio.tsx` + MediaStudio Audio tab) — not used, and couldn't run on Vertex (browser-side).
- Build clean; deployed. **Remaining Vertex work (image/video/video-analysis/dev route) documented in §8** for next session.

### 2026-06-14 — Clock In/Out (time clock) feature
- New **Clock In/Out** surface (`clock` view, sidebar item for all users): employee punch in/out with live clock + status, **My Timecard** weekly view (daily/week totals), and an admin **Manage** panel to adjust/add/delete any employee's entries.
- New `services/timeclock/TimeClockService.ts` (+ `components/views/TimeClockView.tsx`). Firestore `time_entries` collection with rules (own entries / admin-all) and composite indexes `(userId+clockIn)`, `(userId+clockOut)`.
- Documented in ARCHITECTURE §13a (+ data model) and here. Build clean; deployed.
- ⏭️ Vertex AI migration scoped + documented (§6/§8) but **not** implemented this session (infra-risky on live chat).

### 2026-06-14 — RxConnect embed + keep-alive navigation
- **Keep-alive view router** (`FeatureRouter`): surfaces are mounted once and hidden (`display:none`) instead of unmounted on tab switch. Fixes (a) the laggy nav/sidebar-collapse caused by heavy views remounting and (b) loss of per-tab state — you now return to the same scroll/open-doc/draft when switching tabs.
- **Replaced the Pharmacy module with RxConnect**: `PharmacyView` now embeds `https://rxconnect.tweaking.agency/login` in a single iframe. Removed `PharmacySidebar`, the Revive/Align switcher, and the `activePharmacy`/`mountedPharmacies` plumbing in `AmbleApp`. Sidebar item renamed **Pharmacies → RxConnect** (view id stays `pharmacies`).
- Build verified clean (24/24 pages). Deployed to amble-ai.

### 2026-06-14 — Docs consolidation + project revert ✅
- Consolidated `docs/` down to **two** living docs: `ARCHITECTURE.md` (with Mermaid flowcharts) + this `SOURCE_OF_TRUTH.md`. Deleted the legacy 00–09 + CHANGELOG split docs (content folded in here).
- Full re-analysis of the codebase; verified architecture unchanged since the March audit (the May commits only swapped project IDs).
- **Reverted** the rotceh-2 migration back to `amble-ai` (see §2): all config + `.env.local` restored, deployed, OAuth client + secret realigned (Firebase Auth Google provider secret updated to match). **Login verified working on https://amble-ai.web.app.**

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

### ✅ Resolved (2026-06-14)
- Revert to amble-ai complete; Google OAuth client ID + secret restored; **Firebase Auth Google provider secret realigned** to the current OAuth secret (the original mismatch caused the login 400). Login verified on https://amble-ai.web.app.
- All 6 Cloud Function secrets confirmed present on amble-ai (incl. `SMTP_APP_PASSWORD`). Clean deploys working.

### 1. 🚧 Vertex AI migration (primary next task)
Move Gemini usage from the **Gemini Developer API** (API-key) to **Vertex AI** (ADC/service-account, latest models). Scoped but not yet implemented — it touches the live chat across two SDKs, so do it as a focused, tested change.

**✅ Done (2026-06-14):**
- GCP: `aiplatform.googleapis.com` **enabled** on amble-ai; runtime SA `1064927104823-compute@developer.gserviceaccount.com` granted **`roles/aiplatform.user`**.
- Probed both endpoints: **Gemini 3 is on the `global` endpoint** (not `us-central1` — that's why the first probe 404'd). Live for amble-ai: **`gemini-3-flash-preview`** (fast) + **`gemini-3.1-pro-preview`** (pro); `gemini-3-pro-preview` is retired (404).
- **PROD chat migrated** — `functions/src/routes/chat.js` uses `@google/genai` Vertex mode (`vertexai:true`, ADC, **`global`** endpoint); `normalizeModel` collapses any Gemini selection to `gemini-3-flash-preview` (fast) / `gemini-3.1-pro-preview` (pro/thinking). `modelConstants.ts` + picker updated to Gemini 3. Added a **Gemini→OpenAI (`gpt-5-mini`) fallback** in the prod handler since preview model IDs can rotate.
- **Live Studio deleted** (`LiveStudio.tsx` + MediaStudio "Audio" tab) — the browser-side blocker is gone.
- **Image migrated** — `functions/src/routes/image.js` → Vertex (`vertexai:true`, **regional `us-central1`**), Imagen **`imagen-4.0-generate-001`** via `ai.models.generateImages`. Verified by prod smoke test.
- **Video-analysis migrated** — `functions/src/routes/videoAnalyze.js` rewritten to Vertex `gemini-2.5-flash`, passing the Storage video as a `gs://${bucket.name}/${storagePath}` URI (no more `GoogleAIFileManager` upload/poll). Compile-verified.
- **Probed media model IDs** (us-central1, all exist): Imagen `imagen-4.0-generate-001` / `…-fast-generate-001` / `imagen-3.0-*`; Veo `veo-3.0-generate-001` / `…-fast-generate-001` / `veo-2.0-generate-001`. Gemini image (global): `gemini-3.1-flash-image`, `gemini-2.5-flash-image`.

**🔜 Remaining (next session):**
- **Veo video gen → Vertex** (`functions/src/routes/video.js` `handleVeoGeneration` + dev `src/app/api/veo/route.ts`). Left on the Developer API on purpose — it's an untestable-in-one-session paid LRO and **Sora is the verified video path**. Steps: client → `new GoogleGenAI({vertexai:true, project, location:'us-central1'})`; model **`veo-3.0-generate-001`** (or `…-fast-generate-001`); keep `generateVideos` + `operations.getVideosOperation` polling; **change output handling** — Vertex returns `generatedVideos[0].video.videoBytes` (base64, upload directly to Storage) OR set `config.outputGcsUri` and read the `gs://` result (the current `?key=GEMINI_API_KEY` URL trick is Developer-API-only). Verify with one real generation.
- **Dev chat route** `src/app/api/chat/route.ts` — mirror the `chat.js` Vertex change; needs local ADC (`gcloud auth application-default login`) for `next dev` (dev-only; Functions win in prod).
- `functions/src/services/driveSearchService.js` binary OCR (`GEMINI_API_KEY`) — optional move.
- Once Veo + dev route are off it, retire `GEMINI_API_KEY`. These features have **no OpenAI fallback** (unlike chat), so probe model IDs + test before deploy.

### 2. Near-term tech debt (from §6)
System-prompt consolidation, route de-dup (Functions vs Next), auth on admin endpoints, prune `functions/package.json`.

### 3. Time clock follow-ups (optional)
CSV/payroll export, approvals, overtime rules, TIP/BON/COM amount fields, break tracking.

### 5. 🔎 KB Search — analysis & improvement plan (2026-06-14)

**Finding.** Production answers KB questions with **live Google Drive keyword search + a hand-rolled TF-IDF** (`functions/src/routes/chat.js` → `driveSearchService.js`). There is **no semantic/vector search on the live path**, the KB is only searched when a **regex keyword gate** matches, coreference is resolved by a **hardcoded drug/pharmacy entity regex**, whole documents (≤8K each) are stuffed into the prompt, and a cold query does live Drive API calls + content extraction (incl. Gemini OCR for binaries) on the chat hot path (≤30 s timeout). Three disconnected retrieval systems coexist (see [ARCHITECTURE §11a](./ARCHITECTURE.md)), one with a post-filter bug that drops valid hits.

**Why it underperforms** (industry baselines): paraphrase/synonym/conceptual queries miss (no embeddings); brittle intent gate skips real questions; whole-doc injection dilutes the context window and weakens citations; latency + cost on cold queries; duplicated/buggy code.

**Target architecture** — one pipeline, built from what we already have (Firestore vector search + Cloud Functions + OpenAI/Vertex embeddings):

```
Ingest (offline, incremental):  Drive file → extract (reuse extractFileContent) →
  structure-aware chunk (~500–800 tok, 10–15% overlap, keep tables/headings) →
  embed → knowledge_vectors {embedding: Vector, fileId, title, department, chunkIndex, modifiedTime}
  (only re-index files whose modifiedTime changed)

Retrieve (hot path):  embed query →
  Firestore findNearest (COSINE, top ~50) [+ optional where(department==…) pre-filter] ⨁
  keyword/fullText pass  →  fuse with Reciprocal Rank Fusion (k≈60)  →
  rerank top ~50 → top 5–8 (cross-encoder)  →  inject CHUNKS w/ citations
```

**Phased plan**
- **P0 (quick wins, no new vendors):** fix the `searchKnowledgeBase` post-filter bug (pre-filter via `where()` + composite vector index, raise `limit`); replace the regex intent-gate with "search KB by default for the Amble tab, let the model cite or fall through"; inject **chunks, not whole docs**; LLM-reformulate the query with existing Gemini Flash instead of the entity regex.
- **P1 (the real fix):** stand up the **incremental Drive→`knowledge_vectors` ingest** as a scheduled Cloud Function (Cloud Scheduler), make `/api/chat` retrieve via **Firestore `findNearest`**, add the **keyword pass + RRF fusion**, and **delete two of the three** retrieval systems. Add a `department`/`category` pre-filter to align with RBAC + the new time-clock departments.
- **P2 (quality):** add a **reranker** (two-stage: recall ~50 → rerank → top ~8) and a tiny **eval set** (20–30 Q→expected-doc pairs) to measure recall\@k before/after.

**Decision — embeddings (analyzed for max accuracy, 2026-06-14):**

> ⚙️ **Hard constraint:** the **Firestore vector index caps at 2048 dimensions** ([docs](https://docs.cloud.google.com/firestore/native/docs/vector-search)). So `text-embedding-3-large` (3072) can't be stored at full size — it'd need MRL reduction to 2048. This shapes the choice.

| Model | Native dim (Firestore-usable) | MTEB Eng | Domain (medical) | Vendor | Notes |
|-------|------------------------------|----------|------------------|--------|-------|
| `text-embedding-3-small` *(current)* | 1536 | ~62 | baseline | OpenAI | already wired; weakest of the four |
| `text-embedding-3-large` | 3072 → **MRL 2048** | ~64.6 | +0 | OpenAI | drop-in API; must reduce dims for Firestore |
| **`gemini-embedding-001`** ✅ | 3072 → **MRL 1536/2048** | **68.3 (MTEB #1)** | strong | **Google/Vertex** | native to our Vertex stack, multimodal-ready, ~$0.006/M, MRL dial |
| `voyage-3-large` / v4 | 1024 (→2048) | ~65 | **+4–6 pts on medical** | Voyage (new) | domain specialist; best if eval shows medical recall gaps |

**Recommendation:** migrate **`text-embedding-3-small` → `gemini-embedding-001` at output dim 1536 (MRL), COSINE.** Why: tops the English MTEB leaderboard, **consolidates on the Vertex stack we just standardized chat on** (one auth/vendor surface), is **multimodal-ready** for our PDFs/spreadsheets/images, costs almost nothing to re-embed, and 1536 sits comfortably under Firestore's 2048 cap. Keep **`text-embedding-3-large` (MRL 2048)** as the no-new-stack fallback; hold **Voyage** in reserve — adopt only if the eval set (P2) shows medical-domain recall is the bottleneck. **Pick ONE and re-embed the whole KB — never mix models in one index.**

> 🔑 **Reality check the user asked for:** the embedding model is worth only a *few* MTEB points. What actually makes the assistant **"always use the KB accurately"** is the **Accuracy Playbook** below — a reranker alone adds **+12–17 pts** retrieval quality (more than any embedder swap), and grounded-generation + abstention + an eval loop are what stop confident wrong answers. Top-notch = good embeddings **× all six layers**, not embeddings alone.

**Accuracy Playbook — "always grounded in the KB" (impact-ranked):**
1. **Recall first (retrieve the right chunk):** hybrid **vector + keyword** fused with **RRF**, retrieve ~50 candidates, `where(department/category)` pre-filter. *If the answer chunk isn't retrieved, nothing downstream can fix it — this is the #1 accuracy lever.*
2. **Rerank (precision):** cross-encoder rerank 50 → top 6–8, with a **relevance floor** (drop weak chunks). Reranker = the single biggest quality jump (+12–17 pts). Options: **Gemini-Flash rerank** (no new vendor, start here) → **Cohere Rerank** (~$1/1k, best) or **Vertex Ranking API** if eval demands.
3. **Self-contained chunks:** structure-aware ~500–800 tokens, 10–15% overlap, keep tables/headings intact; attach `{title, department, sourceUrl, modifiedTime}`. Use **parent-document / late-chunking** so a retrieved snippet carries its surrounding context.
4. **Grounded generation (the prompt contract):** "Answer **ONLY** from CONTEXT. Cite the chunk id for every claim `[#]`. If CONTEXT doesn't contain it, say so — do not use prior knowledge." Low temperature. This is what makes it *use the KB* instead of free-associating.
5. **Groundedness verification + abstention (the guarantee):** after generation, run a **faithfulness check** — **Vertex check-grounding API** or an NLI/LLM judge that confirms each sentence is supported by a retrieved chunk. If ungrounded or top-rerank score < threshold → **regenerate or abstain** ("not in the KB" + offer web). *This is what prevents confident hallucinations even when retrieval is imperfect — the core of "accurate every time."*
6. **Eval loop (prove it):** a 20–30 question gold set (question → expected doc/answer), scored with **RAGAS** (context recall, context precision, **faithfulness**, answer relevancy). Gate every change on it so "top-notch" is measured, not assumed.

**References (accuracy/grounding):** [Firestore vector dims/limits](https://docs.cloud.google.com/firestore/native/docs/vector-search) · [MTEB 2026 embedding benchmark (Milvus)](https://milvus.io/blog/choose-embedding-model-rag-2026.md) · [RAGAS faithfulness/groundedness](https://arxiv.org/html/2309.15217v1) · [Groundedness eval (deepset)](https://www.deepset.ai/blog/rag-llm-evaluation-groundedness) · [Hybrid + rerank gains (Superlinked)](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking)

**What we'd need to "get" (owner):**
1. **Confirm the embedding pick** — recommended **`gemini-embedding-001` @1536 (Vertex)**; approving it means a one-time re-embed of the KB (cheap). Reranker can default to Gemini-Flash (no new vendor) until eval says otherwise.
2. **Firestore composite vector index** on `knowledge_vectors.embedding` incl. the pre-filter fields (`department`, optionally `category`) — add to `firestore.indexes.json` + deploy.
3. **Cloud Scheduler** job (free-tier-ish) to run the incremental re-index — needs the scheduler API enabled.
4. *(If reranker = Cohere)* a **Cohere API key** as a Cloud secret. *(If Vertex Ranking)* enable **Discovery Engine API**.
5. *(Alternative, least code)* **Vertex AI Search** with its **GA Google Drive connector** — Google does crawl/chunk/embed/hybrid/rerank/citations end-to-end; tradeoff is a new paid GCP product + less control. Good fallback if we don't want to own the pipeline.

**References (current best practice):**
- Firestore vector search + metadata pre-filtering — [Google Cloud blog](https://cloud.google.com/blog/products/databases/get-started-with-firestore-vector-similarity-search), [docs](https://docs.cloud.google.com/firestore/native/docs/vector-search)
- Hybrid search + RRF + two-stage rerank — [Superlinked VectorHub](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking), [RRF explainer (Laforge/Google)](https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/)
- Managed options — [Vertex AI Search vs RAG Engine vs Vector Search](https://medium.com/google-cloud/the-gcp-rag-spectrum-vertex-ai-search-rag-engine-and-vector-search-which-one-should-you-use-f56d50720d5a), [Vertex RAG Engine](https://cloud.google.com/blog/products/ai-machine-learning/introducing-vertex-ai-rag-engine)
- Chunking + embedding model choice — [Firecrawl chunking guide](https://www.firecrawl.dev/blog/best-chunking-strategies-rag), [Milvus 2026 embedding benchmark](https://milvus.io/blog/choose-embedding-model-rag-2026.md)

> **Status: ANALYSIS ONLY.** No KB code changed. Embedding model analyzed → **recommend `gemini-embedding-001` @1536**; accuracy depends on the 6-layer playbook (reranker + grounded gen + abstention + eval), not the embedder alone. Resume at **P0** once the owner confirms the embedding pick (and build-our-own-pipeline vs managed Vertex AI Search).

### 4. RBAC follow-ups
Foundation + most follow-ups shipped. Status:
- ✅ **Edit a user's role** — role `<select>` on the edit screen, gated by `canManageRole(actor, target)`; saved via a direct `users/{id}` write.
- ✅ **Firestore rule refinement** — `users` update now: Super Admin = anyone; Manager = only current-Staff docs and may not set role above Staff; self = own doc but can't change own role. Delete similarly gated.
- ✅ **Role-based default permission bundles** — `defaultFeaturePermissions(role)` auto-applies when a role is picked in Add-User (Manager/Super Admin get KB + Pharmacy on; Staff get Amble/Billing/Clock).
- ✅ **Data migration done** — existing users' stored roles normalized (`admin`→`superadmin`, `user`→`staff`) via `scripts/migrate_roles.js` (run through the Firestore REST API with the owner token; the KB service account lacked Firestore write). Idempotent script kept for future legacy users.
- ✅ **`users` create rule hardened** — confirmed all real user creation is server-side (Admin SDK bypasses rules); the client create rule now requires `isManagerOrAbove()` and a Manager can't mint elevated roles. (Bootstrap unaffected — first user is created server-side.)

**RBAC is now complete** — nothing outstanding.

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
