# 10 — Dead Code Candidates

> **Last updated:** 2025-07-15  
> **Scope:** Evidence-based inventory of unused code with import analysis  
> **Methodology:** Searched all `src/` files for import references to each candidate

---

## Summary

| Category | Files | Estimated LOC | Risk Level | Action |
|----------|-------|--------------|------------|--------|
| Dead hooks (zero imports) | 21 | ~3,500 | 🟢 Safe to delete | Phase 1 |
| Dead chat hooks (superseded) | 3 | ~600 | 🟢 Safe to delete | Phase 1 |
| Test-only hooks (no runtime use) | 4 | ~800 | 🟡 Keep (tests use them) | No action |
| Duplicate system prompt | 1 (partial) | ~50 | 🟡 Consolidate | Phase 2 |
| jest.config.js typo | 1 | 1 line | 🟢 Safe to fix | Phase 1 |
| Minimal .gitignore | 1 | — | 🟢 Safe to fix | Phase 1 |
| **Total removable** | **24 files** | **~4,100 LOC** | | |

---

## Phase 1: Safe Deletions (Zero Risk)

### Dead Hooks — Never imported by any component, service, or context

Each file below was verified by searching ALL of `src/` for any import of its exports. Only the file's own tests (if any) import it.

| # | File | Exports | LOC (est.) | Evidence |
|---|------|---------|-----------|----------|
| 1 | `src/hooks/useAccessibility.tsx` | `useAnnounce`, `useFocusTrap`, `useFocusRestore`, `useReducedMotion`, `useHighContrast`, `useRovingTabIndex`, `useSkipLinks`, `useId`, `useAriaDescribedBy`, `useChatAccessibility` | ~250 | Zero imports found in `src/components/`, `src/contexts/`, `src/app/` |
| 2 | `src/hooks/useAnalytics.ts` | `useAnalytics`, `trackEvent`, `flushAnalytics`, `getAnalyticsSummary` | ~150 | Zero imports found |
| 3 | `src/hooks/useAutoSave.ts` | `useAutoSave` | ~80 | Zero imports found |
| 4 | `src/hooks/useCommandPalette.tsx` | `CommandPaletteProvider`, `useCommandPalette`, `useCommand` | ~200 | Provider never rendered in component tree |
| 5 | `src/hooks/useConfirm.tsx` | `ConfirmProvider`, `useConfirm` | ~120 | Provider never rendered in component tree |
| 6 | `src/hooks/useConnectionStatus.tsx` | `useConnectionStatus`, `ConnectionStatusBanner` | ~100 | Zero imports found |
| 7 | `src/hooks/useDraftMessage.ts` | `useDraftMessage`, `getDraftCount`, `clearAllDrafts` | ~100 | Zero imports found |
| 8 | `src/hooks/useFeatureFlags.tsx` | `FeatureFlagProvider`, `useFeatureFlags`, `useFeature`, `Feature`, `DEFAULT_FLAGS` | ~200 | Provider never rendered; permissions used instead |
| 9 | `src/hooks/useIntersectionObserver.ts` | `useIntersectionObserver`, `useInfiniteScroll`, `useLazyLoad`, `useOnScreen`, `useScrollDirection`, `useScrollPosition`, `useScrollToBottom` | ~250 | Zero imports found |
| 10 | `src/hooks/useKeyboardShortcuts.tsx` | `useKeyboardShortcuts`, `useChatShortcuts`, `DEFAULT_CHAT_SHORTCUTS` | ~200 | Zero imports found; `useHotkeys.ts` is used instead |
| 11 | `src/hooks/useLoadingManager.tsx` | `useLoadingManager` | ~80 | Zero imports found |
| 12 | `src/hooks/useMessageSearch.tsx` | `useMessageSearch`, `highlightMatches`, `MessageSearchBar` | ~200 | Zero imports found |
| 13 | `src/hooks/useOptimisticUpdate.ts` | `useOptimisticUpdate`, `useOptimisticValue` | ~100 | Zero imports found |
| 14 | `src/hooks/usePolling.ts` | `usePolling`, `useSWRPolling`, `useConditionalPolling`, `useLongPolling` | ~200 | Zero imports found |
| 15 | `src/hooks/useResponsive.ts` | `useMediaQuery`, `useBreakpoint`, `useResponsive`, `useWindowSize`, `usePrefersDark`, `useResponsiveValue`, `BREAKPOINTS` | ~200 | Zero imports found |
| 16 | `src/hooks/useTheme.tsx` | `ThemeProvider`, `useTheme`, `useIsDarkMode`, `useThemeColor`, `useThemeToggle`, `ThemeSelector`, `AccentColorPicker`, `themeScript`, `ACCENT_PRESETS` | ~300 | Provider never rendered; inline theme toggle exists in Sidebar |
| 17 | `src/hooks/useToast.tsx` | `ToastProvider`, `useToast` | ~150 | Provider never rendered; `Toast.tsx` component is separate |
| 18 | `src/hooks/useUndoRedo.ts` | `useUndoRedo`, `useUndoRedoReducer`, `createSnapshot` | ~150 | Zero imports found |
| 19 | `src/hooks/useVirtualList.tsx` | `useVirtualList`, `useVirtualMessages`, `useDynamicHeight`, `useWindowVirtualList` | ~250 | Zero imports found |

### Dead Chat Hooks — Superseded by direct service usage in ChatContextRefactored

