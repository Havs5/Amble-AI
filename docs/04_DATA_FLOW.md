# 04 — Data Flow

> **Last updated:** 2025-07-15  
> **Scope:** Request lifecycles, state management, Firestore schema

---

## Chat Message Lifecycle (End-to-End)

```
User types message → Composer.tsx
    │
    ▼
ChatContextRefactored.sendMessage(content, attachments, mode)
    │
    ├─1. Auto-create session if none exists
    │     → SessionService.create() → Firestore `chats/{sessionId}`
    │
    ├─2. Add optimistic user message to state
    │
    ├─3. SearchService.analyzeQuery(query, capabilities)
    │     → Keyword-based intent detection (KB vs web)
    │     → Returns: { shouldSearch, searchType, intent }
    │
    ├─4. SearchService.search(query, decision, history)
    │     ├── Vector KB: POST /api/knowledge/search
    │     │     → (Functions intercepts) → knowledgeService.searchKnowledgeBase()
    │     │     → OpenAI embedding → Firestore findNearest → top 5 results
    │     └── Web: SearchOrchestrator.search()
    │           → KBIndexer local search → /api/tools/search → Google/Tavily
    │
    ├─5. Inject search context as system message
    │
    ├─6. StreamingService.stream({ messages, model, stream: true, ... })
    │     │
    │     ▼
    │     POST /api/chat (SSE)
    │     │
    │     ├── (Functions ROUTES[] intercept in prod)
    │     │   functions/src/routes/chat.js
    │     │   ├── Model normalization + RAG injection
    │     │   ├── Company KB: searchDriveWithServiceAccount()
    │     │   ├── Auto web search: intelligentSearch()
    │     │   ├── Build system prompt with KB context
    │     │   └── Route to Gemini or OpenAI streaming
    │     │
    │     ├── (Next.js route in local dev)
    │     │   src/app/api/chat/route.ts
    │     │   ├── Rate limit check
    │     │   ├── Validate via ChatRequestSchema (Zod)
    │     │   ├── Agent mode? → globalExecutor.execute()
    │     │   ├── MagicRouter.detectComplexity() → model recommendation
    │     │   ├── fetchContextParallel():
    │     │   │   ├── MemoryService.retrieveRelevantMemories()
    │     │   │   ├── RAGService.retrieveContext() (project RAG)
    │     │   │   ├── RAGPipeline.quickSearch() (vector KB)
    │     │   │   └── KnowledgeContextService.getContextForQuery() (legacy KB)
    │     │   ├── buildSystemPrompt() (inline ENHANCED_SYSTEM_PROMPT + context)
    │     │   ├── determineWebSearch()
    │     │   └── processStream():
    │     │       ├── Emit trace events (SSE) for each context phase
    │     │       ├── Google: generateContentStream → auto-fallback to GPT
    │     │       └── OpenAI: Agentic tool loop (max 5 turns)
    │     │           ├── Stream deltas → accumulate tool_calls
    │     │           ├── ToolExecutor.execute() for server tools
    │     │           └── Re-prompt with tool results
    │     │
    │     ▼
    │     SSE chunks arrive at StreamingService
    │     ├── 50ms batched flushes to onChunk callback
    │     ├── Trace events → thinkingStatus + traceEvents state
    │     ├── Usage metadata → token tracking
    │     └── [DONE] sentinel
    │
    ├─7. Parse artifacts: artifactParser.parseArtifacts(response)
    │     → Extract code blocks as Artifact objects
    │
    ├─8. Track usage: UsageManager.trackUsage(model, tokens)
    │     → localStorage + Firestore usage_logs
    │
    ├─9. Auto-generate title for new sessions
    │     → GPT call with first message → SessionService.updateTitle()
    │
    └─10. Save messages: SessionService.saveMessages() → Firestore + localStorage
```

---

## Knowledge Base Sync Pipeline

```
User clicks "Sync" in KnowledgeBaseView
    │
    ▼
KnowledgeBaseManager.triggerSync()
    │
    ▼
DriveSync.syncFolder({ folderId, accessToken })
    │
    ├─1. Authenticate (service account or OAuth token)
    ├─2. Load sync state from Firestore `kb_sync_state`
    ├─3. listAllFiles() — recursive Drive folder traversal
    │     └── Change tracking (modified-after filter)
    │
    ├─4. For each file (batch of 10):
    │     ├── downloadFile() — Google export for Workspace, raw for others
    │     ├── DocumentProcessor.extractContentWithImages()
    │     │     ├── PDF → pdf-parse
    │     │     ├── DOCX/XLSX → jszip extraction
    │     │     ├── Images → GPT-4o vision
    │     │     └── Google Docs/Sheets → text
    │     ├── DocumentProcessor.classifyDocument()
    │     │     → Auto-detect: department, pharmacy, product, category
    │     ├── DocumentProcessor.createChunks()
    │     │     → 1000 chars, 200 overlap, heading-aware splitting
    │     └── EmbeddingService.storeChunk()
    │           → OpenAI text-embedding-3-small (1536-dim) → Firestore `kb_chunks`
    │
    ├─5. Save document record → Firestore `kb_documents`
    └─6. Update sync state → Firestore `kb_sync_state`
```

---

## Authentication Flow

