/**
 * Chat Route Handler
 * 
 * Handles /api/chat endpoint for AI chat completions.
 * Supports both OpenAI and Gemini models with tool calling.
 * Includes company Knowledge Base search via Google Drive Service Account.
 */

const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const { logUsageToFirestore } = require('../services/usageService');
const { searchKnowledgeBase } = require('../services/knowledgeService');
const { searchTavily, extractTavily } = require('../services/searchService');
const { analyzeSearchIntent, intelligentSearch, formatSearchContext } = require('../services/intelligentSearch');
const { searchDriveWithServiceAccount } = require('../services/driveSearchService');
const { vectorRetrieve, verifyGroundedness, MIN_SCORE } = require('../services/kbRetrieval');

// Vertex AI — authenticated via ADC (the Cloud Function's runtime service
// account, which has roles/aiplatform.user). No API key needed.
const VERTEX_PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';
// Latest Gemini (3.x) is served on the Vertex "global" endpoint, not regional.
const VERTEX_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';

// ── HIPAA / PHI-safe mode ───────────────────────────────────────────────────
// Chat content can carry PHI. Vertex AI is inside Google Cloud's HIPAA BAA;
// the OpenAI API is NOT (unless an OpenAI BAA is executed). When PHI_SAFE_MODE
// is on (default), ALL chat stays on Vertex — the resilience fallback retries a
// STABLE Vertex model instead of OpenAI, and an explicitly-selected OpenAI model
// is routed to Vertex too. Set PHI_SAFE_MODE='false' to restore OpenAI usage
// (only after an OpenAI BAA is in place). See SOT §10.2 P0.
const PHI_SAFE_MODE = process.env.PHI_SAFE_MODE !== 'false';
// Stable, GA Vertex model used as the in-BAA fallback (preview IDs can rotate
// out; this one won't). Confirmed available on the regional us-central1 endpoint.
const VERTEX_FALLBACK_MODEL = 'gemini-2.5-flash';
const VERTEX_FALLBACK_LOCATION = 'us-central1';

// ============================================================================
// Model Mapping
// ============================================================================

function normalizeModel(model) {
  // OpenAI GPT-5 series
  if (model === 'gpt-5.0-mini') return 'gpt-5-mini';
  if (model === 'gpt-5-2') return 'gpt-5.2';
  if (model === 'o1-mini') return 'gpt-5-mini';
  if (model === 'o1' || model === 'o1-preview') return 'gpt-5.2';
  if (model === 'auto') return 'gemini-3-flash-preview';

  // Gemini → latest Vertex (global endpoint) models: 3.1 Pro (pro/reasoning)
  // and 3 Flash (fast). Collapse every Gemini selection to these two.
  if (typeof model === 'string' && model.startsWith('gemini')) {
    if (model.includes('pro') || model.includes('thinking')) return 'gemini-3.1-pro-preview';
    return 'gemini-3-flash-preview';
  }

  return model;
}

function isProbablyGeminiModel(model) {
  if (!model) return false;
  return String(model).startsWith('gemini') || String(model).startsWith('imagen') || String(model).startsWith('veo');
}

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(hasKBContext = false, kbDocTitles = []) {
  const currentDate = new Date().toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  
  let prompt = `You are Amble AI, an intelligent assistant for Amble Health with access to a company Knowledge Base and real-time web search.
Current Date: ${currentDate}

CAPABILITIES:
- Company Knowledge Base (KB): product info, pricing, policies, pharmacy details, SOPs
- Real-time web search for current events, general info, medical research
- Healthcare domain expertise`;

  if (hasKBContext) {
    const docList = kbDocTitles.length > 0 
      ? `\nDocuments provided: ${kbDocTitles.map((t, i) => `[${i+1}] ${t}`).join(', ')}`
      : '';

    prompt += `

KNOWLEDGE BASE RULES (CRITICAL — GROUNDING CONTRACT, FOLLOW EXACTLY):
1. The KB excerpts below are your PRIMARY and AUTHORITATIVE source. Use them FIRST.${docList}
2. Answer ONLY from the KB excerpts. Every factual claim (prices, names, dosages, policies, procedures) MUST be supported by an excerpt — do NOT infer, assume, generalize, or fabricate.
3. Cite the excerpt number inline for each claim, e.g. "[1]" or "According to [2] (Semaglutide)…". A claim without a supporting excerpt must not be stated as fact.
4. Extract SPECIFIC data verbatim. Prefer the excerpt whose title most closely matches the topic.
5. If the excerpts only PARTIALLY answer, give what IS supported and clearly state which part isn't in the KB.
6. ABSTAIN HONESTLY: if the excerpts do NOT contain the answer, say so plainly ("I don't have that in the knowledge base") and offer to search the web — do NOT answer from prior/general knowledge and do NOT guess.
7. Never present web or general knowledge as if it came from the KB.`;
  }

  prompt += `

RESPONSE FORMAT:
- Use markdown for structure (headers, bold, lists, tables when data is tabular).
- Cite sources inline: [1], [2], or [Document Name].
- Be conversational, concise, and accurate. Never mention APIs, tools, or technical internals.`;

  return prompt;
}