| # | File | Was Replaced By | Evidence |
|---|------|----------------|----------|
| 20 | `src/hooks/chat/useMessages.ts` | `ChatContextRefactored.tsx` uses `StreamingService` + `SearchService` directly | Referenced in comments only |
| 21 | `src/hooks/chat/useSessions.ts` | `ChatContextRefactored.tsx` uses `SessionService` directly | Referenced in comments only |
| 22 | `src/hooks/chat/useStreaming.ts` | `ChatContextRefactored.tsx` uses `StreamingService` directly | Zero functional imports |

### Config Fixes

| # | File | Issue | Fix |
|---|------|-------|-----|
| ~~23~~ | `jest.config.js` | ~~`setupFilesAfterEnup` (typo)~~ — **FALSE ALARM**: actual value is `setupFilesAfterEnv` (correct Jest key) | No fix needed |
| ~~24~~ | `.gitignore` | ✅ **FIXED** — Was only 2 lines; now expanded to comprehensive 35-line file | Done in Phase 1 |

---

## Phase 2: Medium-Risk Improvements

### System Prompt Duplication

| File | Prompt | Used By | Action |
|------|--------|---------|--------|
| `src/app/api/chat/route.ts` | Inline `ENHANCED_SYSTEM_PROMPT` (~2000 chars) | Chat API (always) | Keep as source of truth OR refactor |
| `src/lib/systemPrompt.ts` | `AMBLE_ENHANCED_SYSTEM_PROMPT` (similar but different) | `useAmbleConfig` hook | Align with route.ts version or import from shared location |
| `src/lib/systemPrompt.ts` | `AMBLE_SYSTEM_PROMPT` | `BillingView.tsx` (billing CX) | Keep (different purpose) |

**Recommendation:** Extract route.ts inline prompt to `lib/systemPrompt.ts` and import from there. Currently they may drift.

### Functions `package.json` — Potentially Unnecessary Dependencies

| Package | Reason to Suspect | Size Impact |
|---------|------------------|-------------|
| `lucide-react` | Client-side icon library; SSR shouldn't need it | ~50KB |
| `markdown-it` | Client-side rendering; SSR may not use it | ~30KB |
| `framer-motion` | Client-side animations | ~100KB |
| `highlight.js` | Syntax highlighting | ~200KB |

**Note:** These may be tree-shaken by Next.js. Verify via bundle analysis (`npm run analyze`) before removing.

---

## Phase 3: Strategic Refactoring (Future)

### Overlapping Knowledge Systems

| System | Status | Recommendation |
|--------|--------|---------------|
| `RAGService` (`services/ai/rag.ts`) | Legacy (project-scoped) | Deprecate if no projects use it; 160 LOC |
| `KnowledgeContextService` (`services/ai/knowledgeContext.ts`) | Legacy (folder-map) | Deprecate once vector KB is fully synced; 803 LOC |
| `KnowledgeBaseIndexer` (`services/ai/KnowledgeBaseIndexer.ts`) | Client-side fallback | May be redundant with server vector search; 601 LOC |
| `SearchOrchestrator` (`services/ai/SearchOrchestrator.ts`) | Client-side | Partially redundant with server search; 727 LOC |

**Total potential savings:** ~2,291 LOC across 4 files (requires migration validation)

### Route Duplication

10 API routes exist in both `functions/src/routes/` and `src/app/api/`. The Functions versions always run in production. Options:
1. **Accept dual maintenance** (current approach — Next.js routes only used in local dev)
2. **Remove Next.js duplicates** and adjust local dev to use Functions emulator
3. **Remove Functions routes** and let all requests fall through to Next.js SSR

**Recommendation:** Option 1 is safest short-term. Option 2 reduces maintenance burden.

---

## Deletion Checklist (Phase 1) — ✅ COMPLETED

All items verified and executed:

- [x] Verify it is NOT imported (grep search across all `src/` — confirmed zero component imports)
- [x] Verify it has NO side effects at module scope (all are React hooks, no top-level side effects)
- [x] Verify build still passes after deletion (`npm run build` — compiled successfully, 21/21 pages generated)
- [x] Git commit state recorded as baseline
- [x] Barrel exports cleaned (`hooks/index.ts` and `hooks/chat/index.ts` updated)
- [x] `.gitignore` expanded to comprehensive 35-line file

### Files Deleted (Phase 1) — 22 files, ~4,100 lines of dead code removed

```
✅ DELETED src/hooks/useAccessibility.tsx
✅ DELETED src/hooks/useAnalytics.ts
✅ DELETED src/hooks/useAutoSave.ts
✅ DELETED src/hooks/useCommandPalette.tsx
✅ DELETED src/hooks/useConfirm.tsx
✅ DELETED src/hooks/useConnectionStatus.tsx
✅ DELETED src/hooks/useDraftMessage.ts
✅ DELETED src/hooks/useFeatureFlags.tsx
✅ DELETED src/hooks/useIntersectionObserver.ts
✅ DELETED src/hooks/useKeyboardShortcuts.tsx
✅ DELETED src/hooks/useLoadingManager.tsx
✅ DELETED src/hooks/useMessageSearch.tsx
✅ DELETED src/hooks/useOptimisticUpdate.ts
✅ DELETED src/hooks/usePolling.ts
✅ DELETED src/hooks/useResponsive.ts
✅ DELETED src/hooks/useTheme.tsx
✅ DELETED src/hooks/useToast.tsx
✅ DELETED src/hooks/useUndoRedo.ts
✅ DELETED src/hooks/useVirtualList.tsx
✅ DELETED src/hooks/chat/useMessages.ts
✅ DELETED src/hooks/chat/useSessions.ts
✅ DELETED src/hooks/chat/useStreaming.ts
```

**Build verified clean after all deletions.**
