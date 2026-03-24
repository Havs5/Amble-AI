# 07 — API Surface

> **Last updated:** 2026-03-24  
> **Scope:** All API endpoints, request/response schemas, duplication analysis

---

## Route Resolution in Production

All requests to `https://amble-ai.web.app/**` are forwarded to the `ssrambleai` Cloud Function. Inside the function:

1. **Explicit route match** against `functions/index.js ROUTES[]` → Functions handler runs
2. **Inline admin handlers** → Functions inline code runs
3. **No match** → Next.js SSR handler → serves pages OR remaining Next.js API routes

This means **duplicated routes always use the Functions version in production**.

---

## Complete API Inventory

### Chat & Completions

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/chat` | **Functions** `routes/chat.js` (prod) / Next.js `api/chat/route.ts` (dev) | None (rate-limited) | Chat completions with streaming, RAG, tools, agent mode |

**Request Schema (Zod-validated in Next.js route):**
```typescript
{
  messages: Array<{ role: string; content: string | ContentPart[] }>;
  model?: string;                    // default: auto-routed
  stream?: boolean;                  // default: true
  useRAG?: boolean;                  // enable project RAG
  projectId?: string;                // for project-scoped RAG
  userId?: string;                   // user identifier
  capabilities?: {                   // model capability flags
    webBrowse?: boolean;
    dictation?: boolean;
    // ...
  };
  tools?: Array<ToolDefinition>;     // additional tools
  agentMode?: string;                // "PlannerAgent"|"ResearcherAgent"|"CoderAgent"
  context?: {
    view?: string;                   // "amble"|"billing"|...
    kbEnabled?: boolean;
  };
  temperature?: number;              // 0-2
  maxTokens?: number;                // max output tokens
  knowledgeBase?: {
    enabled?: boolean;
    folderMap?: FolderMapEntry[];     // legacy KB
    projectName?: string;
  };
}
```

**Response (streaming):** SSE with `data:` lines containing JSON objects:
- `{ type: "trace", event: string, status: string, message: string }`
- `{ type: "content", text: string }`
- `{ type: "usage", promptTokens, completionTokens, model }`
- `{ type: "kbSources", sources: Array<{name, path}> }`
- `[DONE]`

**Response (non-streaming):** JSON `{ content, usage, kbSources }`

---

### Image Generation

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/image` | **Functions** `routes/image.js` | None | Generate images via DALL-E 3 or Imagen 3 |

**Request:**
```typescript
{
  prompt: string;
  model?: string;       // "dall-e-3" | "imagen-3"
  userId?: string;
  size?: string;        // "1024x1024" etc.
}
```

**Response:** `{ url, base64, metadata }`

---

### Video Generation

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/veo` | **Functions** `routes/video.js` | None | Generate video via Sora or Veo |

**Request:**
```typescript
{
  prompt: string;
  model?: string;       // "sora" | "veo"
  userId?: string;
  referenceImage?: string; // base64 (Veo only)
  duration?: number;
  aspectRatio?: string;
}
```

**Response:** `{ url, thumbnailUrl, metadata }`

---

### Audio

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/transcribe` | **Functions** `routes/audio.js` | None | Audio → text (Whisper-1 + optional GPT correction) |
| POST | `/api/rewrite` | **Functions-only** `routes/audio.js` | None | Rewrite text (Shorter/Firmer via GPT-4o-mini) |
| POST | `/api/audio/speech` | **Functions** `routes/audio.js` | None | Text → speech (TTS-1, returns base64 MP3) |

**Transcribe Request:** `{ audio: string (base64), format?: string }`  
**Rewrite Request:** `{ text: string, mode: "shorter" | "firmer" }`  
**Speech Request:** `{ text: string, voice?: string }`

---

### Tools

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/tools/search` | **Functions** `routes/tools.js` | None | Web search (Google Custom Search → Tavily fallback) |
| POST | `/api/tools/extract` | **Functions** `routes/tools.js` | None | URL content extraction (Tavily) |

**Search Request:** `{ query: string, maxResults?: number }`  
**Extract Request:** `{ urls: string[] }`

---

### Gallery

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| GET | `/api/gallery` | **Functions** `routes/gallery.js` | userId in query | List generated assets with pagination |
| DELETE | `/api/gallery` | **Functions** `routes/gallery.js` | userId in query | Delete asset (ownership verified) |

---

### Knowledge Base

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/knowledge/search` | **Functions** `routes/knowledge.js` | Bearer token | Vector KB + Drive search (production endpoint) |
| POST | `/api/knowledge/drive-sync` | **Functions** `routes/driveSync.js` | Bearer token + accessToken | Sync Google Drive → Firestore KB |
| POST | `/api/knowledge/ingest` | **Functions-only** `routes/knowledge.js` | None | Ingest document (chunk + embed → Firestore) |
| POST | `/api/kb/search` | **Functions-only** `routes/knowledge.js` | None | User RAG search (project-scoped) |