```
┌─────── Email/Password ───────┐     ┌─────── Google OAuth ──────────────┐
│                               │     │                                    │
│ LoginRefactored.tsx           │     │ LoginRefactored.tsx                │
│ → signInWithEmail()           │     │ → signInWithGoogle()               │
│ → Firebase Auth               │     │ → Firebase Auth (popup)            │
│                               │     │ → Pre-registration check           │
│                               │     │ → Store Drive access token         │
│                               │     │ → Trigger KB sync                  │
└───────────┬───────────────────┘     └─────────────┬──────────────────────┘
            │                                        │
            ▼                                        ▼
     ┌──────────────────────────────────────────────────┐
     │ AuthService.initialize()                          │
     │ → onAuthStateChanged listener                     │
     │ → syncUserWithFirestore()                         │
     │   ├── Cache-first lookup (clientCache)            │
     │   └── Firestore `users` / `users_by_uid`         │
     │ → createSession() (12h inactivity + 12h max)     │
     │ → Schedule token refresh (50min intervals)        │
     │ → Start periodic session validation               │
     └──────────────┬───────────────────────────────────┘
                    │
                    ▼
     ┌──────────────────────────────────────────────────┐
     │ AuthContextRefactored (React Context)             │
     │ → Provides: user, isAuthenticated, permissions    │
     │ → All components consume via useAuth()            │
     └──────────────────────────────────────────────────┘
```

---

## State Management Architecture

### Client State (React)

| State Container | Scope | Persistence | Key Data |
|----------------|-------|-------------|----------|
| `AuthContextRefactored` | Global | Firebase Auth + Firestore + localStorage | user, session, permissions, capabilities |
| `ChatContextRefactored` | Per ChatInterface mount | Firestore + localStorage | sessions, messages, artifacts, streaming state |
| `OrganizationContext` | Global | Firestore | organizations, currentOrg, userRole |
| `useAppNavigation` | Global (hook) | None (in-memory) | activeView, sidebarOpen, modals |
| `useModelSelection` | Global (hook) | None (in-memory) | provider, model, reasoning mode |
| `useProjectState` | Per project | Firestore | project config, chat sessions |
| `useCompanyNews` | Per mount | Firestore (real-time) | news posts, filters |

### Server State (Firestore)

```
Firestore
├── users/{email}                    # User profile, permissions, capabilities, aiConfig
│   └── memories/{memoryId}         # User memory facts (AI-extracted)
├── users_by_uid/{uid}              # UID→email index
├── chats/{sessionId}               # Chat sessions (title, ownerId, messages, tags, visibility)
├── knowledge/{docId}               # Legacy knowledge documents (with vector embedding)
├── knowledge_vectors/{vectorId}    # Legacy vector embeddings
├── kb_documents/{docId}            # Synced Drive documents (name, path, category, department)
├── kb_chunks/{chunkId}             # Document chunks (content, embedding[], documentId)
├── kb_sync_state/{stateId}         # Sync progress (status, last sync, counts)
├── kb_content_cache/{cacheId}      # Cached Drive file content (24h TTL)
├── kb_articles/{articleId}         # KB articles (status, publishedAt)
├── generated_assets/{assetId}      # Generated images/videos (userId, type, url, prompt)
├── news_posts/{postId}             # Company news (title, body, priority, pinned, visibility)
├── news_audit/{auditId}            # News change audit trail
├── usage_logs/{logId}              # Token usage records (userId, model, tokens, cost)
├── organizations/{orgId}           # Organization definitions
├── org_members/{memberId}          # Org membership records
├── google_drive_tokens/{userId}    # OAuth refresh tokens for Drive access
└── documents/{docId}               # Project documents (for agent ReadDocumentTool)
    └── chunks/{chunkId}           # Project document chunks
```

### Caching Layers

| Layer | Location | TTL | Purpose |
|-------|----------|-----|---------|
| **clientCache** | localStorage | 5min–24h | User profile, settings, usage stats, chat list |
| **SemanticCache** | localStorage | 24h | AI response deduplication (Jaccard similarity ≥0.85) |
| **MemoryService cache** | In-memory Map | 5min | User memories |
| **RAGService cache** | In-memory Map | 2min | RAG context results |
| **EmbeddingService cache** | In-memory Map | 30min | Generated embeddings |
| **KBIndexer** | IndexedDB | 1h per folder | Client-side KB index |
| **kb_content_cache** | Firestore | 24h | Drive file content (server-side) |
| **Drive folder IDs** | In-memory | 10min | driveSearchService subfolder resolution |

---

## Image/Video Generation Flow

```
User submits prompt in Studio
    │
    ├── ImageStudio: POST /api/image
    │     → (Functions) handleImage()
    │     ├── Imagen 3 (Gemini) OR DALL-E 3 (OpenAI)
    │     ├── Save to Firebase Storage `generated_images/`
    │     ├── Record in Firestore `generated_assets`
    │     └── Return base64 + metadata
    │
    └── VideoStudio: POST /api/veo
          → (Functions) handleVideo()
          ├── Sora (OpenAI): Create job → poll (up to 9 min) → upload
          └── Veo (Google): generateVideos → poll operation → fetch → upload
          ├── Save to Firebase Storage
          ├── Record in Firestore `generated_assets`
          └── Return URL + metadata
```

---

## Billing CX Draft Flow

```
Agent enters patient chat + verified notes
    │
    ▼
BillingView: "Draft Reply" button
    │
    ├── Constructs system prompt (AMBLE_SYSTEM_PROMPT from lib/systemPrompt.ts)
    ├── Injects: patient chat, agent notes, AI-detected notes
    ├── Optional: PII redaction (SSN, phone, email, dates, cards)
    │
    ▼
POST /api/chat (stream: true)
    │
    ▼
Streams draft response into BillingView
    │
    ├── "Rewrite" options: Shorter / Firmer
    │     → POST /api/rewrite (Functions-only route)
    │     → GPT-4o-mini rewrites the draft
    │
    └── Export: Copy to clipboard / Download PDF
          → @react-pdf/renderer (dynamic import)
```