// ============================================================================
// Tool Definitions
// ============================================================================

const OPENAI_TOOLS = [
  {
    type: "function",
    function: {
      name: "search",
      description: "Search the web ONLY when the user explicitly asks for web/online information, current events, or news. Do NOT use this tool if Knowledge Base documents already answer the question. Never search the web for company-specific data like pricing, policies, or product info.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "The search query." },
          topic: { type: "string", enum: ["general", "news"], description: "The search topic." },
          days: { type: "number", description: "Days back for news (default 3, max 30)." },
          include_raw_content: { type: "boolean", description: "Set to true to get full page text." }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "extract",
      description: "Extract clean text content from specific URLs.",
      parameters: {
        type: "object",
        properties: {
          urls: { type: "array", items: { type: "string" }, description: "List of URLs to extract." }
        },
        required: ["urls"]
      }
    }
  }
];

const GEMINI_TOOLS = [{
  functionDeclarations: [
    {
      name: "search",
      description: "Search the web ONLY when the user explicitly asks for web/online information, current events, or news. Do NOT use this tool if Knowledge Base documents already answer the question. Never search the web for company-specific data like pricing, policies, or product info.",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "The search query." },
          topic: { type: "STRING", enum: ["general", "news"], description: "The search topic." },
          days: { type: "NUMBER", description: "Days back for news (default 3, max 30)." }
        },
        required: ["query"]
      }
    },
    {
      name: "extract",
      description: "Extract clean text content from specific URLs.",
      parameters: {
        type: "OBJECT",
        properties: {
          urls: { type: "ARRAY", items: { type: "STRING" }, description: "List of URLs." }
        },
        required: ["urls"]
      }
    }
  ]
}];

// ============================================================================
// Tool Execution
// ============================================================================

async function executeToolCall(toolName, args) {
  if (toolName === 'search') {
    console.log(`[Chat] Executing Search: ${args.query}`);
    const results = await searchTavily(args.query, args);
    return {
      id: Math.random().toString(36).substring(7),
      toolName: 'search',
      args,
      result: { results },
      status: 'completed'
    };
  }
  
  if (toolName === 'extract') {
    console.log(`[Chat] Executing Extract: ${args.urls?.length} URLs`);
    const results = args.urls?.length ? await extractTavily(args.urls) : [];
    return {
      id: Math.random().toString(36).substring(7),
      toolName: 'web_extract',
      args,
      result: { results },
      status: 'completed'
    };
  }
  
  return { status: 'error', error: `Unknown tool: ${toolName}` };
}

// ============================================================================
// Gemini Chat Handler
// ============================================================================

