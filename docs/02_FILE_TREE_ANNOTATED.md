# 02 — Annotated File Tree

> **Last updated:** 2025-07-15  
> **Legend:** 🟢 Active | 🟡 Test-only | 🔴 Dead code | ⚙️ Config | 📄 Documentation

---

```
amble-ai/
│
├── ⚙️ .env.local                          # Environment variables (secrets, Firebase config)
├── ⚙️ .gitignore                           # MINIMAL — only excludes amble-kb-sync-key.json
├── ⚙️ amble-kb-sync-key.json              # Google service account key for KB sync
├── ⚙️ firebase.json                        # Firebase Hosting + Functions + Firestore config
├── ⚙️ firestore.indexes.json              # 8 Firestore indexes (vector, composite)
├── ⚙️ firestore.rules                     # Security rules for 10 collections
├── ⚙️ jest.config.js                      # Jest config (has typo: setupFilesAfterEnup)
├── ⚙️ jest.setup.js                       # Test mocks (Firebase, localStorage, streams)
├── ⚙️ next-env.d.ts                       # Next.js TypeScript declarations
├── ⚙️ next.config.js                      # Next.js config (bundle analyzer, serverActions, headers)
├── ⚙️ package.json                        # 28 deps + 14 devDeps, scripts: dev/build/deploy/test
├── ⚙️ postcss.config.mjs                  # Tailwind CSS v4 PostCSS plugin
├── ⚙️ tsconfig.json                       # TS strict mode, @/* path alias
│
├── 📄 docs/
│   ├── AMBLE_AI_COMPLETE_ANALYSIS_2026.md  # Prior comprehensive analysis
│   └── UI_UX_AUDIT_2025.md                 # Prior UI/UX audit
│
├── scripts/
│   ├── 🟢 clean_public_next.js             # Removes public/_next (pre-build cleanup)
│   ├── 🟢 deploy_ssr.js                    # Full SSR deployment pipeline (build → copy → deploy)
│   └── 🟢 seed_news.js                     # Seeds 6 sample news_posts to Firestore
│
├── public/                                  # Static assets (served by Firebase Hosting CDN)
│
├── functions/                               # ── Cloud Functions Backend ──
│   ├── ⚙️ package.json                     # Node 22, mirrors main deps (some unnecessary)
│   ├── 🟢 index.js                         # SSR entry: ssrambleai Cloud Function v2 (513 lines)
│   └── src/
│       ├── config/
│       │   └── 🟢 pricing.js               # Per-model token pricing table (10 models)
│       ├── routes/
│       │   ├── 🟢 index.js                 # Barrel export for all route handlers
│       │   ├── 🟢 chat.js                  # POST /api/chat — Chat completions (644 lines)
│       │   ├── 🟢 image.js                 # POST /api/image — DALL-E/Imagen generation
│       │   ├── 🟢 video.js                 # POST /api/veo — Sora/Veo generation (357 lines)
│       │   ├── 🟢 audio.js                 # POST /api/transcribe, /api/rewrite, /api/audio/speech
│       │   ├── 🟢 tools.js                 # POST /api/tools/search, /api/tools/extract
│       │   ├── 🟢 gallery.js               # GET/DELETE /api/gallery
│       │   ├── 🟢 knowledge.js             # POST /api/knowledge/ingest, /kb/search, /knowledge/search
│       │   ├── 🟢 videoAnalyze.js          # POST /api/video/analyze — Gemini video analysis
│       │   └── 🟢 driveSync.js             # POST /api/knowledge/drive-sync
│       ├── services/
│       │   ├── 🟢 driveSearchService.js    # Google Drive search via service account (740 lines)
│       │   ├── 🟢 intelligentSearch.js     # Multi-source web search orchestration
│       │   ├── 🟢 knowledgeService.js      # Vector nearest-neighbor search
│       │   ├── 🟢 searchService.js         # Google/Tavily/DuckDuckGo search (233 lines)
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
    │   ├── 🟢 embed/page.tsx              # Embeddable chat widget page
    │   └── api/
    │       ├── chat/
    │       │   └── 🟢 route.ts             # Chat API (1267 lines) — central AI orchestrator
    │       ├── image/
    │       │   └── 🟢 route.ts             # Image generation (DALL-E/Imagen)
    │       ├── veo/
    │       │   └── 🟢 route.ts             # Video generation (Sora/Veo)
    │       ├── transcribe/
    │       │   └── 🟢 route.ts             # Audio transcription (Whisper)
    │       ├── audio/speech/
    │       │   └── 🟢 route.ts             # Text-to-speech (TTS-1)
    │       ├── gallery/
    │       │   └── 🟢 route.ts             # Gallery CRUD
    │       ├── tools/
    │       │   ├── search/
    │       │   │   └── 🟢 route.ts         # Web search (Google + Tavily)
    │       │   └── extract/
    │       │       └── 🟢 route.ts         # URL content extraction
    │       ├── auth/google/
    │       │   ├── callback/
    │       │   │   └── 🟢 route.ts         # OAuth callback handler
    │       │   └── refresh/
    │       │       └── 🟢 route.ts         # Token refresh
    │       └── knowledge/
    │           ├── debug/
    │           │   └── 🟢 route.ts         # KB debug endpoint
    │           ├── documents/
    │           │   └── 🟢 route.ts         # Document management
    │           ├── drive-list/
    │           │   └── 🟢 route.ts         # Drive folder listing
    │           ├── drive-sync/
    │           │   └── 🟢 route.ts         # Drive sync trigger
    │           ├── search/
    │           │   └── 🟢 route.ts         # Vector KB search
    │           ├── status/
    │           │   └── 🟢 route.ts         # KB sync status
    │           └── sync/
    │               └── 🟢 route.ts         # Knowledge sync
    │
    ├── components/                          # ── React Components (55 files) ──
    │   ├── 🟢 AmbleApp.tsx                 # Main app shell (584 lines)
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
    │   │   ├── 🟢 Composer.tsx             # Message input (404 lines)
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
    │       ├── 🟢 BillingView.tsx          # Billing CX workspace (744 lines)
    │       ├── 🟢 DashboardView.tsx        # Main dashboard with widgets
    │       ├── 🟢 KnowledgeBaseView.tsx    # KB management (1220 lines)
    │       └── 🟢 PharmacyView.tsx         # Pharmacy operations view
    │
    ├── contexts/
    │   ├── 🟢 ChatContextRefactored.tsx    # Chat state + streaming (885 lines)
    │   ├── 🟢 OrganizationContext.tsx      # Multi-org state
    │   └── 🟢 index.ts                    # Barrel export
    │
    ├── hooks/                               # ── Custom Hooks (36 files) ──
    │   │
    │   │  ── ACTIVE (imported by components) ──
    │   ├── 🟢 useAiDictation.ts            # AI-powered dictation (browser + Whisper)
    │   ├── 🟢 useAmbleConfig.ts            # AI config (prompts, capabilities, policies)
    │   ├── 🟢 useAppNavigation.ts          # View state (dashboard/amble/billing)
    │   ├── 🟢 useCompanyNews.ts            # Firestore real-time news CRUD
    │   ├── 🟢 useFirebaseAuth.ts           # Firebase Auth state + session
    │   ├── 🟢 useHotkeys.ts               # Global keyboard shortcuts
    │   ├── 🟢 useModelSelection.ts         # Provider/model/mode state
    │   ├── 🟢 useProjectState.ts           # Firebase project/chat state
    │   ├── 🟢 useStandardDictation.ts      # Browser Web Speech API dictation
    │   │
    │   │  ── TEST-ONLY (imported only in test files) ──
    │   ├── 🟡 useClipboard.ts              # Clipboard operations
    │   ├── 🟡 useDebounce.ts               # Debounce/throttle utilities
    │   ├── 🟡 useLocalStorage.ts           # Enhanced localStorage with TTL
    │   ├── 🟡 useMutation.ts               # Async mutation with retry/rollback
    │   │
    │   │  ── DEAD CODE (zero imports outside own file) ──
    │   ├── 🔴 useAccessibility.tsx          # 10 a11y hooks — never used
    │   ├── 🔴 useAnalytics.ts              # Analytics tracking — never used
    │   ├── 🔴 useAutoSave.ts               # Auto-save — never used
    │   ├── 🔴 useCommandPalette.tsx         # Ctrl+K palette — never used
    │   ├── 🔴 useConfirm.tsx               # Confirmation dialog — never used
    │   ├── 🔴 useConnectionStatus.tsx       # Network monitor — never used
    │   ├── 🔴 useDraftMessage.ts           # Draft auto-save — never used
    │   ├── 🔴 useFeatureFlags.tsx           # Feature flags — never used
    │   ├── 🔴 useIntersectionObserver.ts    # Visibility/scroll — never used
    │   ├── 🔴 useKeyboardShortcuts.tsx      # Configurable shortcuts — never used
    │   ├── 🔴 useLoadingManager.tsx         # Loading state — never used
    │   ├── 🔴 useMessageSearch.tsx          # Message search — never used
    │   ├── 🔴 useOptimisticUpdate.ts        # Optimistic updates — never used
    │   ├── 🔴 usePolling.ts                # Polling with backoff — never used
    │   ├── 🔴 useResponsive.ts             # Responsive breakpoints — never used
    │   ├── 🔴 useTheme.tsx                 # Theme system — never used
    │   ├── 🔴 useToast.tsx                 # Toast system — never used
    │   ├── 🔴 useUndoRedo.ts              # Undo/redo stack — never used
    │   ├── 🔴 useVirtualList.tsx           # Virtualized lists — never used
    │   │
    │   └── chat/
    │       ├── 🔴 useMessages.ts           # Message management — dead (context uses services directly)
    │       ├── 🔴 useSessions.ts           # Session CRUD — dead
    │       ├── 🔴 useStreaming.ts           # Streaming state — dead
    │       └── 🟢 index.ts                # Barrel export
    │
    ├── lib/                                 # ── Shared Libraries (23 files) ──
    │   ├── 🟢 apiClient.ts                # Type-safe HTTP client (434 lines)
    │   ├── 🟢 apiError.ts                 # Error class with static factories
    │   ├── 🟢 capabilities.ts             # Model capability matrix (14+ models)
    │   ├── 🟢 clientCache.ts              # localStorage cache with TTL + LRU
    │   ├── 🟢 constants.ts                # KB_DRIVE_FOLDER_ID
    │   ├── 🟢 errorLogger.ts              # Structured error logging (359 lines)
    │   ├── 🟢 firebase.ts                 # Client-side Firebase init
    │   ├── 🟢 firebaseAdmin.ts            # Server-side Firebase Admin init
    │   ├── 🟢 googleDrive.ts              # Google Drive API v3 client (368 lines)
    │   ├── 🟢 index.ts                    # Barrel export
    │   ├── 🟢 qaCheck.ts                  # QA rules (PII, tone, fact-check)
    │   ├── 🟢 rateLimiter.ts              # In-memory sliding window rate limiter
    │   ├── 🟢 semanticCache.ts            # Jaccard similarity response cache (434 lines)
    │   ├── 🟢 systemPrompt.ts             # System prompts (Billing CX + Enhanced)
    │   ├── 🟢 usageManager.ts             # Token/cost tracking (529 lines)
    │   ├── 🟢 validation.ts               # Zod schemas for API requests
    │   │
    │   ├── agents/
    │   │   ├── 🟢 BaseAgent.ts            # Abstract agent with tool loop (170 lines)
    │   │   ├── 🟢 CoderAgent.ts           # Code generation agent
    │   │   ├── 🟢 Executor.ts             # Agent registry + execution (55 lines)
    │   │   ├── 🟡 Executor.test.ts        # Agent executor tests
    │   │   ├── 🟢 PlannerAgent.ts         # Task planning + delegation (35 lines)
    │   │   └── 🟢 ResearcherAgent.ts      # Multi-source research agent (60 lines)
    │   │
    │   └── studio/
    │       └── 🟢 gemini-service.ts       # Gemini API wrapper for studio
    │
    ├── services/                            # ── Business Logic (33 files) ──
    │   ├── ai/
    │   │   ├── 🟢 agentSystem.ts          # Agent singleton + re-exports (16 lines)
    │   │   ├── 🟢 KnowledgeBaseIndexer.ts # Client-side IndexedDB KB index (601 lines)
    │   │   ├── 🟢 knowledgeContext.ts      # Legacy Drive folder-map KB (803 lines)
    │   │   ├── 🟢 memory.ts               # User memory storage + retrieval (130 lines)
    │   │   ├── 🟢 modelGateway.ts         # Client-side model API facade (135 lines)
    │   │   ├── 🟢 rag.ts                  # Old project-specific RAG (160 lines)
    │   │   ├── 🟢 router.ts               # MagicRouter — complexity detection (261 lines)
    │   │   ├── 🟢 SearchOrchestrator.ts   # Client-side KB+web search (727 lines)
    │   │   ├── 🟢 tools.ts               # Server-side tool definitions (patient/billing)
    │   │   └── tools/
    │   │       ├── 🟢 DelegateTool.ts     # Agent delegation tool
    │   │       ├── 🟢 ExtractTool.ts      # URL extraction tool
    │   │       ├── 🟢 ReadDocumentTool.ts # Document read + list tools
    │   │       └── 🟢 SearchTool.ts       # Web search tool
    │   │
    │   ├── auth/
    │   │   ├── 🟢 AuthService.ts          # Full auth service (968 lines)
    │   │   ├── 🟢 SessionService.ts       # JWT session management (446 lines)
    │   │   └── 🟢 index.ts               # Barrel export
    │   │
    │   ├── chat/
    │   │   ├── 🟢 index.ts               # Barrel export
    │   │   ├── 🟢 RetryQueue.ts           # Exponential backoff retry (347 lines)
    │   │   ├── 🟢 SearchService.ts        # Search intent + KB/web search (442 lines)
    │   │   ├── 🟢 SessionService.ts       # Chat session CRUD with Firestore
    │   │   ├── 🟢 SmartSearchQueryBuilder.ts # Context-aware query builder (440 lines)
    │   │   ├── 🟢 StreamingService.ts     # SSE streaming with batching (309 lines)
    │   │   └── 🟢 types.ts               # Chat service type definitions (239 lines)
    │   │
    │   ├── knowledge/
    │   │   ├── 🟢 DocumentProcessor.ts    # Content extraction + chunking (741 lines)
    │   │   ├── 🟢 DriveSearchService.ts   # Google Drive real-time search (595 lines)
    │   │   ├── 🟢 DriveSync.ts            # Drive→Firestore sync pipeline (620 lines)
    │   │   ├── 🟢 EmbeddingService.ts     # Hybrid vector+keyword search (686 lines)
    │   │   ├── 🟢 ImageProcessor.ts       # Image→text via GPT-4o vision
    │   │   ├── 🟢 index.ts               # Barrel export
    │   │   ├── 🟢 KnowledgeBaseManager.ts # KB orchestrator (476 lines)
    │   │   ├── 🟢 RAGPipeline.ts          # Full RAG pipeline (462 lines)
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
        │   ├── 🟡 useClipboard.test.ts    # Clipboard hook tests
        │   ├── 🟡 useDebounce.test.ts     # Debounce hook tests
        │   ├── 🟡 useLocalStorage.test.ts # LocalStorage hook tests
        │   └── 🟡 useMutation.test.ts     # Mutation hook tests
        ├── integration/
        │   └── 🟡 chat.integration.test.ts # Chat integration tests
        └── services/auth/
            ├── 🟡 AuthService.test.ts      # Auth service tests
            └── 🟡 SessionService.test.ts   # Session service tests
```
