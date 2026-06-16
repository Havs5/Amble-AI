# Amble AI — Source of Truth (SOT)

> **Last updated:** 2026-06-16
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
- ✅ **Production vector RAG (shipped 2026-06-14)** — semantic retrieval on **Vertex `gemini-embedding-001` @1536** → Firestore **`findNearest`** (`kb_vectors`) → **hybrid RRF** (lexical fusion) → **Gemini-Flash rerank** → grounded answer with `[n]` citations + **abstention** when uncovered. Verified: cited KB facts on-topic; honest "not in the KB" off-topic. See [ARCHITECTURE §11a](./ARCHITECTURE.md).
- ✅ **Incremental ingest** — `POST /api/knowledge/reindex` (admin token or `x-reindex-key`): Drive walk → extract → structure-aware chunk → embed → `kb_vectors`, per-file `kb_index_state` (modifiedTime) so re-runs skip unchanged + resume (480 s soft-deadline). First run 43 files → 83 chunks, 0 errors.
- ✅ **Auto-refresh** — scheduled Cloud Function `kbReindexSchedule` runs the incremental reindex **every 6 h** (unchanged files cost ~nothing); manual full rebuild via the reindex endpoint
- ✅ **Groundedness post-check** — `verifyGroundedness` (Gemini-Flash judge) on borderline-confidence answers (<0.55), fail-open, appends a verify-caveat if a claim isn't supported (env `KB_GROUNDEDNESS_CHECK`, default on)
- ✅ **Eval harness** — `scripts/kb_eval.js` gold-question gate (answer-correctness + abstention); baseline 4/5
- ✅ Document processing: PDF/DOCX/XLSX/Google Docs + image analysis (Gemini OCR for binaries), `kb_content_cache` (24 h)
- ✅ Live-Drive keyword search retained as **cold-start fallback** (keyword-gated) so chat never regresses before/without an index
- 📌 Remaining (§8.5): expand eval gold set; `department` pre-filter index (optional); migrate user-upload ingest to Gemini/`kb_vectors` + retire the 2 legacy retrieval paths; optional Cohere/Vertex reranker upgrade

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
- ✅ **3-tier roles** via `lib/roles.ts` (single source of truth): **IT** (`superadmin`, labeled "IT" in the UI) › **Manager** (`manager`) › **Staff** (`staff`). Backward-compatible — legacy `admin`→IT, `user`→Staff (no data migration needed). The role **key stays `superadmin`**; only the display label changed.
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
- ✅ **"Who's In" tab (managers/IT only) + team presence** — live board of everyone currently clocked in (avatar/dept/since/duration) via a world-readable `presence` mirror; **online = clocked in** reflected in the Dashboard greeting (Online/Offline) + sidebar Amble logo (greyscale + "Offline" when out) via `useClockStatus()`
- ✅ **Correction requests** — staff "Request fix" (missing) or per-entry correction (`time_edit_requests`) with reason; manager **Pending requests** queue approves (applies to `time_entries`) / rejects; staff see live status
- ✅ **Manager date-range filter** — From/To inputs (`subscribeRange`) + live filtered total (respects dept/employee filters) to pull anyone's hours over a custom range
- ✅ Realtime via Firestore `onSnapshot`; secured by Firestore rules (own entries, or all for admins; `presence` readable by any authed user, writable by owner) + composite indexes `(userId+clockIn)`, `(userId+clockOut)`
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

### 2026-06-16 — Fix: deploys not reaching users (1-year HTML cache)
- **Root cause:** `src/app/page.tsx` (the SPA shell) was statically prerendered, so the SSR function served it with `Cache-Control: s-maxage=31536000` + `X-Nextjs-Cache: HIT`. Firebase's CDN cached the HTML for a **year**, so new deploys (e.g. the colorful-tiles redesign) never reached browsers — they kept getting old HTML referencing old JS chunks. This is why "the cards never changed."
- **Fix:** `export const dynamic = 'force-dynamic'` on the home route → Next emits `no-store` for the shell, so every deploy is live immediately (home route flipped `○ Static` → `ƒ Dynamic`). Also added `Cache-Control: public, max-age=31536000, immutable` for `/_next/static/**` (content-hashed, safe) and bumped the hosting config to force a CDN refresh. **Note for the future: any "deployed but not showing" symptom is almost always this caching layer.**