async function handleGeminiChat(req, res, { adminDb, messages, model, stream, userId, useDeepThinking, disableWebTools, location }) {
  // Vertex AI client (ADC auth via the function's runtime service account).
  // `location` defaults to the global endpoint (Gemini 3.x); the in-BAA fallback
  // passes a regional endpoint where the stable GA model is served.
  const ai = new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: location || VERTEX_LOCATION });

  // Combine ALL system messages so KB context injected as a later system msg isn't lost
  const allSystemMsgs = messages.filter(m => m?.role === 'system');
  const combinedSystemContent = allSystemMsgs.map(m => m.content).join('\n\n');

  const config = {
    temperature: 1.0,
    maxOutputTokens: 8192,
  };
  if (combinedSystemContent) config.systemInstruction = combinedSystemContent;
  if (!disableWebTools) config.tools = GEMINI_TOOLS;

  // Build the conversation as `contents` (system goes in config, not contents).
  let contents = messages
    .filter(m => m?.role !== 'system')
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));

  let response;
  try {
    response = await ai.models.generateContent({ model, contents, config });
  } catch (err) {
    console.error(`[Gemini/Vertex Error] Model: ${model}, Message: ${err.message}`);
    return {
      status: 400,
      error: `Gemini API Error (${model})`,
      details: err.message,
    };
  }

  // Handle Tool Calls (manual multi-turn loop — generateContent is stateless)
  let executedToolCalls = [];
  let functionCalls = response.functionCalls; // getter → array | undefined
  while (functionCalls && functionCalls.length > 0) {
    // Append the model's function-call turn, then our function responses.
    const modelTurn = response.candidates?.[0]?.content;
    if (modelTurn) contents.push(modelTurn);

    const toolParts = [];
    for (const call of functionCalls) {
      console.log(`[Chat-Gemini/Vertex] Tool Call: ${call.name}`);
      let functionResponse = { result: 'No result' };
      try {
        const toolResult = await executeToolCall(call.name, call.args);
        executedToolCalls.push(toolResult);
        functionResponse = toolResult.result;
      } catch (err) {
        functionResponse = { error: err.message };
      }
      toolParts.push({
        functionResponse: {
          name: call.name,
          response: { name: call.name, content: functionResponse },
        },
      });
    }
    contents.push({ role: 'user', parts: toolParts });

    response = await ai.models.generateContent({ model, contents, config });
    functionCalls = response.functionCalls;
  }

  const text = response.text || '';
  const um = response.usageMetadata || {};
  const usage = {
    total_tokens: um.totalTokenCount || 0,
    input_tokens: um.promptTokenCount || 0,
    output_tokens: um.candidatesTokenCount || 0,
  };

  await logUsageToFirestore(adminDb, userId, model, usage);

  return { text, usage, toolCalls: executedToolCalls };
}

// ============================================================================
// OpenAI Chat Handler
// ============================================================================

