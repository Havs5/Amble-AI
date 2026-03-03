# 00 — Executive Summary

> **Last updated:** 2025-07-15  
> **Scope:** Full codebase audit of `amble-ai`  
> **Author:** Automated Architecture Review

---

## What Is Amble AI?

Amble AI is a **multi-modal AI assistant platform** built for healthcare/pharmacy operations. It combines conversational AI (GPT-5, Gemini 3), knowledge base management (Google Drive + vector embeddings), billing CX tools, media generation (images via DALL-E/Imagen, video via Sora/Veo), and a multi-agent system — all deployed as a Firebase-hosted SSR application.

**Live URL:** `https://amble-ai.web.app`

---

## Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 15.5.9 (App Router, SSR) |
| **UI** | React 18.3.1, TypeScript 5, Tailwind CSS v4 |
| **Backend** | Firebase Cloud Functions v2 (Node 22) |
| **Database** | Firestore (vector indexes, composite indexes) |
| **Auth** | Firebase Auth (Email/Password + Google OAuth) |
| **AI Models** | OpenAI GPT-5 series, o3/o4-mini, Gemini 3-series, Gemini 2.5-series |
| **KB/RAG** | OpenAI embeddings (1536-dim), Firestore vector search, Google Drive sync |
| **Media** | DALL-E 3/4, Imagen 3, Sora, Veo |
| **Hosting** | Firebase Hosting with SSR rewrite to Cloud Function |

---

## Key Findings

### Architecture Strengths
1. **Robust AI pipeline** — MagicRouter auto-selects models by complexity tier, with automatic Gemini→GPT fallback on errors.
2. **Deep knowledge integration** — 4 parallel context sources (Memory, RAG, Vector KB, Legacy KB) with Drive search fallback.
3. **Multi-agent system** — PlannerAgent orchestrates ResearcherAgent and CoderAgent via tool-based delegation.
4. **Production-ready streaming** — SSE with batched UI updates, trace events for real-time status, abort support.
5. **Comprehensive type safety** — Zod validation on API boundaries, TypeScript strict mode throughout.

### Issues Found

| Severity | Issue | Impact |
|----------|-------|--------|
| ✅ Fixed | ~~**21 dead hook files**~~ (of 36 total) — 22 dead hook files deleted in Phase 1 cleanup | ~4,100 lines of dead code removed |
| 🔴 High | **Route duplication** — 10 API routes exist in both `functions/src/routes/` and `src/app/api/`; Functions code always wins in prod | Maintenance confusion, divergent logic |
| 🟡 Medium | **System prompt duplication** — `ENHANCED_SYSTEM_PROMPT` defined inline in route.ts AND in `lib/systemPrompt.ts` (not imported) | Drift risk between two copies |
| ✅ Fixed | ~~**jest.config.js typo**~~ — was initially flagged but `setupFilesAfterEnv` is correct | No issue (false alarm) |
| ✅ Fixed | ~~**Minimal .gitignore**~~ — expanded to comprehensive 35-line .gitignore | Fixed in Phase 1 cleanup |
| 🟡 Medium | **Three overlapping RAG systems** — `RAGService` (old), `RAGPipeline` (new), `KnowledgeContextService` (legacy) all run simultaneously | Redundant API calls, higher latency + cost |
| 🟢 Low | **Test-only hooks** — 4 hooks (`useClipboard`, `useDebounce`, `useLocalStorage`, `useMutation`) only used in tests | Mild bundle overhead |
| 🟢 Low | **Unused functions/ deps** — `lucide-react`, `markdown-it` in functions/package.json unlikely needed for SSR | Larger function deployment |

### Metrics

| Metric | Count |
|--------|-------|
| Source files (src/) | ~170 |
| Components | 55 |
| Hooks | 15 active (22 dead hooks deleted in Phase 1) |
| API Routes (Next.js) | 19 |
| Cloud Function Routes | 17 |
| Services | 33 |
| Lib modules | 23 |
| Test files | 8 |
| Firestore collections | 15+ |
| Dead code files removed | 22 hooks (Phase 1 complete) |
| Dead LOC removed | ~4,100 |

---

## Recommended Actions (Priority Order)

1. **Phase 1 (Safe):** ✅ COMPLETED — Deleted 22 dead hook files, cleaned barrel exports, expanded .gitignore. Build verified clean.
2. **Phase 2 (Medium-risk):** Consolidate system prompts, audit Functions vs Next.js route divergence, prune functions/package.json
3. **Phase 3 (Strategic):** Deprecate legacy KB system, unify RAG paths, remove duplicate API routes

---

## Document Index

| Doc | Title | Contents |
|-----|-------|----------|
| [00](00_EXEC_SUMMARY.md) | Executive Summary | This document |
| [01](01_SYSTEM_OVERVIEW.md) | System Overview | Architecture, tech stack, deployment model |
| [02](02_FILE_TREE_ANNOTATED.md) | Annotated File Tree | Every file with purpose annotation |
| [03](03_DEPENDENCY_GRAPH.md) | Dependency Graph | Import relationships, module boundaries |
| [04](04_DATA_FLOW.md) | Data Flow | Request lifecycle, state management, Firestore schema |
| [05](05_AUTH_AND_SESSION.md) | Auth & Session | Authentication flow, session management, permissions |
| [06](06_AI_PIPELINE.md) | AI Pipeline | Model routing, RAG, agents, tools, streaming |
| [07](07_API_SURFACE.md) | API Surface | All endpoints, request/response schemas |
| [08](08_CONFIG_AND_ENV.md) | Config & Environment | Environment variables, Firebase config, feature flags |
| [09](09_BUILD_DEPLOY_CI.md) | Build & Deploy | Build pipeline, SSR deployment, scripts |
| [10](10_DEAD_CODE_CANDIDATES.md) | Dead Code Candidates | Evidence-based unused code inventory |