### 2026-06-16 — Company News upgrade, Phase 1: colorful tiles + image zoom
- **No more wasted placeholder image block.** Most posts have no cover image, so the featured (medium) cards are now **full-bleed colorful tiles** — the department gradient (or the cover image when present) fills the card with the title/summary/badges overlaid, matching the hero look. The small list cards drop the building-icon placeholder for a **solid department-color swatch with the department label**; an uploaded cover shows as the thumbnail.
- **Click-to-zoom images.** In the post popup (`PostDetailModal`), a cover image shows a "Zoom" affordance and opens a **fullscreen lightbox** (Esc / click-out / × to close).
- **Owner decisions for the upgrade:** image-less cards = *colorful tiles*; Slack delivery = *reuse the existing app via Events API*; triggered posts = *auto-publish*.
- **Phase 2 (next): Slack auto-news.** A Cloud Function ingests Slack message events from allow-listed channels, matches the trigger keywords, and auto-publishes a `news_posts` doc (AI-summarized). Needs owner-supplied `SLACK_SIGNING_SECRET` + bot token (Firebase secrets, never committed), the channel allowlist, and the keyword list. See §8 Open Items.

### 2026-06-16 — Settings: drop password, add Appearance + real Account info
- **Removed "Change Password"** from Settings → the app authenticates with **Google**, so there's no app-managed password. Deleted the reset form, password state, and the `resetPassword` call from `ProfileModal`.
- **Profile tab** — now shows the Google **avatar**, **role** + **department** badges; display name stays editable; **email is read-only** ("Managed by your Google account").
- **New Appearance tab** — Light/Dark **theme switcher** wired to the existing app-level theme (`isDarkMode`/`setIsDarkMode` passed from `AmbleApp`; persists in `amble_theme`, flips the `dark` class live).
- **Account & Security tab** (replaces Change Password) — "Signed in with Google" + email, role/department, and **real Member-since / Last-sign-in** from `auth.currentUser.metadata`, plus a Sign out button. All values are live, not placeholders.

### 2026-06-16 — Company News: popup reader, tier layout, tag-overflow fix
- **Click a post → opens a full-post popup modal** (`PostDetailModal`) instead of the old inline "expanded body below the card". Centered, backdrop+blur, Escape/×/click-out to close, cover-image-or-gradient banner with department/critical/pinned badges, full body + tags, and admin actions (Pin/Archive/Edit). Removed the inline-expand state (`expandedPostId`) entirely.
- **Magazine tier layout:** first view is now **2 main (large hero)** + **3 medium (featured)** + **the rest as small list cards** ("Latest Updates"), replacing the old 1-hero + 2-stacked banner. `sortedPosts` sliced 0–2 / 2–5 / 5+.
- **Tag-overflow fix:** the list-card footer (`author · time · tags`) was a non-wrapping flex row, so when the **New Post editor** opened and the feed column narrowed, tags spilled outside the cards. Footer now wraps (`flex-wrap` + `min-w-0` + truncation).
- `departmentGradients` / `departmentBadgeColors` exported from `PostCard` for reuse by the modal.
- **Next:** owner flagged a "major upgrade" to News coming after this — pending their spec.

### 2026-06-15 — Clock In/Out: Eastern (EST/EDT) canonical time + Punch local reference
- **All punch times display in Eastern Time (America/New_York, DST-aware)** as the canonical company time — identical for every viewer regardless of their own timezone. `TimeClockService.fmtTime`/`fmtDateTime` pass an explicit `timeZone: COMPANY_TZ` (also makes them SSR-deterministic). Absolute `Timestamp`s already stored, so this is a pure display change — no backfill.
- **Live Punch clock shows the viewer's own local time as a small "Your local time: 10:36 PM" reference**, but only when it differs from Eastern (so ET staff see nothing). Gated by a mount-resolved `useOffEastern()` hook → no SSR hydration mismatch.
- **Recorded times stay Eastern-only.** Iterated to the owner's preference: an earlier pass showed a muted "· local" aside on *every* row plus an "🌐 Eastern Time · EDT" badge — the owner removed those (badge, per-row asides on Today/Timecard/Who's In/Manage records, off-Eastern input hints) and kept only the single local **reference** on the Punch screen.

