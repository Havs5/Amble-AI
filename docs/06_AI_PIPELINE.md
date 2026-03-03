# 06 — AI Pipeline

> **Last updated:** 2025-07-15  
> **Scope:** Model routing, RAG, agents, tools, streaming, knowledge systems

---

## Pipeline Overview

```
User message
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    api/chat/route.ts (POST)                      │
│                                                                   │
│  1. Rate limit check                                              │
│  2. Zod validation (ChatRequestSchema)                           │
│  3. Agent mode check → delegate to globalExecutor                │
│  4. Smart routing → MagicRouter                                   │
│  5. Parallel context fetch (4 sources)                           │
│  6. System prompt construction                                    │
│  7. Web search decision                                          │
│  8. Model dispatch (Google or OpenAI)                            │
│  9. Streaming with tool execution loop                           │
│ 10. Memory extraction (fire-and-forget)                          │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
SSE response → client
```

---

## Model Routing (MagicRouter)

**File:** `src/services/ai/router.ts` (261 lines)

### Complexity Tiers

| Tier | Detection Criteria | Google Model | OpenAI Model |
|------|-------------------|-------------|-------------|
| `instant` | (defined but never returned) | — | — |
| `simple` | Default (≤30 words, no special keywords) | `gemini-3-flash` | `gpt-5-mini` |
| `complex` | >30 words OR analysis/comparison keywords | `gemini-3-pro` | `gpt-5` |
| `reasoning` | >100 words OR planning/multi-step keywords | `gemini-3-thinking` | `o3` |

### Model Alias Resolution (route.ts)

| Display Name → | Actual API Model ID |
|---------------|-------------------|
| `gpt-5` | `gpt-5` |
| `gpt-5-mini` | `gpt-5-mini` |
| `gpt-5-nano` | `gpt-5-nano` |
| `gpt-5.2` | `gpt-5.2` |
| `o3` | `o3` |
| `o3-pro` | `o3-pro` |
| `o4-mini` | `o4-mini` |
| `gemini-3-flash` | `gemini-3-flash-preview` |
| `gemini-3-pro` | `gemini-3-pro-preview` |
| `gemini-2.5-flash` | `gemini-2.5-flash-preview-05-20` |
| `gemini-2.5-pro` | `gemini-2.5-pro-preview-06-05` |
| **Legacy fallbacks:** | |
| `gpt-4o` | `gpt-5-mini` |
| `gpt-4o-mini` | `gpt-5-nano` |

### Provider Selection (route.ts)

```
if model starts with "o3" or "o4" → OpenAI (reasoning)
else if model starts with "gpt" or "dall" → OpenAI
else → Google (default preference for cost)
```

### Auto-Fallback

- Any **Gemini error** during streaming → automatic fallback to `gpt-4o` via OpenAI
- `ModelGateway.generateText()`: GPT error → fallback to `gemini-1.5-pro-latest`
- `ModelGateway.generateImage()`: DALL-E error → fallback to Imagen 3

---

## Context Retrieval (4 Parallel Sources)

**Function:** `fetchContextParallel()` in route.ts

```
Promise.allSettled([
    MemoryService.retrieveRelevantMemories(userId, query),
    RAGService.retrieveContext(query, projectId),
    RAGPipeline.quickSearch(query),
    KnowledgeContextService.getContextForQuery(query, folderMap)
])
```

### Source 1: Memory Service
- **File:** `services/ai/memory.ts` (130 lines)
- **Storage:** Firestore `users/{userId}/memories` subcollection
- **Retrieval:** Cache-first (5-min in-memory), keyword filter if >10 memories
- **Extraction:** Fire-and-forget after chat turn via `gpt-4o-mini` (pattern: "I am…", "my name is…", "remember…")

### Source 2: RAG Service (Legacy Project RAG)
- **File:** `services/ai/rag.ts` (160 lines)
- **Storage:** Firestore `chunks` collection group, filtered by `projectId`
- **Method:** OpenAI embeddings → cosine similarity (in-memory) → top 15 → LLM re-ranker (`gpt-4o-mini`) → top 5
- **Cache:** 2-min in-memory TTL
- **Note:** This is the **original** RAG system for project-scoped documents

### Source 3: Vector KB (RAGPipeline → KnowledgeBaseManager → EmbeddingService)
- **Files:** `services/knowledge/RAGPipeline.ts`, `KnowledgeBaseManager.ts`, `EmbeddingService.ts`
- **Storage:** Firestore `kb_chunks` (1536-dim embeddings)
- **Method:** Hybrid search via Reciprocal Rank Fusion (RRF):
  - **Vector path:** Query embedding → paginated Firestore scan (500/page, up to 5000) → cosine similarity
  - **Keyword path:** Weighted scoring (content ×1, name ×3, exact phrase bonus)
  - **Fusion:** RRF with k=60
