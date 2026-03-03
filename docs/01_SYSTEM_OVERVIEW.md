# 01 — System Overview

> **Last updated:** 2025-07-15  
> **Scope:** Architecture, tech stack, deployment model

---

## High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Firebase Hosting                           │
│  https://amble-ai.web.app                                        │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  Static Assets (public/_next/static/)  — CDN-served          │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  catch-all "**" → Cloud Function: ssrambleai                 │ │
│  │                                                               │ │
│  │  ┌─────────────────────────────────────────────────────────┐ │ │
│  │  │  Route Matcher (functions/index.js ROUTES[])             │ │ │
│  │  │  14 explicit API routes + 3 admin routes                 │ │ │
│  │  │  ↓ unmatched                                             │ │ │
│  │  │  Next.js SSR Handler (app.prepare → handle)              │ │ │
│  │  │  → React pages + remaining API routes                    │ │ │
│  │  └─────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         │                  │                    │
         ▼                  ▼                    ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  Firestore   │  │  Firebase     │  │  External APIs       │
│  - chats     │  │  Storage      │  │  - OpenAI (GPT/o-    │
│  - users     │  │  - images     │  │    series, DALL-E,   │
│  - kb_docs   │  │  - videos     │  │    Whisper, TTS,     │
│  - kb_chunks │  │  - exports    │  │    Embeddings, Sora) │
│  - news_posts│  │               │  │  - Google Gemini     │
│  - usage_logs│  │               │  │    (3-series, 2.5,   │
│  - memories  │  │               │  │    Imagen, Veo)      │
│  - orgs      │  │               │  │  - Tavily Search     │
│  - generated │  │               │  │  - Google Custom     │
│    _assets   │  │               │  │    Search API        │
└──────────────┘  └──────────────┘  └──────────────────────┘
```

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 15.5.9 | App Router, SSR, API routes |
| React | 18.3.1 | UI rendering |
| TypeScript | 5.x | Type safety (strict mode) |
| Tailwind CSS | v4 | Utility-first styling |
| @tailwindcss/typography | latest | Prose formatting for markdown content |
| Lucide React | latest | Icon library |
| Framer Motion | 12.x | Animations |
| markdown-it | latest | Markdown rendering |
| @react-pdf/renderer | latest | PDF export (dynamic import) |
| Zod | latest | Runtime schema validation |

### Backend / Infrastructure
| Technology | Version | Purpose |
|-----------|---------|---------|
| Firebase Cloud Functions | v2 | SSR hosting + API handlers |
| Node.js | 22 | Runtime |
| Firebase Auth | latest | Authentication (Email + Google OAuth) |
| Firestore | latest | Document + vector database |
| Firebase Storage | latest | Binary asset storage |
| Firebase Hosting | latest | CDN + function routing |

### AI / ML
| Provider | Models | Use Case |
|----------|--------|----------|
| OpenAI | GPT-5, GPT-5-mini, GPT-5-nano, GPT-5.2 | Chat completions |
| OpenAI | o3, o3-pro, o4-mini | Reasoning tasks |
| OpenAI | text-embedding-3-small (1536-dim) | Vector embeddings for KB |
| OpenAI | gpt-4o-mini | Memory extraction, RAG re-ranking, query classification |
| OpenAI | gpt-image-1.5, DALL-E 3 | Image generation |
| OpenAI | Sora | Video generation |
| OpenAI | Whisper-1 | Audio transcription |
| OpenAI | TTS-1 | Text-to-speech |
| Google | Gemini 3-flash, 3-pro | Chat completions |
| Google | Gemini 2.5-flash, 2.5-pro | Chat + reasoning |
| Google | Gemini 2.0-flash | Binary file extraction (OCR) |
| Google | Imagen 3 | Image generation (fallback) |
| Google | Veo | Video generation |
| Tavily | Search + Extract APIs | Web search |
| Google | Custom Search API | Web search (primary) |

### Testing
| Tool | Version | Purpose |
|------|---------|---------|
| Jest | 30.x | Test runner |
| ts-jest | latest | TypeScript transform |
| @testing-library/react | latest | Component testing |
| jsdom | latest | DOM environment |

---

## Module Boundaries

The codebase is organized into clear layers:

```
src/
├── app/           → Next.js routes (pages + API)
├── components/    → React UI (14 subdirectories)
├── contexts/      → React context providers (Chat, Org)
├── hooks/         → Custom React hooks (36 files)
├── lib/           → Shared utilities, Firebase, validation, agents
├── services/      → Business logic (ai, auth, chat, knowledge, ui)
├── types/         → TypeScript type definitions
└── utils/         → Pure utility functions

functions/
├── index.js       → Cloud Function entry + route table
└── src/
    ├── config/    → Pricing tables
    ├── routes/    → API handler implementations
    ├── services/  → Backend services (Drive, search, knowledge, usage)
    └── utils/     → Response helpers
```

### Key Architectural Patterns

1. **Dual execution model**: Functions route handlers intercept API requests before Next.js; Next.js handles SSR pages and non-intercepted API routes
2. **Service layer pattern**: Business logic in `services/` with singleton factories, consumed by hooks and API routes
3. **Context providers**: `ChatProvider` (chat state + streaming) and `OrganizationProvider` (multi-org)
4. **Feature routing**: `FeatureRouter` component switches views based on `useAppNavigation()` state — dashboard, amble, billing, studio, knowledge, pharmacies
5. **Permission-gated UI**: Sidebar items and features gated by user permissions (`accessAmble`, `accessBilling`, `accessKnowledge`, `accessPharmacy`, `enableStudio`)

---

## Firestore Collections

| Collection | Purpose | Indexes |
|-----------|---------|---------|
| `users` | User profiles, permissions, capabilities | — |
| `users_by_uid` | UID-indexed user lookup | — |
| `chats` | Chat sessions (title, messages, visibility, projectId) | `ownerId+updatedAt`, `projectId+updatedAt` |
| `knowledge` | Legacy knowledge documents | Vector (1536-dim), `projectId+updatedAt` |
| `knowledge_vectors` | Vector KB embeddings | Vector (1536-dim) |
| `kb_documents` | Synced Drive documents | — |
| `kb_chunks` | Document chunks with embeddings | — |
| `kb_articles` | KB articles | `status+publishedAt` |
| `kb_content_cache` | Cached Drive file content (24h TTL) | — |
| `kb_sync_state` | Sync progress tracking | — |
| `generated_assets` | Generated images/videos | `userId+createdAt` |
| `news_posts` | Company news articles | `status+publishedAt`, `status+pinned+publishedAt` |
| `news_audit` | News change audit trail | — |
| `usage_logs` | Token usage + cost tracking | — |
| `memories` | User memory facts (subcollection of users) | — |
| `organizations` | Multi-org definitions | — |
| `org_members` | Org membership | — |
| `google_drive_tokens` | OAuth refresh tokens for Drive | — |

---

## External Service Dependencies

| Service | Purpose | Env Variable(s) |
|---------|---------|-----------------|
| OpenAI API | Chat, embeddings, images, video, audio | `OPENAI_API_KEY` |
| Google Gemini API | Chat, vision, video | `GEMINI_API_KEY` |
| Tavily API | Web search + URL extraction | `TAVILY_API_KEY` |
| Google Custom Search | Web search (primary) | `GOOGLE_SEARCH_API_KEY`, `GOOGLE_SEARCH_CX` |
| Google Drive API | KB sync, file search | Service account key or OAuth tokens |
| Firebase | Auth, Firestore, Storage, Hosting, Functions | `NEXT_PUBLIC_FIREBASE_*` env vars |