### 2026-06-15 — KB accuracy, logo sizing, styled dialogs, Who's In filters, usage perf
- **KB retrieval hardened for accuracy (the "Semaglutide not found" fix).** Root cause: the doc *was* indexed, but for **multi-product queries** one product's chunks crowded out the other (non-deterministic). Fixes in `kbRetrieval.js`: candidate pool 40→**60**, rerank pool 15→**20**, injected chunks 6→**8**, and a new **document-diversity selection** (`maxPerDoc=3`) so each doc/product is reliably represented. Verified: "Tirzepatide and Semaglutide pricing" now returns **both**. (Re-ran a full reindex: 43 files → 83 chunks, 0 errors.)
- **Usage Report speed** (deployed earlier this session) — fetch-once + in-memory time-range filter (instant range switches, no re-query) + **parallel** user-name resolution + capped query; stats derived via memo.
- **COOP** → `same-origin-allow-popups` (fixes the Google sign-in `window.close` console warning). The "message channel closed" console error is a **browser extension**, not app code.
- **Brand logo** — `AmbleMark` now also in the chat welcome screen + app header; **marks made a bit smaller inside every square** and the **sidebar logo square reduced** `w-10→w-9`; favicon mark scaled down. Sidebar **nav icons** bumped `19→21` for fuller presence.
- **Styled dialogs** — replaced the native browser `confirm()`/`prompt()` in Clock In/Out Manage with designed **ConfirmDialog** (delete) + **RejectDialog** (reject-with-reason) modals.
- **Who's In filters** — added a **department dropdown** + **name search box** to the presence board.

### 2026-06-15 — Clock In/Out: immutable Change Log (audit trail)
- **Manage tab now has a Records / Change Log toggle.** The **Change Log** records every manager action — **Added / Edited / Deleted** entries and **Approved / Rejected** correction requests — to a new **`time_audit`** collection. Columns: **When · Action · Employee · Change (before→after) · By (name + role badge incl. IT) · Note**.
- **Tamper-proof by design** — rules allow managers+ to **read and append only**, the recorded `actorUid` must equal the caller, and `update`/`delete` are **denied to everyone (including IT/super admin)** — so the trail can't be altered. `logAudit`/`subscribeAudit` in the service; `ManageTab` now receives `editor {uid,name,role}` and logs on each action (best-effort).

### 2026-06-15 — Brand: Amble logo mark replaces the "A" + favicon
- New **`AmbleMark`** component inlines `public/Amble-Logo.svg` as a `currentColor` path (recolorable). Swapped the plain "A" for it (white) in the **sidebar logo**, **login** (desktop + mobile), and **splash screen**. Offline sidebar square darkened to `slate-400` so the white mark reads.
- **Favicon** rebuilt: `public/favicon.svg` is now the gradient rounded square + the white logo path (replacing the old "A" text). `.ico` fallback unchanged.

### 2026-06-15 — Clock In/Out: correction requests + manager range filter
- **"Who's In" restricted to managers/IT** — the presence board tab (and its subscription) now only render for `manageTimeclock` holders.
- **Staff correction requests** — on **My Timecard**, staff can **"Request fix"** (a missing punch) or hit the per-entry pencil to **request a correction** (propose new clock in/out + reason). Requests land in a new **`time_edit_requests`** collection; staff see their own requests + live status (pending/approved/rejected). Rules: a user creates/reads only their own (status forced `pending`); managers+ read all and update.
- **Manager review queue** — the **Manage** tab shows a **Pending correction requests** panel (current→proposed diff + reason); **Approve** applies the change to `time_entries` (`updateEntry` for edits, `addManualEntry` for adds) then marks it approved, **Reject** records an optional note. `approveRequest`/`rejectRequest`/`subscribePendingRequests` in the service.
- **Manager date-range filter** — Manage tab gained **From/To date inputs** (`subscribeRange`) that override the week view, plus a live **filtered total** that respects the department + employee filters — so a manager can pull one person's hours over any range.

