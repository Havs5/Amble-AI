# Changelog — Amble AI

---

## 2026-03-24 — CX Policy Fix, Code Cleanup & Docs Update

### CX Policy Enforcement Fix
- **Triple-injection strategy** for policy compliance: policies now injected at top of system prompt, bottom of system prompt, AND reinforced in the user message
- `BillingView.tsx` — `handleDraftReply` now builds enhanced user messages that explicitly reference configured policies (format, tone, style)
- `BillingView.tsx` — `handleRewrite` (Make Shorter / Make Firmer) fixed: was calling non-existent `/api/rewrite` endpoint, now correctly uses `/api/chat` with `stream: false` and passes systemPrompt + policies
- `route.ts` — `buildSystemPrompt()` double-injects policies at top and bottom of system context to combat LLM attention dilution

### Debug Log Cleanup
- Removed ~40 `console.log` debug statements from production code across 3 files:
  - `src/app/api/chat/route.ts` — ~30 logs removed
  - `src/components/views/BillingView.tsx` — ~2 logs removed
  - `src/services/knowledge/DriveSearchService.ts` — ~18 logs removed
- Kept all `console.error` statements for real error handling

### Deploy Artifact Cleanup
- Deleted 6 stale deploy/build artifact files from project root
- Updated `.gitignore` with patterns: `deploy_*.txt`, `build_output.log`, `functions/.build_timestamp`

### Documentation Update
- Deleted `docs/10_DEAD_CODE_CANDIDATES.md` — Phase 1 complete, no longer needed
- Deleted `docs/03_DEPENDENCY_GRAPH.md` — Point-in-time import analysis, too granular to maintain
- Rewrote `docs/02_FILE_TREE_ANNOTATED.md` — Full refresh matching current file structure (no more dead hook references)
- Updated `docs/00_EXEC_SUMMARY.md` — Corrected Next.js version, updated metrics and issue tracker
- Updated `docs/01_SYSTEM_OVERVIEW.md` — Corrected version number

### Deployment
- Built and deployed to Firebase: https://amble-ai.web.app
- Pushed to GitHub main: https://github.com/Havs5/Amble-AI.git

---

## 2025-07-15 — Architecture Audit & Phase 1 Dead Code Cleanup

> **Scope:** Full architecture audit, documentation, and Phase 1 dead code cleanup
> **Build verified:** `npm run build` — compiled successfully, 21/21 pages generated, zero errors

---

## Phase 1 Cleanup — COMPLETED

### Files Deleted (22 files, ~4,100 lines of dead code)

Every file below was verified to have **zero imports** by any component, service, context, or page in the codebase. Verification method: `grep` search across all `src/` files for each hook's export names, plus confirmation that the barrel `@/hooks` was not imported by any component.

| # | File | Reason |
|---|------|--------|
| 1 | `src/hooks/useAccessibility.tsx` | Zero imports; 10 exports never used |
| 2 | `src/hooks/useAnalytics.ts` | Zero imports |
| 3 | `src/hooks/useAutoSave.ts` | Zero imports |
| 4 | `src/hooks/useCommandPalette.tsx` | Provider never rendered in component tree |
| 5 | `src/hooks/useConfirm.tsx` | Provider never rendered |
| 6 | `src/hooks/useConnectionStatus.tsx` | Zero imports |
| 7 | `src/hooks/useDraftMessage.ts` | Zero imports |
| 8 | `src/hooks/useFeatureFlags.tsx` | Provider never rendered; permissions used instead |
| 9 | `src/hooks/useIntersectionObserver.ts` | Zero imports |
| 10 | `src/hooks/useKeyboardShortcuts.tsx` | Zero imports; `useHotkeys.ts` used instead |
| 11 | `src/hooks/useLoadingManager.tsx` | Zero imports |
| 12 | `src/hooks/useMessageSearch.tsx` | Zero imports |
| 13 | `src/hooks/useOptimisticUpdate.ts` | Zero imports |
| 14 | `src/hooks/usePolling.ts` | Zero imports |
| 15 | `src/hooks/useResponsive.ts` | Zero imports |
| 16 | `src/hooks/useTheme.tsx` | Provider never rendered; inline theme toggle in Sidebar |
| 17 | `src/hooks/useToast.tsx` | Provider never rendered; separate Toast.tsx component |
| 18 | `src/hooks/useUndoRedo.ts` | Zero imports |
| 19 | `src/hooks/useVirtualList.tsx` | Zero imports |
| 20 | `src/hooks/chat/useMessages.ts` | Superseded by ChatContextRefactored → StreamingService |
| 21 | `src/hooks/chat/useSessions.ts` | Superseded by ChatContextRefactored → SessionService |
| 22 | `src/hooks/chat/useStreaming.ts` | Superseded by ChatContextRefactored → StreamingService |