- **Deduplication:** Max 3 chunks per document, min score 0.3
- **Token budget:** 3000 tokens max for context assembly

### Source 4: Legacy KB (KnowledgeContextService)
- **File:** `services/ai/knowledgeContext.ts` (803 lines)
- **Storage:** Client-provided `folderMap` (pre-cached Google Drive file index)
- **Method:** Weighted relevance scoring:
  - Product match: +300
  - Pharmacy match: +250
  - Brand→canonical mapping: +200
  - Folder structure boost, keyword overlap
- **Content:** Pre-cached text or on-the-fly extraction via `gemini-2.0-flash` (for binary files)

### Fallback Chain
```
1. Vector KB results? → Use them
2. Legacy KB results? → Use them
3. Service Account Drive search → searchDriveWithServiceAccount()
4. User OAuth Drive search → searchDriveWithContent()
5. "No documents found" → Proceed without KB context
```

---

## System Prompt Construction

**Function:** `buildSystemPrompt()` in route.ts

```
ENHANCED_SYSTEM_PROMPT (inline, ~2000 chars)
+ "Current date/time: ..."
+ [KB Context] (if any)
  + "IMPORTANT: Always cite your sources..."
+ [Memory Context] (if any)
  + "User information: ..."
+ [Application Context] (if provided)
  + "Current application: ..."
+ [RAG Context] (if any)
  + "Reference documents: ..."
+ [Tier Instructions]
  + Free tier: "Be concise..."
  + Pro tier: "Provide detailed analysis..."
```

**Note:** route.ts defines its own `ENHANCED_SYSTEM_PROMPT` inline (~2000 chars) and does NOT import from `lib/systemPrompt.ts`. The `lib/systemPrompt.ts` file contains:
- `AMBLE_SYSTEM_PROMPT` — Used by BillingView for patient reply drafting
- `AMBLE_ENHANCED_SYSTEM_PROMPT` — Similar but not identical to the inline version

---

## Web Search Decision

**Function:** `determineWebSearch()` in route.ts

```
if (capabilities?.webBrowse === false) → no search
if (kbContext found && no explicit search request) → no search
MagicRouter.detectNeedsWebSearch(query) → shouldSearch && confidence > 0.6
```

### Search Intent Analysis (MagicRouter)
6 pattern categories: explicit requests, real-time keywords, news, factual, comparison, always-search domains. Returns `shouldSearch`, `intent`, `confidence`, `suggestedSources`, `extractedEntities`, `timeContext`.

---

## Streaming Architecture

### Server-Sent Events (SSE) Protocol

```
Content-Type: text/event-stream

data: {"type":"trace","event":"memory","status":"searching","message":"..."}
data: {"type":"trace","event":"vectorKB","status":"found","message":"..."}
data: {"type":"trace","event":"legacyKB","status":"skipped","message":"..."}
data: {"type":"content","text":"Hello, "}
data: {"type":"content","text":"how can I help?"}
data: {"type":"usage","promptTokens":150,"completionTokens":45,"model":"gemini-3-flash"}
data: {"type":"kbSources","sources":[{"name":"...","path":"..."}]}
data: [DONE]
```

### Client Processing (StreamingService)
- Reads SSE via `ReadableStream` + `TextDecoder`
- Buffers chunks in 50ms batches for smooth UI updates
- Extracts `trace` events → displayed in ThinkingProcess panel
- Extracts `usage` metadata → token tracking
- `[DONE]` sentinel terminates the stream
- Timeout: 5min for reasoning models, 3min standard

### OpenAI Agentic Tool Loop
```
while (turns < MAX_TURNS(5)):
    Stream response
    if response includes tool_calls:
        for each tool_call:
            if server tool → ToolExecutor.execute()
            if client tool → emit "pending" stub
        Push tool results back into messages
        Re-prompt model with updated messages
    else:
        Break (final answer reached)
```

---

## Tool System

### Server-Side Tools (ToolExecutor)
**File:** `services/ai/tools.ts`

| Tool | Parameters | Action |
|------|-----------|--------|
| `get_patient_details` | `patientId: string` | Firestore `patients` lookup (mock fallback) |
| `search_billing_codes` | `query: string, type?: enum` | In-memory CPT/ICD-10/HCPCS search |

### Agent Tools
**Files:** `services/ai/tools/`

| Tool | Used By | Action |
|------|---------|--------|
| `delegate_task` | PlannerAgent | `globalExecutor.execute(agentName, task)` |
| `web_search` | ResearcherAgent | `POST /api/tools/search` |
| `web_extract` | (available, unwired) | `POST /api/tools/extract` |
| `list_documents` | ResearcherAgent | Firestore `documents` query by projectId |
| `read_document` | ResearcherAgent | Reconstruct doc from overlapping chunks |