### 2026-06-15 — Clock In/Out: team presence ("Who's In") + online status
- **"Who's In" tab** (visible to everyone) — a live board of all teammates currently clocked in, with avatar, department, clocked-in-since time, and running duration, sourced from a new world-readable **`presence`** collection mirror.
- **Online = clocked in, reflected everywhere.** New `useClockStatus()` hook subscribes to the current user's open `time_entries` doc (source of truth). The **Dashboard greeting indicator** now shows green **"Online"** when clocked in / grey **"Offline"** when not, and the **sidebar Amble logo** turns grey/greyscale with a grey dot + **"Offline"** subtitle when clocked out (gradient + green dot + "Online" when in).
- **Presence mirror** — `clockIn`/`clockOut` upsert `presence/{uid}` `{online, since, name, department}`; `subscribeOnlineUsers` reads `online == true`. Rules: `presence` is readable by any authed user, writable only by its owner (so non-admins can see the board without reading everyone's time entries). Truth stays the open entry; presence is a denormalized mirror (a manager-forced clock-out self-heals on the user's next punch).

### 2026-06-15 — User Mgmt: layout regression, daily-trend chart, usage prefetch
- **Layout regression fixed** — the list column only received its `lg:` width when a user was *selected*, so with **no selection** it stretched full-width and pushed the detail/empty-state off the right edge. Made the list a consistent `lg:w-80` sidebar (full-width only on mobile while browsing); empty-state detail is `lg`-only. Detail is always visible on desktop now. Also removed the dead AI-config content panel from `ProfileModal` (770→570 lines).
- **Daily Cost Trend chart now renders** — bars used `%` heights with no definite-height parent → collapsed to ~0 (invisible). Switched to **pixel heights** (computed from `maxCost`, bottom-aligned, hover tooltip).
- **Usage loads instantly** — now **prefetches in the background** on user-select (cached 2 min) instead of only fetching when the Usage tab opens; the tab renders from cache.

