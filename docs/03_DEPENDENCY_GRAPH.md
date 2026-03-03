# 03 — Dependency Graph

> **Last updated:** 2025-07-15  
> **Scope:** Import relationships between all modules

---

## Core Import Graph

```
┌─────────────────────────── ENTRY POINTS ───────────────────────────┐
│                                                                     │
│  src/app/page.tsx ──→ AmbleApp.tsx                                  │
│  src/app/embed/page.tsx ──→ EmbedChat.tsx                          │
│  src/app/api/chat/route.ts ──→ (central AI orchestrator)           │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘

AmbleApp.tsx
├── hooks/useAppNavigation
├── hooks/useModelSelection
├── hooks/useProjectState
├── hooks/useAmbleConfig
├── hooks/useAiDictation
├── hooks/useHotkeys
├── components/auth/AuthContextRefactored ──→ services/auth/AuthService
│                                          ──→ hooks/useFirebaseAuth
│                                          ──→ lib/firebase
├── contexts/OrganizationContext ──→ lib/firebase (Firestore)
├── components/layout/Sidebar ──→ components/organization/OrgSwitcher
├── components/layout/PharmacySidebar
├── components/layout/FeatureRouter
│   ├── (lazy) views/DashboardView ──→ components/news/CompanyNewsPanel
│   │                                    └──→ hooks/useCompanyNews ──→ lib/firebase
│   ├── (lazy) chat/ChatInterface ──→ contexts/ChatContextRefactored
│   │                                    ├──→ services/chat/StreamingService
│   │                                    ├──→ services/chat/SearchService
│   │                                    │       ├──→ services/ai/SearchOrchestrator
│   │                                    │       └──→ services/ai/router (MagicRouter)
│   │                                    ├──→ services/chat/SessionService
│   │                                    ├──→ lib/usageManager
│   │                                    └──→ utils/artifactParser
│   ├── (lazy) views/BillingView ──→ hooks/useAiDictation
│   │                             ──→ hooks/useStandardDictation
│   │                             ──→ lib/usageManager
│   │                             ──→ lib/systemPrompt (AMBLE_SYSTEM_PROMPT)
│   ├── (lazy) studio/MediaStudio
│   │   ├── studio/ImageStudio ──→ lib/studio/gemini-service
│   │   ├── studio/VideoStudio ──→ components/veo/*
│   │   │                       ──→ components/gallery/AssetGallery
│   │   └── studio/LiveStudio
│   ├── (lazy) views/KnowledgeBaseView ──→ lib/constants (KB_DRIVE_FOLDER_ID)
│   │                                   ──→ lib/firebase
│   └── (lazy) views/PharmacyView
├── components/layout/GlobalCommandCenter
├── components/ai/CapabilitiesDock ──→ lib/capabilities
└── (lazy) modals/* (Help, ClearData, Profile, UserManagement, ProjectSettings, Confirmation)
```

---

## Server-Side (API Route) Import Graph

```
api/chat/route.ts (1267 lines — the central orchestrator)
├── services/ai/router (MagicRouter)
├── services/ai/rag (RAGService)
├── services/ai/memory (MemoryService)
├── services/ai/tools (TOOLS_DEFINITION, ToolExecutor)
├── services/ai/knowledgeContext (KnowledgeContextService)
├── services/knowledge/index (RAGPipeline, KnowledgeBaseManager)
│   ├── knowledge/RAGPipeline ──→ knowledge/KnowledgeBaseManager
│   │                          ──→ knowledge/EmbeddingService
│   ├── knowledge/KnowledgeBaseManager ──→ knowledge/EmbeddingService
│   │                                  ──→ knowledge/DriveSync
│   │                                       ├──→ knowledge/DocumentProcessor
│   │                                       │       └──→ knowledge/ImageProcessor
│   │                                       └──→ knowledge/EmbeddingService
│   └── knowledge/EmbeddingService (hybrid vector+keyword search)
├── services/knowledge/DriveSearchService
├── lib/validation (Zod schemas)
├── lib/apiError
├── lib/rateLimiter
├── (dynamic) services/ai/agentSystem (globalExecutor)
│   ├── lib/agents/Executor
│   ├── lib/agents/PlannerAgent ──→ services/ai/tools/DelegateTool
│   │                                  └──→ agentSystem (globalExecutor) [circular]
│   ├── lib/agents/ResearcherAgent ──→ services/ai/tools/SearchTool
│   │                               ──→ services/ai/tools/ReadDocumentTool
│   └── lib/agents/CoderAgent
│
│   All agents ──→ lib/agents/BaseAgent ──→ services/ai/modelGateway
│                                              └──→ (calls /api/chat recursively)
└── lib/firebaseAdmin
```