### Knowledge Base (Next.js-only routes — fall through to SSR handler)

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| GET | `/api/knowledge/status` | Next.js only | — | KB sync status |
| GET | `/api/knowledge/documents` | Next.js only | — | List KB documents |
| POST | `/api/knowledge/sync` | Next.js only | — | Trigger sync |
| GET | `/api/knowledge/drive-list` | Next.js only | — | List Drive folders |
| GET | `/api/knowledge/debug` | Next.js only | — | KB debug info |

---

### Auth (Next.js-only)

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| GET | `/api/auth/google/callback` | Next.js only | OAuth state | Google OAuth callback → store tokens |
| POST | `/api/auth/google/refresh` | Next.js only | Bearer token | Refresh Google OAuth tokens |

---

### Video Analysis

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/video/analyze` | **Functions** `routes/videoAnalyze.js` | None | Analyze video with Gemini 1.5 Pro |

---

### Admin (Next.js routes)

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/admin/create-user` | Next.js only | Admin | Create new user |
| POST | `/api/admin/delete-user` | Next.js only | Admin | Delete user |

### Upload (Next.js-only)

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/upload` | Next.js only | — | File upload handler |

---

### Admin (Functions-only, inline handlers)

| Method | Path | Handler Source | Auth | Description |
|--------|------|---------------|------|-------------|
| POST | `/api/admin/fix-duplicates` | Functions inline | **NONE** ⚠️ | Deduplicate users in Firestore |
| POST | `/api/admin/restore-users` | Functions inline | **NONE** ⚠️ | Restore user data |
| GET | `/api/videos/:videoId/content` | Functions inline (regex) | None | Proxy video content from OpenAI |

---

## Route Duplication Analysis

### Duplicated (10 routes — Functions always wins in prod)

| Route | Functions Implementation | Next.js Implementation | Divergence Risk |
|-------|------------------------|----------------------|----------------|
| `/api/chat` | 644 lines, company KB search, intelligent web search | 1267 lines, 4-source parallel fetch, agent mode, MagicRouter | **HIGH** — significantly different logic |
| `/api/image` | Imagen + DALL-E, Storage save | Similar | Low |
| `/api/veo` | Sora + Veo, polling, Storage save | Similar | Low |
| `/api/transcribe` | Whisper + GPT correction | Similar | Low |
| `/api/audio/speech` | TTS-1 | Similar | Low |
| `/api/tools/search` | Google + Tavily | Similar | Low |
| `/api/tools/extract` | Tavily extract | Similar | Low |
| `/api/gallery` | Firestore CRUD | Similar | Low |
| `/api/knowledge/search` | Vector + Drive parallel search | Similar | Medium |
| `/api/knowledge/drive-sync` | Drive recursive sync | Similar | Medium |

### Functions-Only (7 routes — no Next.js equivalent)

| Route | Purpose | Risk if Removed |
|-------|---------|----------------|
| `/api/rewrite` | Text rewriting | **No longer called by BillingView** (now uses `/api/chat` with `stream: false`). May be orphaned. |
| `/api/knowledge/ingest` | Doc ingestion + embedding | Cannot ingest new KB docs |
| `/api/kb/search` | User RAG search | Project-scoped RAG breaks |
| `/api/video/analyze` | Video analysis | Video analysis feature breaks |
| `/api/admin/fix-duplicates` | User dedup | Admin maintenance tool lost |
| `/api/admin/restore-users` | User restore | Admin maintenance tool lost |
| `/api/videos/:videoId/content` | Video proxy | Video playback may break |

### Next.js-Only (7 routes — only work in dev or via SSR passthrough)

| Route | Purpose | Notes |
|-------|---------|-------|
| `/api/auth/google/callback` | OAuth callback | Critical — must remain |
| `/api/auth/google/refresh` | Token refresh | Critical — must remain |
| `/api/knowledge/status` | Sync status | UI polling endpoint |
| `/api/knowledge/documents` | Doc listing | KnowledgeBaseView uses this |
| `/api/knowledge/sync` | Sync trigger | KnowledgeBaseView uses this |
| `/api/knowledge/drive-list` | Folder listing | KnowledgeBaseView uses this |
| `/api/knowledge/debug` | Debug info | Dev/admin only |

---

## Rate Limiting

**Implementation:** In-memory sliding window (`lib/rateLimiter.ts`)

| Endpoint Category | Limit | Window |
|-------------------|-------|--------|
| `chat` | 20 requests | 1 minute |
| `image` | 5 requests | 1 minute |
| `veo` | 2 requests | 5 minutes |
| `tools` | 30 requests | 1 minute |
| `kb` | 50 requests | 1 minute |
| `audio` | 10 requests | 1 minute |
| `default` | 100 requests | 1 minute |

**Note:** Rate limits are per Cloud Function instance (in-memory) and reset on cold start. Not shared across instances.