### 2026-06-15 — User Mgmt: overflow fix, faster usage, AI-config consolidation
- **Horizontal scrollbar removed** — the two-column body lacked `min-w-0`, so the wide usage table forced the modal to overflow. Added `min-w-0` to the body + list + all detail panels, and switched the list to a fixed `lg:w-72` sidebar. Tables now scroll within their own column.
- **Usage tab loads faster (same accurate data)** — `UsageManager` now caches raw `usage_logs` per user (2-min TTL) so date-range switches recompute in-memory with **no re-query**; the modal **lazy-loads** usage only when the Usage tab is open (opening a user on Profile no longer waits on a Firestore fetch).
- **AI config consolidated (owner decision: per-user, one editor)** — Amble AI + Customer Experience config (system prompt + policies) stays **per-user** but is now edited in **one place: User Management → Settings → AI Configuration**. Removed the duplicate editor from the personal **Settings** modal (`ProfileModal`): dropped the Sidebar "AI Configuration"/"CX Configuration" menu items, the modal's AI-config nav section, redirected any `amble-config`/`cx-config` deep-link to Profile, and **deleted the ~200-line AI-config content panel** (770→570 lines; a few now-unused helpers remain inert). **No data lost** — every user's stored `ambleConfig`/`cxConfig` is untouched and shown/edited in User Management. The CX draft flow (`useAmbleConfig` → user's `cxConfig`) is unchanged.

### 2026-06-15 — User Mgmt: IT label, usage-report fixes, modal polish
- **Role label `Super Admin` → `IT`** — display only; the role **key stays `superadmin`** (and legacy `admin`). Changed `ROLE_LABELS.superadmin` in `lib/roles.ts`; the modal role filter + role-change hint now read from `ROLE_LABELS`. All rules/capabilities unchanged.
- **Usage report accuracy fixed (two real bugs):**
  1. **Gemini logged 0 tokens / $0.** `logUsageToFirestore` only read OpenAI field names (`prompt_tokens`/`completion_tokens`); the Vertex Gemini path sends `input_tokens`/`output_tokens` → 0. Now reads **both** shapes. Also added the **actual normalized model IDs** to `functions/src/config/pricing.js` (`gemini-3-flash-preview`, `gemini-3.1-pro-preview`, `gemini-3-pro-preview`, `gemini-2.5-flash`) + aligned Gemini 3 rates to $0.10/$0.40 (flash) and $2.50/$10 (pro); previously they fell back to gpt-4o pricing. Mirrored the IDs in client `usageManager.ts` (display + rate). **Caveat:** historical 0-token Gemini logs are NOT backfilled — only new usage is accurate.
  2. **Total row ≠ cards.** The Cost-Breakdown **Total** used `month` (calendar month) while the cards + rows use the selected **range** (e.g. last-30-days) → $1.08 vs $1.99. Total now uses `range`; the 30-day card's progress bar too.
- **Removed** the "Dictation Pricing Reference" card from the user detail view.
- **Modal polish** — `UserManagementModal` density pass (p-6→p-5, section headers text-lg→text-base, big numbers text-2xl→text-xl, tighter spacing, max-w-6xl→5xl) for a cleaner, more compact look.
- **Tabbed user detail + sticky save bar** — the long single-scroll detail view is now **4 tabs**: **Profile** (role · department · access permissions) · **Usage** (statistics) · **Settings** (AI config · capabilities · voice dictation · usage limits) · **Danger** (admin-only). Tabs are wired with a `detailTab` state (resets to Profile on user select); the cards were already contiguous in file order so no reordering. **Save Changes** moved out of the header into a **sticky footer** (always reachable, no scroll-up); the detail panel is now a flex-col with a scroll area + pinned action bar. Admin gating unchanged (footer + Danger tab only render for `manageUsers`).
- **Modal follow-ups (3):** (a) **Trimmed Premium Capabilities** — removed the dead toggles (Image Generation, Realtime Voice, Video Input — those modules are gone); kept Web Browsing · Vision · Code Interpreter · Long Context. (b) **Unsaved-changes guard** — `serializeEdits()` snapshots the loaded user; an `isDirty` compare warns (`window.confirm`) before switching users (`handleEditUser`), closing the modal (`attemptClose`), or hitting Back (`attemptBack`); snapshot is reset on load + after a successful save. (c) **List avatars + last-active** — colored initials avatar (hashed color) per row + a relative "Active 2h ago" line from `lastLoginAt` (handles Firestore Timestamp / ISO / epoch).

### 2026-06-14 — KB RAG hardening: auto-reindex + groundedness + eval
Completed the KB next-session items. **Scheduled auto-reindex** — new `kbReindexSchedule` (`onSchedule`, every 6 h, incremental `reindexKb({full:false})`); `cloudscheduler.googleapis.com` auto-enabled; created successfully on deploy. **Groundedness post-check** — `kbRetrieval.verifyGroundedness` (Gemini-Flash judge) wired into `chat.js`, gated to borderline confidence (<0.55) so high-confidence answers stay fast, **fail-open**, appends a verify-caveat when a claim isn't supported (env `KB_GROUNDEDNESS_CHECK`). **Eval harness** — `scripts/kb_eval.js` (gold questions → answer-correctness + abstention), baseline **4/5** (the one miss is generation phrasing, not retrieval; abstention verified on company-specific gaps). Deployed (`ssrambleai` updated + `kbReindexSchedule` created). Remaining KB items are optional cleanup (§8.5 items 4–7).

### 2026-06-14 — KB vector RAG shipped (accuracy + speed + grounding)
Replaced the live-Drive keyword KB path with a proper **vector RAG pipeline** and deployed it. New: `embeddingService.js` (Vertex **`gemini-embedding-001` @1536**, asymmetric task types), `kbChunker.js` (structure-aware ~700-tok chunks), `kbRetrieval.js` (`findNearest` top-40 → lexical **RRF** → **Gemini-Flash rerank** → top-6, `MIN_SCORE` floor), `kbIngest.js` (incremental Drive→**`kb_vectors`**, `kb_index_state`, resumable), `handleKbReindex` (`/api/knowledge/reindex`, admin token or `x-reindex-key`). `chat.js` now retrieves vector-first (live-Drive kept as cold-start fallback) and injects **chunks with `[n]` citations** under a strict **grounding contract + abstention** rule. Fixed `searchKnowledgeBase` recall bug (over-fetch 40 + post-filter). Added `kb_vectors` vector index (separate from legacy OpenAI `knowledge_vectors`). **Deployed; first reindex 43 files → 83 chunks, 0 errors; verified grounded citations + honest abstention.** Next-session items in §8.5. Docs: [ARCHITECTURE §11a](./ARCHITECTURE.md).

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

### 2b. 🔜 Company News upgrade — Phase 2: Slack auto-news (CODE DONE, pending deploy)
**Status (2026-06-16): function written + syntax-checked; BLOCKED on `firebase login --reauth` (CLI token expired) to set secrets + deploy.** Built: `functions/src/services/slackNews.js` + `slackEvents` export in `functions/index.js` (defineSecret `SLACK_SIGNING_SECRET` + `SLACK_BOT_TOKEN`). Owner already provided both secret values. **Remaining: reauth → `firebase functions:secrets:set` both → `npm run deploy` → take the `slackEvents` function URL → set it as the Slack Event Subscriptions Request URL (subscribe `message.channels`) → `/invite` the bot to #announcements → test a real `#news` message.** Owner decisions locked: reuse the existing Slack app via Events API, **auto-publish**, channel = #announcements for now (config `channels: []` = any channel the bot is in, so adding more later "just works"). Spec:
- **New Cloud Function `slackEvents`** (HTTP). (a) Answer Slack's `url_verification` challenge; (b) verify the `x-slack-signature` (v0 HMAC over `v0:{timestamp}:{rawBody}` with `SLACK_SIGNING_SECRET`, reject >5 min skew); (c) ack 200 within 3 s, do work async; (d) for `event_callback` `message` events (ignore bot/edits), if `channel ∈ allowlist`, scan text for the **hashtag triggers** below.
- **Hashtag triggers (all case-insensitive — `#news`/`#NEWS`/`#nEws` all match):**
  - **`#news`** → create + **auto-publish** a `news_posts` doc (this is the create trigger).
  - **`#urgent`** → set `priority: 'CRITICAL'`.
  - **`#pin`** → set `pinned: true`.
  - **Thread replies/comments count too:** a reply on the message containing a hashtag triggers the same behaviour (e.g. a `#pin` comment creates + pins the post). Match on reply text; resolve the parent via `thread_ts`.
  - Posts remain **fully editable inside Amble AI** after creation.
- **AI summarization** (owner confirmed = on): run the Slack text through Gemini-Flash to produce `{title, summary, body, departmentId}`; fall back to raw text + first line as title if the model is unavailable. `#urgent`/`#pin` flags applied on top.
- **Config in Firestore** `config/slackNews` (editable without redeploy): `{ channels: string[], triggers: { create:'#news', urgent:'#urgent', pin:'#pin' }, autoPublish: true, summarize: true }`. **One channel now; adding the bot to more channels later "just works" with the same triggers** (add the channel ID to `channels`).
- **Secrets (owner-provided, NEVER committed):** `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN` (bot token only needed to resolve channel/user names + dedupe). Set via `firebase functions:secrets:set`.
- **Slack-side setup (owner):** in the existing app → Event Subscriptions → Request URL = the deployed `slackEvents` URL; subscribe to `message.channels`; add scopes `channels:history` (+ `groups:history` for private); reinstall; **invite the bot** to each target channel.
- Dedupe on Slack `event_id` (store processed IDs) so retries don't double-post.

### 3. Time clock follow-ups
- ✅ **DONE (2026-06-15): Timezone handling — Eastern is canonical company time.** All Clock In/Out times render anchored to **America/New_York (EST/EDT, DST-aware)** and are identical for every viewer. Pure display layer — `time_entries` already store absolute `Timestamp`s, no backfill.
  - **`TimeClockService.ts`**: `COMPANY_TZ='America/New_York'`; `fmtTime`/`fmtDateTime` format with explicit `timeZone:COMPANY_TZ` (also SSR-deterministic). Used everywhere across Punch/Timecard/Who's In/Manage.
  - **Punch-clock local reference (kept):** the live Punch clock shows "Your local time: 10:36 PM" under the big Eastern clock, gated by `useOffEastern()` (mount-resolved `TC.viewerOffEastern()`, so off the SSR path → no hydration mismatch). Shown only when the viewer's wall clock differs from Eastern.
  - **Per-row local asides + badge — built then removed at owner's request.** The first pass also added a "🌐 Eastern Time · EDT" badge and muted "· local" asides on *every* row (Today/Timecard/Who's In/Manage records) plus off-Eastern input hints. The owner removed all of that ("delete where it says eastern time" / "delete the local hour in the recorded time"), keeping only the single Punch-screen reference above. Recorded times are Eastern-only.
  - *Known limitation (unchanged):* day/week bucketing (`startOfWeek`, `dayKey`, `isSameDay`) uses the viewer's local calendar day, so a near-midnight punch could land on the adjacent day for an off-ET viewer — acceptable for an ET-based org; revisit with ET-based bucketing if remote staff grow.