---

## Functions Backend Import Graph

```
functions/index.js (SSR entry)
├── functions/src/routes/index.js (barrel)
│   ├── routes/chat.js ──→ services/driveSearchService
│   │                   ──→ services/intelligentSearch ──→ services/searchService
│   │                   ──→ services/knowledgeService
│   │                   ──→ services/usageService ──→ config/pricing
│   ├── routes/image.js
│   ├── routes/video.js
│   ├── routes/audio.js
│   ├── routes/tools.js ──→ services/searchService
│   ├── routes/gallery.js
│   ├── routes/knowledge.js ──→ services/knowledgeService
│   │                        ──→ services/driveSearchService
│   ├── routes/videoAnalyze.js
│   └── routes/driveSync.js
└── functions/src/utils/helpers.js
```

---

## Service Dependency Matrix

| Service | Depends On | Depended By |
|---------|-----------|-------------|
| **AuthService** | Firebase Auth, Firestore, clientCache | AuthContextRefactored, useFirebaseAuth |
| **SessionService** (auth) | React state | AuthService |
| **ChatContextRefactored** | StreamingService, SearchService, SessionService (chat), UsageManager, artifactParser | ChatInterface, Composer, MessageList, Sidebar |
| **StreamingService** | fetch (pure) | ChatContextRefactored |
| **SearchService** | SearchOrchestrator, MagicRouter, Firebase Auth | ChatContextRefactored |
| **SessionService** (chat) | Firebase Firestore, localStorage | ChatContextRefactored |
| **MagicRouter** | (pure heuristics) | chat/route.ts, SearchService |
| **RAGService** | OpenAI, Firestore | chat/route.ts |
| **MemoryService** | OpenAI, Firestore | chat/route.ts |
| **KnowledgeContextService** | Google Drive API, Gemini | chat/route.ts |
| **RAGPipeline** | KnowledgeBaseManager, OpenAI | chat/route.ts |
| **KnowledgeBaseManager** | EmbeddingService, DriveSync | RAGPipeline, chat/route.ts |
| **EmbeddingService** | OpenAI Embeddings, Firestore | KnowledgeBaseManager, DriveSync |
| **DriveSync** | DocumentProcessor, EmbeddingService, Google Drive API | KnowledgeBaseManager |
| **DocumentProcessor** | pdf-parse, jszip, GPT-4o (images) | DriveSync |
| **DriveSearchService** | Google Drive API, Gemini 2.0 Flash | chat/route.ts |
| **SearchOrchestrator** | KnowledgeBaseIndexer, knowledgeContext | SearchService |
| **KnowledgeBaseIndexer** | IndexedDB, Google Drive API | SearchOrchestrator |
| **ModelGateway** | /api/chat, /api/image (fetch) | BaseAgent |
| **UsageManager** | localStorage, Firestore | ChatContextRefactored, BillingView |
| **CommandRouter** | (pure heuristics) | useAiDictation |
| **RetryQueue** | localStorage | (available but usage unclear) |

---

## Circular / Recursive Dependencies

1. **Agent recursion**: `BaseAgent.run()` → `ModelGateway.generateText()` → `POST /api/chat` → (if agentMode) → `globalExecutor.execute()` → `BaseAgent.run()`. This is intentional but carries stack depth risk.

2. **PlannerAgent delegation**: `PlannerAgent` uses `DelegateTool` → `globalExecutor.execute(ResearcherAgent)` → which itself can call tools. Max depth is bounded by `MAX_STEPS=5` per agent.

3. **SearchService → SearchOrchestrator → /api/tools/search → (server) → searchService (functions)**: Client calls server which calls external APIs. Not circular but multi-hop.

---

## Module Boundary Violations

| Issue | Files | Description |
|-------|-------|-------------|
| **Component imports service directly** | `ChatContextRefactored` → `StreamingService`, `SearchService` | Context layer reaches into service layer (acceptable pattern) |
| **Lib imports from services** | `agentSystem.ts` → `lib/agents/*` | Agent system barrel in services/ imports from lib/ (inverted) |
| **Inline system prompt** | `api/chat/route.ts` | Defines own `ENHANCED_SYSTEM_PROMPT` instead of importing from `lib/systemPrompt.ts` |
| **Duplicate validation** | `lib/validation.ts` + `utils/validation.ts` | Server-side Zod schemas in lib/ + client-side validation in utils/ (intentional split but confusing names) |