async function handleOpenAIChat(req, res, { adminDb, messages, model, stream, userId, disableWebTools }) {
  if (!process.env.OPENAI_API_KEY) {
    return { status: 500, error: 'OPENAI_API_KEY is missing' };
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  let completion;
  try {
    const completionOpts = {
      model,
      messages,
    };
    // Only provide web search tools when KB context is NOT present
    if (!disableWebTools) {
      completionOpts.tools = OPENAI_TOOLS;
      completionOpts.tool_choice = "auto";
    }
    completion = await openai.chat.completions.create(completionOpts);
  } catch (modelErr) {
    console.warn(`Model ${model} failed:`, modelErr.message);
    return { 
      text: `⚠️ **System Warning**: The selected model \`${model}\` is unavailable.\n\nPlease switch to **ChatGPT 5**, **GPT-5.2**, **Gemini 2.5 Flash**, or **Gemini 3 Pro**.` 
    };
  }

  const choice = completion.choices[0];
  const message = choice.message;

  // Handle Tool Calls
  if (message.tool_calls?.length > 0) {
    const newMessages = [...messages, message];
    const executedToolCalls = [];

    for (const toolCall of message.tool_calls) {
      let content = "Error";
      let args = {};
      
      try { 
        args = JSON.parse(toolCall.function.arguments); 
      } catch(e) {}
      
      const toolResult = await executeToolCall(toolCall.function.name, args);
      toolResult.id = toolCall.id;
      executedToolCalls.push(toolResult);
      content = JSON.stringify(toolResult.result?.results || toolResult.error || "No result");

      newMessages.push({
        tool_call_id: toolCall.id,
        role: "tool",
        name: toolCall.function.name,
        content,
      });
    }

    // Final call after tools
    const secondResponse = await openai.chat.completions.create({
      model,
      messages: newMessages,
    });
    
    const finalContent = secondResponse.choices[0].message.content;
    const usage = secondResponse.usage;
    
    if (usage) {
      await logUsageToFirestore(adminDb, userId, model, usage);
    }
    
    return { text: finalContent, usage, toolCalls: executedToolCalls };
  }

  // No tool calls
  const usage = completion.usage;
  if (usage) {
    await logUsageToFirestore(adminDb, userId, model, usage);
  }
  
  return { text: message.content, usage };
}

// ============================================================================
// Query Reformulation for Multi-Turn Context
// ============================================================================

/**
 * Reformulate the user's query using recent conversation for coreference resolution.
 * E.g., "what about pricing?" with previous context about semaglutide → "semaglutide pricing"
 */
function reformulateQuery(userQuery, messages) {
  const last5 = messages.slice(-6).filter(m => m.role === 'user' || m.role === 'assistant');
  if (last5.length < 2) return userQuery;

  // Extract key entities from recent messages (simple heuristic — no LLM call)
  const entityPattern = /\b(tirzepatide|semaglutide|ozempic|wegovy|mounjaro|zepbound|hallandale|perfectrx|reviverx|gogomeds|empower|valor|boothwyn|pharmacy|medication|product|policy|training|department)\b/gi;
  const recentEntities = new Set();
  for (const msg of last5) {
    const content = typeof msg.content === 'string' ? msg.content : '';
    const matches = content.match(entityPattern);
    if (matches) matches.forEach(m => recentEntities.add(m.toLowerCase()));
  }

  // Check if current query is ambiguous (contains pronouns or is very short)
  const isAmbiguous = /\b(it|its|this|that|these|those|they|them|the same|pricing|cost|price)\b/i.test(userQuery) && userQuery.split(/\s+/).length < 8;
  
  if (isAmbiguous && recentEntities.size > 0) {
    // Prepend the most relevant entity to disambiguate
    const entities = [...recentEntities];
    const expanded = `${entities.join(' ')} ${userQuery}`;
    console.log(`[QueryReform] "${userQuery}" → "${expanded}"`);
    return expanded;
  }

  return userQuery;
}

// ============================================================================
// Content Cache (Firestore-backed)
// ============================================================================

/**
 * Check if a recent KB search result is cached for this query.
 * Uses a simple exact-match cache with 1-hour TTL.
 */
async function getCachedKBResults(adminDb, queryKey) {
  try {
    const cacheRef = adminDb.collection('kb_search_cache').doc(queryKey);
    const doc = await cacheRef.get();
    if (doc.exists) {
      const data = doc.data();
      if (data.expiresAt > Date.now()) {
        console.log('[Cache] ✅ KB search cache HIT for:', queryKey.substring(0, 50));
        return data.results;
      }
    }
  } catch (e) {
    // Cache miss — not critical
  }
  return null;
}

async function setCachedKBResults(adminDb, queryKey, results) {
  try {
    await adminDb.collection('kb_search_cache').doc(queryKey).set({
      results,
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour TTL
      createdAt: Date.now(),
    });
  } catch (e) {
    // Cache write failure — not critical
  }
}

// ============================================================================
// Main Handler — CONSOLIDATED KB SEARCH ARCHITECTURE
// ============================================================================

/**
 * All KB search is done here on the server. The client MAY send pre-searched
 * KB context as a system message; if so, we use it. If not, we search.
 * This eliminates duplicate Drive API calls.
 */
async function handleChat(req, res, { adminDb, writeJson, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const messages = body.messages;
    const originalModel = body.model || 'gpt-4o';
    let model = normalizeModel(originalModel);
    
    const stream = !!body.stream;
    const userId = body.userId || 'anonymous';
    const projectId = body.projectId;
    const useRAG = !!body.useRAG;
    const useDeepThinking = originalModel === 'gemini-3-thinking' || body.reasoningMode === 'thinking';
    
    // Determine which view/tab is calling — KB search only runs for the Amble AI tab
    const viewContext = body.context?.view || '';
    const isAmbleView = !viewContext || viewContext === 'amble' || viewContext === 'AmbleAI';
    console.log(`[Chat] View: ${viewContext || '(default/amble)'}, isAmbleView: ${isAmbleView}`);

    if (!Array.isArray(messages)) {
      return writeJson(res, 400, { error: 'Messages array is required' });
    }

    // --- RAG Injection (user-uploaded docs) ---
    let systemPromptAugmentation = "";
    const lastUserMsg = messages[messages.length - 1];
    const userQuery = typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : JSON.stringify(lastUserMsg?.content || '');

    if (useRAG && lastUserMsg?.role === 'user') {
      console.log(`[RAG] Searching for: ${userQuery}`);
      const ragResults = await searchKnowledgeBase(adminDb, userQuery, userId, projectId);
      if (ragResults.length > 0) {
        console.log(`[RAG] Found ${ragResults.length} contexts`);
        systemPromptAugmentation = `\n\n### RETRIEVED KNOWLEDGE BASE CONTEXT ###\n${ragResults.map((r, i) => `[Doc ${i+1}: ${r.filename}]\n${r.text}`).join("\n\n")}\n### END CONTEXT ###\n`;
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // COMPANY KB SEARCH — Single authoritative search path (server-only)
    // ══════════════════════════════════════════════════════════════════════
    let companyKBContext = "";
    let hasCompanyKB = false;
    let kbDocTitles = [];
    let kbMaxScore = 0; // top vector relevance — gates the groundedness post-check

    // Check if client already sent KB context (from SearchService)
    const allSystemMessages = messages.filter(m => m.role === 'system');
    // Detect client KB context — matches both old emoji format and new compact format
    const clientKBMsg = isAmbleView ? allSystemMessages.find(m => 
      m.content?.includes('KNOWLEDGE BASE') && 
      (m.content?.includes('Document') || m.content?.includes('📄') || m.content?.includes('END KNOWLEDGE BASE'))
    ) : null;

    if (clientKBMsg) {
      // Client already searched — use its results. Don't search again.
      hasCompanyKB = true;
      console.log('[Chat] Client already provided KB context — skipping server search');
    } else if (isAmbleView) {
      // CLIENT DID NOT SEARCH — Server searches. Multi-turn query reformulation.
      const reformulatedQuery = reformulateQuery(userQuery, messages);

      // ══ PRIMARY: semantic vector retrieval (gemini-embedding-001 @1536) ══
      // Always attempt — fast (<~1s), gives true semantic recall (synonyms,
      // paraphrases) instead of brittle keyword matching. Chunk-level + reranked.
      let vec = { chunks: [], maxScore: 0 };
      try {
        vec = await vectorRetrieve(adminDb, reformulatedQuery, { limit: 8, maxPerDoc: 3 });
      } catch (e) {
        console.warn('[Chat] vectorRetrieve error:', e.message);
      }

      if (vec.chunks.length > 0 && vec.maxScore >= MIN_SCORE) {
        hasCompanyKB = true;
        kbMaxScore = vec.maxScore;
        kbDocTitles = [...new Set(vec.chunks.map(c => c.title))];
        console.log(`[Chat] ✅ Vector KB: ${vec.chunks.length} chunks from ${kbDocTitles.length} docs (top ${(vec.maxScore * 100).toFixed(0)}%)`);

        companyKBContext = '\n\n--- COMPANY KNOWLEDGE BASE (most relevant excerpts) ---\n';
        vec.chunks.forEach((c, i) => {
          const dept = c.department ? ` [${c.department}]` : '';
          const rel = c.score ? ` (relevance ${(c.score * 100).toFixed(0)}%)` : '';
          companyKBContext += `\n[${i + 1}] "${c.title}"${dept}${rel}\n${(c.text || '').substring(0, 4000)}\n`;
        });
        companyKBContext += '\n--- END KNOWLEDGE BASE ---\n';
      } else {
        // ══ FALLBACK: legacy live-Drive keyword search ══
        // Covers a cold/empty vector index (before first reindex) or a query
        // the vector store doesn't cover well. Keyword-gated to limit cost.
        const kbKeywords = /\b(price|pricing|cost|costs|fee|charge|how\s+much|product|products|formulary|pharmacy|pharmacies|medication|medications|drug|drugs|tirzepatide|semaglutide|ozempic|wegovy|mounjaro|zepbound|policy|policies|procedure|procedures|training|onboarding|benefit|benefits|catalog|inventory|dosage|dose|compound|compounding|supply|vendor|cancellation|cancel|refund|shipping|delivery|milligram|mg|injection|pen|vial|provider|patient|department|billing|insurance|copay|prior\s+auth|enrollment)\b/i;
        if (kbKeywords.test(userQuery)) {
          const cacheKey = reformulatedQuery.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').substring(0, 100);
          console.log(`[Chat] Vector miss — live-Drive fallback for: "${reformulatedQuery.substring(0, 80)}"`);

          let kbResults = await getCachedKBResults(adminDb, cacheKey);
          if (!kbResults) {
            try {
              kbResults = await searchDriveWithServiceAccount(reformulatedQuery, 5);
              if (kbResults && kbResults.length > 0) {
                await setCachedKBResults(adminDb, cacheKey, kbResults.map(r => ({
                  title: r.title,
                  content: (r.content || '').substring(0, 8000),
                  score: r.score,
                  metadata: r.metadata,
                })));
              }
            } catch (kbErr) {
              console.error('[Chat] live-Drive fallback failed:', kbErr.message);
              kbResults = [];
            }
          }

          if (kbResults && kbResults.length > 0) {
            hasCompanyKB = true;
            kbDocTitles = kbResults.map(r => r.title);
            console.log(`[Chat] ✅ Drive fallback found ${kbResults.length} docs: ${kbDocTitles.join(', ')}`);
            companyKBContext = '\n\n--- COMPANY KNOWLEDGE BASE ---\n';
            kbResults.forEach((doc, i) => {
              const dept = doc.metadata?.department ? ` [${doc.metadata.department}]` : '';
              const score = doc.score ? ` (relevance: ${(doc.score * 100).toFixed(0)}%)` : '';
              const content = (doc.content || '').substring(0, 8000);
              companyKBContext += `\n[${i + 1}] "${doc.title}"${dept}${score}\n${content}\n`;
            });
            companyKBContext += '\n--- END KNOWLEDGE BASE ---\n';
          } else {
            console.log('[Chat] KB search returned 0 results');
          }
        }
      }
    }

    // --- Auto-Search (Web) --- ONLY if no KB results
    let searchContextAugmentation = "";
    const skipWebSearch = hasCompanyKB;
    
    if (!skipWebSearch) {
      const searchIntent = analyzeSearchIntent(userQuery);
      console.log(`[AutoSearch] Intent: ${searchIntent.intent}, Confidence: ${searchIntent.confidence}`);
      
      if (searchIntent.shouldSearch && searchIntent.confidence > 0.6) {
        try {
          const searchResults = await intelligentSearch(userQuery, {
            maxResults: 8,
            extractContent: true,
            useOptimized: true
          });
          if (searchResults.results?.length > 0) {
            searchContextAugmentation = formatSearchContext(searchResults, { maxChars: 40000 });
            console.log(`[AutoSearch] Found ${searchResults.results.length} results`);
          }
        } catch (searchError) {
          console.error('[AutoSearch] Search failed:', searchError.message);
        }
      }
    } else {
      console.log('[Chat] Skipping web search — KB context available');
    }

    // --- Build System Prompt ---
    const hasAnyKBContext = hasCompanyKB;
    let systemContent = buildSystemPrompt(hasAnyKBContext, kbDocTitles);
    if (systemPromptAugmentation) systemContent += systemPromptAugmentation;
    if (companyKBContext) systemContent += companyKBContext;
    if (searchContextAugmentation) systemContent += searchContextAugmentation;

    const systemIndex = messages.findIndex(m => m.role === 'system');
    if (systemIndex >= 0) {
      messages[systemIndex] = { ...messages[systemIndex], content: messages[systemIndex].content + "\n" + systemContent };
    } else {
      messages.unshift({ role: 'system', content: systemContent });
    }

    // --- Route to appropriate handler ---
    const disableWebTools = hasAnyKBContext;
    let result;
    
    if (isProbablyGeminiModel(model)) {
      result = await handleGeminiChat(req, res, { adminDb, messages, model, stream, userId, useDeepThinking, disableWebTools });
      // Resilience: if Vertex/Gemini errors (e.g. a preview model rotated out or
      // a transient Vertex issue), retry so chat never hard-fails. In PHI-safe
      // mode the retry stays on Vertex (a stable GA model) so chat content never
      // leaves the GCP BAA boundary; otherwise it falls back to OpenAI.
      if (result.status && result.error) {
        if (PHI_SAFE_MODE) {
          console.warn(`[Chat] Gemini ${model} failed (${result.error}) — PHI-safe Vertex fallback → ${VERTEX_FALLBACK_MODEL}`);
          result = await handleGeminiChat(req, res, { adminDb, messages, model: VERTEX_FALLBACK_MODEL, stream, userId, useDeepThinking, disableWebTools, location: VERTEX_FALLBACK_LOCATION });
        } else {
          console.warn(`[Chat] Gemini path failed (${result.error}) — falling back to OpenAI`);
          result = await handleOpenAIChat(req, res, { adminDb, messages, model: 'gpt-5-mini', stream, userId, disableWebTools });
        }
      }
    } else if (PHI_SAFE_MODE) {
      // A non-Gemini (OpenAI) model was explicitly selected. PHI-safe mode keeps
      // chat inside the GCP BAA: serve it from Vertex Gemini instead of OpenAI.
      console.warn(`[Chat] PHI-safe mode: routing '${model}' to Vertex (gemini-3-flash-preview) instead of OpenAI`);
      result = await handleGeminiChat(req, res, { adminDb, messages, model: 'gemini-3-flash-preview', stream, userId, useDeepThinking, disableWebTools });
      if (result.status && result.error) {
        result = await handleGeminiChat(req, res, { adminDb, messages, model: VERTEX_FALLBACK_MODEL, stream, userId, useDeepThinking, disableWebTools, location: VERTEX_FALLBACK_LOCATION });
      }
    } else {
      result = await handleOpenAIChat(req, res, { adminDb, messages, model, stream, userId, disableWebTools });
    }

    if (result.status && result.error) {
      return writeJson(res, result.status, { error: result.error, details: result.details });
    }

    // ── Groundedness post-check (SOT §8.5 layer 5) ──
    // Only for KB-grounded answers at BORDERLINE confidence (high-confidence
    // matches skip it → no latency cost), and only when enabled. Fail-open:
    // appends a non-destructive caveat if the judge flags the answer.
    if (hasCompanyKB && result.text && process.env.KB_GROUNDEDNESS_CHECK !== '0'
        && kbMaxScore > 0 && kbMaxScore < 0.55) {
      try {
        const { grounded } = await verifyGroundedness(result.text, companyKBContext);
        if (!grounded) {
          console.warn(`[Chat] ⚠️ groundedness flagged (top score ${(kbMaxScore * 100).toFixed(0)}%) — appending caveat`);
          result.text += `\n\n_Note: I'm not fully certain the knowledge base covers all of the above — please verify the specifics._`;
        }
      } catch (e) {
        console.warn('[Chat] groundedness post-check error (ignored):', e?.message);
      }
    }

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ content: result.text, toolCalls: result.toolCalls })}\n\n`);
      if (result.usage?.total_tokens > 0) {
        res.write(`data: ${JSON.stringify({ usage: result.usage })}\n\n`);
      }
      res.write('data: [DONE]\n\n');
      return res.end();
    }

    return writeJson(res, 200, { reply: result.text, usage: result.usage, toolCalls: result.toolCalls });

  } catch (e) {
    console.error('Error in chat handler:', e);
    return writeJson(res, 500, { error: e.message || 'Internal Server Error' });
  }
}

module.exports = { handleChat };