- Other (optional): CSV/payroll export, overtime rules, TIP/BON/COM amount fields, break tracking.

### 5. 🔎 KB Search — vector RAG (✅ SHIPPED 2026-06-14)

> ✅ **Built, deployed, and verified this session.** The production chat KB path is now **Vertex `gemini-embedding-001` @1536 → Firestore `findNearest` (`kb_vectors`) → hybrid RRF → Gemini-Flash rerank → grounded answer with `[n]` citations + abstention.** First reindex: 43 files → 83 chunks, 0 errors. Verified: cited KB facts on a pharmacy question; honest "not in the knowledge base" on an off-KB question. New code: `embeddingService.js`, `kbChunker.js`, `kbRetrieval.js`, `kbIngest.js`, `handleKbReindex` (route `/api/knowledge/reindex`), chat.js wiring + grounding contract, `searchKnowledgeBase` recall-bug fix, `kb_vectors` vector index. Details: [ARCHITECTURE §11a](./ARCHITECTURE.md). **Remaining (next session) is listed at the end of this section.** The analysis that motivated it is preserved below.

**Finding (pre-build).** Production answered KB questions with **live Google Drive keyword search + a hand-rolled TF-IDF** (`functions/src/routes/chat.js` → `driveSearchService.js`). There is **no semantic/vector search on the live path**, the KB is only searched when a **regex keyword gate** matches, coreference is resolved by a **hardcoded drug/pharmacy entity regex**, whole documents (≤8K each) are stuffed into the prompt, and a cold query does live Drive API calls + content extraction (incl. Gemini OCR for binaries) on the chat hot path (≤30 s timeout). Three disconnected retrieval systems coexist (see [ARCHITECTURE §11a](./ARCHITECTURE.md)), one with a post-filter bug that drops valid hits.

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