### Files Modified (3 files)

#### `src/hooks/index.ts` — Barrel export cleanup
- **Before:** 202 lines exporting all 36 hooks (including 19 dead ones)
- **After:** ~55 lines exporting only 4 utility hooks: `useDebounce`, `useLocalStorage`, `useClipboard`, `useMutation`
- **Kept hooks** (imported by active components, not exported from barrel): `useAiDictation`, `useAmbleConfig`, `useAppNavigation`, `useCompanyNews`, `useFirebaseAuth`, `useHotkeys`, `useModelSelection`, `useProjectState`, `useStandardDictation`

#### `src/hooks/chat/index.ts` — Chat barrel cleanup
- **Before:** 18 lines exporting `useMessages`, `useSessions`, `useStreaming` + type re-exports
- **After:** Type re-exports only (from `services/chat/types`)

#### `.gitignore` — Comprehensive ignore rules
- **Before:** 2 lines (just `amble-kb-sync-key.json`)
- **After:** ~35 lines covering: `node_modules/`, `.next/`, `.env*`, build outputs, IDE files, OS files, logs, coverage, functions build artifacts

### False Alarm Corrected

- **`jest.config.js`** — Initial analysis flagged `setupFilesAfterEnv` as a typo (`setupFilesAfterEnup`). Manual inspection confirmed the file contains the **correct** Jest config key `setupFilesAfterEnv`. No fix needed.

---

## Documentation Created (11 files, later reduced to 9)

| File | Title | Size |
|------|-------|------|
| `docs/00_EXEC_SUMMARY.md` | Executive Summary | Key findings, metrics, action plan |
| `docs/01_SYSTEM_OVERVIEW.md` | System Overview | Architecture, tech stack, Firestore schema |
| `docs/02_FILE_TREE_ANNOTATED.md` | Annotated File Tree | Every file with status annotation |
| ~~`docs/03_DEPENDENCY_GRAPH.md`~~ | ~~Dependency Graph~~ | Deleted March 2026 (stale, too granular) |
| `docs/04_DATA_FLOW.md` | Data Flow | Message lifecycle, state management, caching |
| `docs/05_AUTH_AND_SESSION.md` | Auth & Session | Auth flow, permissions, security observations |
| `docs/06_AI_PIPELINE.md` | AI Pipeline | Model routing, RAG, agents, tools, streaming |
| `docs/07_API_SURFACE.md` | API Surface | All endpoints, route duplication analysis |
| `docs/08_CONFIG_AND_ENV.md` | Config & Environment | Env vars, build config, feature flags |
| `docs/09_BUILD_DEPLOY_CI.md` | Build & Deploy | Deploy pipeline, hosting architecture |
| ~~`docs/10_DEAD_CODE_CANDIDATES.md`~~ | ~~Dead Code Candidates~~ | Deleted March 2026 (Phase 1 complete) |

---

## Safety Baseline

- Git repository initialized with `git init`
- All files committed as baseline before any deletions
- Build verified clean before AND after Phase 1 cleanup

---

## Remaining Work (Future Phases)

### Phase 2 — Medium-Risk Improvements
- [ ] Consolidate system prompts (inline `ENHANCED_SYSTEM_PROMPT` in route.ts vs `lib/systemPrompt.ts`)
- [ ] Audit Functions vs Next.js route divergence (10 duplicated routes)
- [ ] Prune `functions/package.json` unnecessary client-side deps (`lucide-react`, `framer-motion`, etc.)
- [ ] Add authentication to admin API routes (`/api/admin/fix-duplicates`, `/api/admin/restore-users`)

### Phase 3 — Strategic Refactoring
- [ ] Deprecate legacy `KnowledgeContextService` (folder-map based)
- [ ] Deprecate `RAGService` if no projects actively use project-scoped RAG
- [ ] Unify RAG paths to single `RAGPipeline` (vector KB)
- [ ] Remove Next.js duplicate API routes; standardize on Functions
- [ ] Set up CI/CD pipeline (currently manual `firebase deploy`)

---

## Impact Summary

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Hook files | 37 | 15 | -22 files |
| Estimated dead LOC | ~4,100 | 0 | -4,100 lines |
| .gitignore entries | 2 | ~35 | +33 rules |
| Documentation files | 0 | 12 | +12 docs |
| Build status | ✅ | ✅ | No regressions |
