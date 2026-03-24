# 02 — Annotated File Tree

> **Last updated:** 2026-03-24
> **Legend:** 🟢 Active | 🟡 Test-only | ⚙️ Config

---

```
amble-ai/
│
├── ⚙️ .env.local                          # Environment variables (secrets, Firebase config)
├── ⚙️ .gitignore                           # Comprehensive ignore rules (~35 lines)
├── ⚙️ amble-kb-sync-key.json              # Google service account key for KB sync
├── ⚙️ firebase.json                        # Firebase Hosting + Functions + Firestore config
├── ⚙️ firestore.indexes.json              # 8 Firestore indexes (vector, composite)
├── ⚙️ firestore.rules                     # Security rules for 10 collections
├── ⚙️ jest.config.js                      # Jest config (setupFilesAfterEnv)
├── ⚙️ jest.setup.js                       # Test mocks (Firebase, localStorage, streams)
├── ⚙️ next-env.d.ts                       # Next.js TypeScript declarations
├── ⚙️ next.config.js                      # Next.js config (bundle analyzer, serverActions, headers)
├── ⚙️ package.json                        # 28 deps + 14 devDeps, scripts: dev/build/deploy/test
├── ⚙️ postcss.config.mjs                  # Tailwind CSS v4 PostCSS plugin
├── ⚙️ storage.rules                       # Firebase Storage security rules
├── ⚙️ tsconfig.json                       # TS strict mode, @/* path alias
│
├── 📄 docs/                                # Architecture documentation (9 files)
│
├── scripts/
│   ├── 🟢 clean_public_next.js             # Removes public/_next (pre-build cleanup)
│   ├── 🟢 deploy_ssr.js                    # Full SSR deployment pipeline (build → copy → deploy)
│   └── 🟢 seed_news.js                     # Seeds sample news_posts to Firestore
│
├── public/                                  # Static assets (served by Firebase Hosting CDN)
│   └── favicon.ico, favicon.svg, manifest.json
│
├── functions/                               # ── Cloud Functions Backend ──
│   ├── ⚙️ package.json                     # Node 22, mirrors main deps
│   ├── 🟢 index.js                         # SSR entry: ssrambleai Cloud Function v2
│   └── src/
│       ├── config/
│       │   └── 🟢 pricing.js               # Per-model token pricing table
│       ├── routes/
│       │   ├── 🟢 index.js                 # Barrel export for all route handlers
│       │   ├── 🟢 chat.js                  # POST /api/chat — Chat completions
│       │   ├── 🟢 image.js                 # POST /api/image — DALL-E/Imagen generation
│       │   ├── 🟢 video.js                 # POST /api/veo — Sora/Veo generation
│       │   ├── 🟢 audio.js                 # POST /api/transcribe, /api/audio/speech
│       │   ├── 🟢 tools.js                 # POST /api/tools/search, /api/tools/extract
│       │   ├── 🟢 gallery.js               # GET/DELETE /api/gallery
│       │   ├── 🟢 knowledge.js             # POST /api/knowledge/ingest, /kb/search
│       │   ├── 🟢 videoAnalyze.js          # POST /api/video/analyze — Gemini video analysis
│       │   └── 🟢 driveSync.js             # POST /api/knowledge/drive-sync
│       ├── services/
│       │   ├── 🟢 driveSearchService.js    # Google Drive search via service account
│       │   ├── 🟢 intelligentSearch.js     # Multi-source web search orchestration
│       │   ├── 🟢 knowledgeService.js      # Vector nearest-neighbor search
│       │   ├── 🟢 searchService.js         # Google/Tavily/DuckDuckGo search
│       │   └── 🟢 usageService.js          # Token usage logging to Firestore
│       └── utils/
│           └── 🟢 helpers.js               # Response helpers, body parsing, error extraction
│
└── src/                                     # ── Next.js Application ──
    │
    ├── app/                                 # ── Pages & API Routes ──
    │   ├── 🟢 globals.css                  # Global styles + Tailwind imports
    │   ├── 🟢 layout.tsx                   # Root layout (metadata, viewport)
    │   ├── 🟢 page.tsx                     # Home page (renders AmbleApp)
    │   ├── 🟢 favicon.ico                  # App favicon
    │   ├── embed/
    │   │   └── 🟢 page.tsx                 # Embeddable chat widget page
    │   └── api/
    │       ├── admin/
    │       │   ├── create-user/route.ts     # Admin user creation
    │       │   └── delete-user/route.ts     # Admin user deletion
    │       ├── auth/google/
    │       │   ├── callback/route.ts        # OAuth callback handler
    │       │   └── refresh/route.ts         # Token refresh
    │       ├── audio/speech/route.ts        # Text-to-speech (TTS-1)
    │       ├── chat/route.ts                # Chat API — central AI orchestrator
    │       ├── gallery/route.ts             # Gallery CRUD
    │       ├── image/route.ts               # Image generation (DALL-E/Imagen)
    │       ├── knowledge/
    │       │   ├── debug/route.ts           # KB debug endpoint
    │       │   ├── documents/route.ts       # Document management
    │       │   ├── drive-list/route.ts      # Drive folder listing
    │       │   ├── drive-sync/route.ts      # Drive sync trigger
    │       │   ├── search/route.ts          # Vector KB search
    │       │   ├── status/route.ts          # KB sync status
    │       │   └── sync/route.ts            # Knowledge sync
    │       ├── tools/
    │       │   ├── search/route.ts          # Web search (Google + Tavily)
    │       │   └── extract/route.ts         # URL content extraction
    │       ├── transcribe/route.ts          # Audio transcription (Whisper)
    │       ├── upload/route.ts              # File upload handler
    │       └── veo/route.ts                 # Video generation (Sora/Veo)
    │
    ├── components/                          # ── React Components (52 files) ──
    │   ├── 🟢 AmbleApp.tsx                 # Main app shell
    │   │
    │   ├── admin/
    │   │   ├── 🟢 KnowledgeBaseAdmin.tsx   # Admin KB management UI
    │   │   └── 🟢 UsageReport.tsx          # Usage reporting dashboard
    │   │
    │   ├── ai/
    │   │   ├── 🟢 CapabilitiesDock.tsx     # Model capabilities floating dock
    │   │   └── 🟢 KBStatusBadge.tsx        # KB connection status indicator
    │   │
    │   ├── auth/
    │   │   ├── 🟢 AuthContextRefactored.tsx # Auth context provider
    │   │   └── 🟢 LoginRefactored.tsx      # Login page UI
    │   │
    │   ├── billing/
    │   │   ├── 🟢 BillingSettings.tsx      # Billing preferences
    │   │   ├── 🟢 UsageTracker.tsx         # Token usage tracker
    │   │   └── 🟢 index.tsx               # Billing barrel export
    │   │
    │   ├── chat/
    │   │   ├── 🟢 ArtifactRenderer.tsx     # Code/HTML/Mermaid artifact renderer
    │   │   ├── 🟢 ArtifactsPanel.tsx       # Artifact side panel
    │   │   ├── 🟢 ChatErrorBoundary.tsx    # Error boundary for chat
    │   │   ├── 🟢 ChatInterface.tsx        # Chat page wrapper + layout
    │   │   ├── 🟢 Composer.tsx             # Message input with dictation
    │   │   ├── 🟢 EmbedChat.tsx            # Embeddable chat widget
    │   │   ├── 🟢 Message.tsx              # Single message renderer
    │   │   ├── 🟢 MessageFeedback.tsx      # Thumbs up/down feedback
    │   │   ├── 🟢 MessageList.tsx          # Message list with scroll
    │   │   └── 🟢 Sidebar.tsx             # Chat history sidebar panel
    │   │
    │   ├── gallery/
    │   │   └── 🟢 AssetGallery.tsx         # Generated asset gallery grid
    │   │
    │   ├── layout/
    │   │   ├── 🟢 FeatureRouter.tsx        # View switcher (lazy-loaded)
    │   │   ├── 🟢 GlobalCommandCenter.tsx  # Top bar + model selector
    │   │   ├── 🟢 PharmacySidebar.tsx      # Pharmacy navigation sidebar
    │   │   ├── 🟢 ProjectSidebar.tsx       # Project/chat sidebar
    │   │   └── 🟢 Sidebar.tsx             # Main app navigation sidebar
    │   │
    │   ├── modals/
    │   │   ├── 🟢 ClearDataModal.tsx       # Clear data confirmation
    │   │   ├── 🟢 ConfirmationModal.tsx    # Generic confirmation dialog
    │   │   ├── 🟢 HelpModal.tsx            # Help/shortcuts modal
    │   │   ├── 🟢 ProfileModal.tsx         # User profile editor
    │   │   ├── 🟢 ProjectSettingsModal.tsx # Project settings
    │   │   └── 🟢 UserManagementModal.tsx  # Admin user management
    │   │
    │   ├── news/
    │   │   ├── 🟢 CompanyNewsPanel.tsx     # News feed panel
    │   │   ├── 🟢 NewsComposer.tsx         # News post editor
    │   │   ├── 🟢 NewsFiltersBar.tsx       # News filter controls
    │   │   ├── 🟢 NewsItem.tsx             # Single news post card
    │   │   └── 🟢 NewsPriorityBanner.tsx   # Priority banner (CRITICAL)
    │   │
    │   ├── organization/
    │   │   └── 🟢 OrgSwitcher.tsx          # Multi-org switcher dropdown
    │   │
    │   ├── settings/                        # Empty — reserved for future use
    │   │
    │   ├── studio/
    │   │   ├── 🟢 ImageStudio.tsx          # Image generation UI (DALL-E/Imagen)
    │   │   ├── 🟢 LiveStudio.tsx           # Live/realtime studio
    │   │   ├── 🟢 MediaStudio.tsx          # Studio tab container
    │   │   └── 🟢 VideoStudio.tsx          # Video generation UI (Sora/Veo)
    │   │
    │   ├── ui/
    │   │   ├── 🟢 MarkdownRenderer.tsx     # Markdown→HTML with syntax highlighting
    │   │   ├── 🟢 ModelSelector.tsx        # AI model dropdown
    │   │   ├── 🟢 SplashScreen.tsx         # Loading splash screen
    │   │   ├── 🟢 Toast.tsx               # Toast notification component
    │   │   └── 🟢 TypingIndicator.tsx      # Chat typing dots animation
    │   │
    │   ├── veo/
    │   │   ├── 🟢 icons.tsx               # Veo-specific icons
    │   │   ├── 🟢 LoadingIndicator.tsx     # Video generation progress
    │   │   ├── 🟢 PromptForm.tsx           # Video prompt input form
    │   │   └── 🟢 VideoResult.tsx          # Video result display
    │   │
    │   └── views/
    │       ├── 🟢 BillingView.tsx          # Billing CX workspace (policy-aware drafts)
    │       ├── 🟢 DashboardView.tsx        # Main dashboard with widgets
    │       ├── 🟢 KnowledgeBaseView.tsx    # KB management interface
    │       └── 🟢 PharmacyView.tsx         # Pharmacy operations view
    │
    ├── contexts/
    │   ├── 🟢 ChatContextRefactored.tsx    # Chat state + streaming
    │   ├── 🟢 OrganizationContext.tsx      # Multi-org state
    │   └── 🟢 index.ts                    # Barrel export
    │
    ├── hooks/                               # ── Custom Hooks (13 active + index files) ──
    │   ├── 🟢 useAiDictation.ts            # AI-powered dictation (browser + Whisper)
    │   ├── 🟢 useAmbleConfig.ts            # AI config (prompts, capabilities, policies)
    │   ├── 🟢 useAppNavigation.ts          # View state (dashboard/amble/billing)
    │   ├── 🟡 useClipboard.ts              # Clipboard operations (test-only)
    │   ├── 🟢 useCompanyNews.ts            # Firestore real-time news CRUD
    │   ├── 🟡 useDebounce.ts               # Debounce/throttle utilities (test-only)
    │   ├── 🟢 useFirebaseAuth.ts           # Firebase Auth state + session
    │   ├── 🟢 useHotkeys.ts               # Global keyboard shortcuts
    │   ├── 🟡 useLocalStorage.ts           # Enhanced localStorage with TTL (test-only)
    │   ├── 🟢 useModelSelection.ts         # Provider/model/mode state
    │   ├── 🟡 useMutation.ts               # Async mutation with retry/rollback (test-only)
    │   ├── 🟢 useProjectState.ts           # Firebase project/chat state
    │   ├── 🟢 useStandardDictation.ts      # Browser Web Speech API dictation
    │   ├── 🟢 index.ts                     # Barrel export (utility hooks)
    │   └── chat/
    │       └── 🟢 index.ts                # Type re-exports from services/chat/types
    │
    ├── lib/                                 # ── Shared Libraries (18 files) ──
    │   ├── 🟢 apiClient.ts                # Type-safe HTTP client
    │   ├── 🟢 apiError.ts                 # Error class with static factories
    │   ├── 🟢 capabilities.ts             # Model capability matrix (14+ models)
    │   ├── 🟢 clientCache.ts              # localStorage cache with TTL + LRU
    │   ├── 🟢 constants.ts                # KB_DRIVE_FOLDER_ID
    │   ├── 🟢 errorLogger.ts              # Structured error logging
    │   ├── 🟢 firebase.ts                 # Client-side Firebase init
    │   ├── 🟢 firebaseAdmin.ts            # Server-side Firebase Admin init
    │   ├── 🟢 googleDrive.ts              # Google Drive API v3 client
    │   ├── 🟢 index.ts                    # Barrel export
    │   ├── 🟢 qaCheck.ts                  # QA rules (PII, tone, fact-check)
    │   ├── 🟢 rateLimiter.ts              # In-memory sliding window rate limiter
    │   ├── 🟢 semanticCache.ts            # Jaccard similarity response cache
    │   ├── 🟢 systemPrompt.ts             # System prompts (Billing CX + Enhanced)
    │   ├── 🟢 usageManager.ts             # Token/cost tracking
    │   ├── 🟢 validation.ts               # Zod schemas for API requests
    │   │
    │   ├── agents/
    │   │   ├── 🟢 BaseAgent.ts            # Abstract agent with tool loop
    │   │   ├── 🟢 CoderAgent.ts           # Code generation agent
    │   │   ├── 🟢 Executor.ts             # Agent registry + execution
    │   │   ├── 🟡 Executor.test.ts        # Agent executor tests
    │   │   ├── 🟢 PlannerAgent.ts         # Task planning + delegation
    │   │   └── 🟢 ResearcherAgent.ts      # Multi-source research agent
    │   │
    │   └── studio/
    │       └── 🟢 gemini-service.ts       # Gemini API wrapper for studio
    │
    ├── services/                            # ── Business Logic ──
    │   ├── ai/
    │   │   ├── 🟢 agentSystem.ts          # Agent singleton + re-exports
    │   │   ├── 🟢 KnowledgeBaseIndexer.ts # Client-side IndexedDB KB index
    │   │   ├── 🟢 knowledgeContext.ts      # Legacy Drive folder-map KB
    │   │   ├── 🟢 memory.ts               # User memory storage + retrieval
    │   │   ├── 🟢 modelGateway.ts         # Client-side model API facade
    │   │   ├── 🟢 rag.ts                  # Project-specific RAG
    │   │   ├── 🟢 router.ts               # MagicRouter — complexity detection
    │   │   ├── 🟢 SearchOrchestrator.ts   # Client-side KB+web search
    │   │   ├── 🟢 tools.ts               # Server-side tool definitions (patient/billing)
    │   │   └── tools/
    │   │       ├── 🟢 DelegateTool.ts     # Agent delegation tool
    │   │       ├── 🟢 ExtractTool.ts      # URL extraction tool
    │   │       ├── 🟢 ReadDocumentTool.ts # Document read + list tools
    │   │       └── 🟢 SearchTool.ts       # Web search tool
    │   │
    │   ├── auth/
    │   │   ├── 🟢 AuthService.ts          # Full auth service
    │   │   ├── 🟢 SessionService.ts       # JWT session management
    │   │   └── 🟢 index.ts               # Barrel export
    │   │
    │   ├── chat/
    │   │   ├── 🟢 index.ts               # Barrel export
    │   │   ├── 🟢 RetryQueue.ts           # Exponential backoff retry
    │   │   ├── 🟢 SearchService.ts        # Search intent + KB/web search
    │   │   ├── 🟢 SessionService.ts       # Chat session CRUD with Firestore
    │   │   ├── 🟢 SmartSearchQueryBuilder.ts # Context-aware query builder
    │   │   ├── 🟢 StreamingService.ts     # SSE streaming with batching
    │   │   └── 🟢 types.ts               # Chat service type definitions
    │   │
    │   ├── knowledge/
    │   │   ├── 🟢 DocumentProcessor.ts    # Content extraction + chunking
    │   │   ├── 🟢 DriveSearchService.ts   # Google Drive real-time search
    │   │   ├── 🟢 DriveSync.ts            # Drive→Firestore sync pipeline
    │   │   ├── 🟢 EmbeddingService.ts     # Hybrid vector+keyword search
    │   │   ├── 🟢 ImageProcessor.ts       # Image→text via GPT-4o vision
    │   │   ├── 🟢 index.ts               # Barrel export
    │   │   ├── 🟢 KnowledgeBaseManager.ts # KB orchestrator
    │   │   ├── 🟢 RAGPipeline.ts          # Full RAG pipeline
    │   │   └── 🟢 types.ts               # Knowledge type definitions
    │   │
    │   └── ui/
    │       └── 🟢 CommandRouter.ts        # Natural language → app actions
    │
    ├── types/
    │   ├── 🟢 chat.ts                     # Message, Session, Artifact types
    │   ├── 🟢 news.ts                     # News post types + departments
    │   ├── 🟢 org.ts                      # Organization + member types
    │   ├── 🟢 studio.ts                   # Studio/AI types
    │   └── 🟢 veo.ts                      # Video generation types
    │
    ├── utils/
    │   ├── 🟢 artifactParser.ts           # Markdown → artifact extraction
    │   ├── 🟢 exportUtils.ts              # Chat export (MD/JSON/TXT/HTML)
    │   ├── 🟢 modelConstants.ts           # Model categories + pricing
    │   ├── 🟢 performanceMonitor.tsx       # Performance metric tracking
    │   ├── 🟢 textUtils.ts               # Markdown stripping + HTML conversion
    │   └── 🟢 validation.ts              # Client-side message + file validation
    │
    └── __tests__/
        ├── 🟡 chat.services.test.ts       # Chat service tests
        ├── hooks/
        │   ├── 🟡 useClipboard.test.ts
        │   ├── 🟡 useDebounce.test.ts
        │   ├── 🟡 useLocalStorage.test.ts
        │   └── 🟡 useMutation.test.ts
        ├── integration/
        │   └── 🟡 chat.integration.test.ts
        └── services/auth/
            ├── 🟡 AuthService.test.ts
            └── 🟡 SessionService.test.ts
```