**Phased plan — status**
- **P0 — ✅ shipped:** `searchKnowledgeBase` recall bug fixed (over-fetch 40 + post-filter, real COSINE score); intent-gate relaxed (vector search runs by default on the Amble tab, keyword gate only guards the live-Drive *fallback*); **chunk** injection (not whole docs); grounding contract + abstention added to the system prompt.
- **P1 — ✅ shipped:** incremental **Drive→`kb_vectors` ingest** (`/api/knowledge/reindex`, per-file `kb_index_state`, resumable); `/api/chat` retrieves via **`findNearest`**; **lexical + RRF fusion**. *(Still on the table: a scheduled trigger, the `department` pre-filter index, and deleting the 2 legacy paths — see Remaining.)*
- **P2 — ✅ shipped:** **Gemini-Flash reranker** (two-stage recall→rerank→top 6 + `MIN_SCORE` floor), **groundedness post-check** (`verifyGroundedness`, borderline-only, fail-open), and an **eval harness** (`scripts/kb_eval.js`, baseline 4/5). *Remaining: grow the eval gold set.*

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

**✅ Shipped 2026-06-14 (this + prior session):**
1. ✅ **Scheduled auto-reindex** — `kbReindexSchedule` (`onSchedule`, **every 6 h**, us-central1) → `reindexKb({full:false})`; `cloudscheduler.googleapis.com` auto-enabled on deploy. Manual rebuild still via `POST /api/knowledge/reindex` (admin token **or** `x-reindex-key`; Hosting caps proxied requests at 60 s so long runs use the Cloud Run URL `https://ssrambleai-2flmqkt55a-uc.a.run.app/...` or small `maxFiles`). `KB_REINDEX_KEY` lives in `.env.local` → `functions/.env` (gitignored, not committed).
2. ✅ **Groundedness post-check** — `kbRetrieval.verifyGroundedness` (Gemini-Flash judge), gated to **borderline confidence (<0.55)** so high-confidence answers stay fast; **fail-open**; appends a verify-caveat when a claim isn't supported. Env `KB_GROUNDEDNESS_CHECK` (default on; `0` disables).
3. ◐ **Eval harness** — `scripts/kb_eval.js` (gold questions → answer-correctness + abstention) — **baseline 4/5**. *Remaining: grow the gold set to 20–30 Qs; optionally add true RAGAS context-recall/faithfulness scoring.*

