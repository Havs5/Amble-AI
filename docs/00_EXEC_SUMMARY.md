# 00 — Executive Summary

> **Last updated:** 2026-03-24
> **Scope:** Full codebase audit + ongoing maintenance of `amble-ai`

---

## What Is Amble AI?

Amble AI is a **multi-modal AI assistant platform** built for healthcare/pharmacy operations. It combines conversational AI (GPT-5, Gemini 3), knowledge base management (Google Drive + vector embeddings), billing CX tools with configurable policy enforcement, media generation (images via DALL-E/Imagen, video via Sora/Veo), and a multi-agent system — all deployed as a Firebase-hosted SSR application.

**Live URL:** `https://amble-ai.web.app`

---

## Tech Stack at a Glance

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js ^15.0.3 (App Router, SSR) |
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
| ✅ Fixed | **22 dead hook files** deleted in Phase 1 cleanup (July 2025) | ~4,100 lines of dead code removed |
| ✅ Fixed | **CX Policy enforcement** — policies now triple-injected (system prompt top + bottom + user message) | AI drafts respect configured formatting/tone/style policies |
| ✅ Fixed | **Broken handleRewrite** — Make Shorter/Firmer buttons called non-existent `/api/rewrite` | Now correctly uses `/api/chat` with policy pass-through |
| ✅ Fixed | **Debug log pollution** — ~40 console.log statements removed from production code | Cleaner production output |
| ✅ Fixed | **Minimal .gitignore** — expanded to comprehensive ~35-line file | Proper ignore coverage |
| 🔴 High | **Route duplication** — 10 API routes exist in both `functions/src/routes/` and `src/app/api/`; Functions code always wins in prod | Maintenance confusion, divergent logic |
| 🟡 Medium | **System prompt duplication** — `ENHANCED_SYSTEM_PROMPT` defined inline in route.ts AND in `lib/systemPrompt.ts` (not imported) | Drift risk between two copies |
| 🟡 Medium | **Three overlapping RAG systems** — `RAGService` (old), `RAGPipeline` (new), `KnowledgeContextService` (legacy) all run simultaneously | Redundant API calls, higher latency + cost |
| 🟢 Low | **Test-only hooks** — 4 hooks (`useClipboard`, `useDebounce`, `useLocalStorage`, `useMutation`) only used in tests | Mild bundle overhead |

### Metrics

| Metric | Count |
|--------|-------|
| Source files (src/) | ~150 |
| Components | 52 |
| Hooks | 9 active + 4 test-only |
| API Routes (Next.js) | 20 |
| Cloud Function Routes | 17 |
| Services | 33 |
| Lib modules | 18 |
| Test files | 8 |
| Firestore collections | 15+ |

---

## Recommended Actions (Priority Order)

1. **Phase 1 (Safe):** ✅ COMPLETED — Deleted 22 dead hook files, cleaned barrel exports, expanded .gitignore.
2. **CX Policy Fix:** ✅ COMPLETED — Triple-injection strategy for policy enforcement, fixed broken rewrite handler.
3. **Code Cleanup:** ✅ COMPLETED — Removed ~40 debug console.logs, deleted deploy artifacts.
4. **Phase 2 (Medium-risk):** Consolidate system prompts, audit Functions vs Next.js route divergence, prune functions/package.json
5. **Phase 3 (Strategic):** Deprecate legacy KB system, unify RAG paths, remove duplicate API routes

---

## Document Index

| Doc | Title | Contents |
|-----|-------|----------|
| [00](00_EXEC_SUMMARY.md) | Executive Summary | This document |
| [01](01_SYSTEM_OVERVIEW.md) | System Overview | Architecture, tech stack, deployment model |
| [02](02_FILE_TREE_ANNOTATED.md) | Annotated File Tree | Every file with purpose annotation |
| [04](04_DATA_FLOW.md) | Data Flow | Request lifecycle, state management, Firestore schema |
| [05](05_AUTH_AND_SESSION.md) | Auth & Session | Authentication flow, session management, permissions |
| [06](06_AI_PIPELINE.md) | AI Pipeline | Model routing, RAG, agents, tools, streaming |
| [07](07_API_SURFACE.md) | API Surface | All endpoints, request/response schemas |
| [08](08_CONFIG_AND_ENV.md) | Config & Environment | Environment variables, Firebase config, feature flags |
| [09](09_BUILD_DEPLOY_CI.md) | Build & Deploy | Build pipeline, SSR deployment, scripts |