### Google-Side Tools
- `googleSearch` tool passed to Gemini when web search is determined necessary
- `thinkingConfig` with budget passed for reasoning-tier models

---

## Agent System

**Files:** `lib/agents/`, `services/ai/agentSystem.ts`

### Architecture

```
globalExecutor (AgentExecutor singleton)
├── PlannerAgent
│   ├── Model: gpt-4o
│   ├── Tool: DelegateTool
│   └── Role: Break down complex requests, delegate to specialists
├── ResearcherAgent
│   ├── Model: gpt-4o
│   ├── Tools: SearchTool, ListDocumentsTool, ReadDocumentTool
│   └── Role: Multi-source research, citations, structured output
└── CoderAgent
    ├── Model: gpt-4o
    ├── Tools: none (Phase 3 placeholder)
    └── Role: Full-stack code generation + review
```

### Execution Flow

```
route.ts: if agentMode → dynamic import globalExecutor
    │
    ▼
globalExecutor.execute(agentName, query, context)
    │
    ▼
agent.run(goal, context)          ─── BaseAgent abstract class
    │                                   Max 5 steps per agent
    ▼
ModelGateway.generateText()       ─── Calls POST /api/chat (non-streaming)
    │
    ├── Response includes tool_calls?
    │   ├── YES: Execute each tool → push results → loop
    │   └── NO: Return final answer
    │
    ├── Optional: reviewOutput() → GPT-4o self-correction
    │
    └── Return AgentResult { response, steps, toolsUsed }
```

---

## Knowledge Systems Comparison

| System | Type | Storage | Search Method | Used By | Status |
|--------|------|---------|---------------|---------|--------|
| **RAGService** | Server-side | Firestore `chunks` (by projectId) | Embedding cosine + LLM re-rank | route.ts `fetchContextParallel` | Legacy (project-scoped) |
| **RAGPipeline** | Server-side | Firestore `kb_chunks` | Hybrid: Vector RRF + keyword | route.ts `fetchContextParallel` via `quickSearch` | Active (company KB) |
| **KnowledgeContextService** | Server-side | Client-provided folderMap | Weighted keyword scoring | route.ts `fetchContextParallel` | Legacy (Drive folder map) |
| **KnowledgeBaseManager** | Server-side | Firestore `kb_chunks`, `kb_documents` | Delegates to EmbeddingService | RAGPipeline, route.ts | Active (orchestrator) |
| **EmbeddingService** | Server-side | Firestore `kb_chunks` | Hybrid: cosine + keyword + RRF | KnowledgeBaseManager | Active (core engine) |
| **DriveSearchService** | Server-side | Google Drive API (real-time) | Full-text + filename + BFS | route.ts fallback | Active (fallback) |
| **SearchOrchestrator** | Client-side | IndexedDB + FolderMap + web | KB scoring + web fetch | SearchService | Active (client-side) |
| **KnowledgeBaseIndexer** | Client-side | IndexedDB | Local keyword scoring | SearchOrchestrator | Active (client offline) |
| **DriveSync** | Background | Drive → Firestore `kb_documents`/`kb_chunks` | (indexing, not search) | KnowledgeBaseManager | Active (sync pipeline) |

### Recommendation
The three server-side context sources (RAGService, RAGPipeline/KBManager, KnowledgeContextService) all run in parallel on every chat request. Consider:
1. Deprecating `RAGService` (old project RAG) if no projects actively use it
2. Deprecating `KnowledgeContextService` (legacy folder map) once vector KB is fully synced
3. This would reduce per-request API calls and latency

---

## Cost-Relevant Models

| Model | Use Case | Input $/1M | Output $/1M |
|-------|----------|-----------|-------------|
| `gpt-5` | Frontier chat | $5.00 | $15.00 |
| `gpt-5-mini` | Standard chat | $0.15 | $0.60 |
| `gpt-5-nano` | Quick responses | $0.05 | $0.20 |
| `gpt-4o-mini` | Memory extraction, re-ranking, classification | $0.15 | $0.60 |
| `o3` | Deep reasoning | $15.00 | $60.00 |
| `text-embedding-3-small` | KB embeddings | $0.02 | — |
| `gemini-3-flash` | Default chat (cost-optimized) | $0.35 | $1.05 |
| `gemini-3-pro` | Complex chat | $5.00 | $15.00 |
| `gemini-2.0-flash` | Binary file extraction (OCR) | ~$0.35 | ~$1.05 |
| `whisper-1` | Audio transcription | per-second pricing | — |
| `tts-1` | Text-to-speech | per-character pricing | — |
