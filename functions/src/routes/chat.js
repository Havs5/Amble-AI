/**
 * Chat Route Handler
 * 
 * Handles /api/chat endpoint for AI chat completions.
 * Supports both OpenAI and Gemini models with tool calling.
 * Includes company Knowledge Base search via Google Drive Service Account.
 */

const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { logUsageToFirestore } = require('../services/usageService');
const { searchKnowledgeBase } = require('../services/knowledgeService');
const { searchTavily, extractTavily } = require('../services/searchService');
const { analyzeSearchIntent, intelligentSearch, formatSearchContext } = require('../services/intelligentSearch');
const { searchDriveWithServiceAccount } = require('../services/driveSearchService');

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
  
  // Gemini 3 series
  if (model === 'gemini-3-flash') return 'gemini-3-flash-preview';
  if (model === 'gemini-3-pro') return 'gemini-3-pro-preview';
  if (model === 'gemini-3-thinking') return 'gemini-3-pro-preview';
  if (model === 'gemini-2.5-pro') return 'gemini-2.5-pro';
  if (model === 'gemini-2.5-flash') return 'gemini-2.5-flash';
  if (model.includes('gemini-2.0')) return 'gemini-2.0-flash';
  
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

KNOWLEDGE BASE RULES (CRITICAL — FOLLOW EXACTLY):
1. The KB documents below are your PRIMARY source. Use them FIRST.${docList}
2. NEVER say "I couldn't find information" if any KB document contains relevant data.
3. Extract and present SPECIFIC data (prices, names, dosages, procedures) directly from KB docs.
4. Prefer the document whose title most closely matches the topic (e.g., query about "semaglutide" → prefer doc named "Semaglutide").
5. State ONLY facts EXPLICITLY written in KB docs. Do NOT infer, assume, or fabricate.
6. If docs partially answer the question, present what's available and note gaps.
7. Cite documents inline: "According to [Semaglutide doc], the pricing is..."
8. Fall back to web search or general knowledge ONLY when KB docs do not cover the topic.`;
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

async function handleGeminiChat(req, res, { adminDb, messages, model, stream, userId, useDeepThinking, disableWebTools }) {
  if (!process.env.GEMINI_API_KEY) {
    return { status: 500, error: 'GEMINI_API_KEY is missing' };
  }

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  
  const generationConfig = {
    temperature: 1.0,
    maxOutputTokens: 8192,
  };
  
  if (useDeepThinking && model.includes('gemini-3')) {
    generationConfig.thinkingConfig = { thinkingLevel: 'high' };
  }
  
  // Combine ALL system messages so KB context injected as a later system msg isn't lost
  const allSystemMsgs = messages.filter(m => m?.role === 'system');
  const combinedSystemContent = allSystemMsgs.map(m => m.content).join('\n\n');
  
  const geminiModel = genAI.getGenerativeModel({ 
    model,
    systemInstruction: combinedSystemContent || undefined,
    tools: disableWebTools ? undefined : GEMINI_TOOLS,
    generationConfig
  });

  const history = messages
    .filter(m => m?.role !== 'system')
    .slice(0, -1)
    .map(m => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
    }));
    
  const chat = geminiModel.startChat({ history });
  const lastMsg = messages[messages.length - 1];
  const userMessage = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content);

  let result, response, functionCalls;

  try {
    result = await chat.sendMessage(userMessage);
    response = await result.response;
    functionCalls = response.functionCalls();
  } catch (err) {
    console.error(`[Gemini API Error] Model: ${model}, Message: ${err.message}`);
    return { 
      status: 400, 
      error: `Gemini API Error (${model})`, 
      details: err.message 
    };
  }

  // Handle Tool Calls
  let executedToolCalls = [];
  while (functionCalls?.length > 0) {
    const toolParts = [];
    
    for (const call of functionCalls) {
      console.log(`[Chat-Gemini] Tool Call: ${call.name}`);
      let functionResponse = { result: "No result" };
      
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
          response: { name: call.name, content: functionResponse }
        }
      });
    }
    
    result = await chat.sendMessage(toolParts);
    response = await result.response;
    functionCalls = response.functionCalls();
  }

  const text = response.text();
  const usage = { 
    total_tokens: response.usageMetadata?.totalTokenCount || 0,
    input_tokens: response.usageMetadata?.promptTokenCount || 0,
    output_tokens: response.usageMetadata?.candidatesTokenCount || 0
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
      // CLIENT DID NOT SEARCH — Server must search. This is the primary path.
      
      // Use expanded keywords for KB detection (product names, policies, pricing, etc.)
      const kbKeywords = /\b(price|pricing|cost|costs|fee|charge|how\s+much|product|products|formulary|pharmacy|pharmacies|medication|medications|drug|drugs|tirzepatide|semaglutide|ozempic|wegovy|mounjaro|zepbound|policy|policies|procedure|procedures|training|onboarding|benefit|benefits|catalog|inventory|dosage|dose|compound|compounding|supply|vendor|cancellation|cancel|refund|shipping|delivery|milligram|mg|injection|pen|vial|provider|patient|department|billing|insurance|copay|prior\s+auth|enrollment)\b/i;
      const shouldSearchKB = kbKeywords.test(userQuery);

      if (shouldSearchKB) {
        // Multi-turn query reformulation
        const reformulatedQuery = reformulateQuery(userQuery, messages);
        const cacheKey = reformulatedQuery.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').substring(0, 100);

        console.log(`[Chat] KB search for: "${reformulatedQuery.substring(0, 80)}"`);

        // Check cache first
        let kbResults = await getCachedKBResults(adminDb, cacheKey);
        
        if (!kbResults) {
          // Search Drive via service account
          try {
            kbResults = await searchDriveWithServiceAccount(reformulatedQuery, 5);
            if (kbResults && kbResults.length > 0) {
              // Cache for future queries
              await setCachedKBResults(adminDb, cacheKey, kbResults.map(r => ({
                title: r.title,
                content: (r.content || '').substring(0, 8000), // Standardized truncation
                score: r.score,
                metadata: r.metadata,
              })));
            }
          } catch (kbErr) {
            console.error('[Chat] KB search failed:', kbErr.message);
            kbResults = [];
          }
        }

        if (kbResults && kbResults.length > 0) {
          hasCompanyKB = true;
          kbDocTitles = kbResults.map(r => r.title);
          console.log(`[Chat] ✅ KB found ${kbResults.length} docs: ${kbDocTitles.join(', ')}`);

          // Compact context format — no ASCII art, max 8K per doc, structured for LLM parsing
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
    } else {
      result = await handleOpenAIChat(req, res, { adminDb, messages, model, stream, userId, disableWebTools });
    }

    if (result.status && result.error) {
      return writeJson(res, result.status, { error: result.error, details: result.details });
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