**🔜 Remaining (next session) — resume here:**
4. **`department` pre-filter index (optional, low priority).** A composite vector index (`kb_vectors`: `department`+`embedding`) would let retrieval `where('department','==',…)` pre-filter. **Decision: intentionally NOT applied to general chat** — the company KB is cross-departmental, so hard-filtering by a user's dept would hurt recall. Only add if a *scoped* KB surface needs it.
5. **Retire the 2 legacy paths + migrate uploads.** Point `useRAG`/`/api/kb/search`/`/api/knowledge/search` at the new pipeline (or delete), and move the user-upload ingest (`handleKnowledgeIngest`) to `gemini-embedding-001` → `kb_vectors` so everything shares one embedding space.
6. **Reranker upgrade (optional).** If the eval shows precision gaps, swap Gemini-Flash rerank for **Cohere Rerank** (Cohere API key as a Cloud secret) or **Vertex Ranking API** (enable Discovery Engine API).
7. **Managed alternative (if we ever want out of the pipeline business):** **Vertex AI Search** + its GA Google Drive connector does crawl/chunk/embed/hybrid/rerank/citations end-to-end — more cost, less control.

**References (current best practice):**
- Firestore vector search + metadata pre-filtering — [Google Cloud blog](https://cloud.google.com/blog/products/databases/get-started-with-firestore-vector-similarity-search), [docs](https://docs.cloud.google.com/firestore/native/docs/vector-search)
- Hybrid search + RRF + two-stage rerank — [Superlinked VectorHub](https://superlinked.com/vectorhub/articles/optimizing-rag-with-hybrid-search-reranking), [RRF explainer (Laforge/Google)](https://glaforge.dev/posts/2026/02/10/advanced-rag-understanding-reciprocal-rank-fusion-in-hybrid-search/)
- Managed options — [Vertex AI Search vs RAG Engine vs Vector Search](https://medium.com/google-cloud/the-gcp-rag-spectrum-vertex-ai-search-rag-engine-and-vector-search-which-one-should-you-use-f56d50720d5a), [Vertex RAG Engine](https://cloud.google.com/blog/products/ai-machine-learning/introducing-vertex-ai-rag-engine)
- Chunking + embedding model choice — [Firecrawl chunking guide](https://www.firecrawl.dev/blog/best-chunking-strategies-rag), [Milvus 2026 embedding benchmark](https://milvus.io/blog/choose-embedding-model-rag-2026.md)

> **Status: ✅ PIPELINE COMPLETE & VERIFIED (P0 + P1 + P2 + auto-refresh + groundedness + eval).** `gemini-embedding-001` @1536 vector RAG live in prod: hybrid RRF → Gemini-Flash rerank → grounded generation + abstention → borderline groundedness post-check, with a 6-hourly incremental auto-reindex and a `scripts/kb_eval.js` regression gate (baseline 4/5). Remaining items 4–7 above are **optional/cleanup** (grow eval set, legacy-path retirement + upload migration, reranker upgrade, managed alternative). KB stays fresh automatically; manual rebuild: `POST <CloudRunURL>/api/knowledge/reindex` with `x-reindex-key`.

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
