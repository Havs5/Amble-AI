import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import OpenAI from 'openai';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { ChatRequestSchema } from '@/lib/validation';
import { ApiError } from '@/lib/apiError';
import { MagicRouter } from '@/services/ai/router';
import { RAGService } from '@/services/ai/rag';
import { MemoryService } from '@/services/ai/memory';
import { TOOLS_DEFINITION, ToolExecutor } from '@/services/ai/tools';
import { KnowledgeContextService } from '@/services/ai/knowledgeContext';
import { rateLimitCheck } from '@/lib/rateLimiter';
// New Vector KB System
import { RAGPipeline, KnowledgeBaseManager } from '@/services/knowledge';
// Real-time Google Drive search fallback
import { searchDriveWithContent, getDriveAccessToken, searchDriveWithServiceAccount } from '@/services/knowledge/DriveSearchService';

// ============================================
// PERFORMANCE OPTIMIZATION: Connection Pooling
// ============================================
// Initialize clients once at module level for connection reuse
let openaiClient: OpenAI | null = null;
let googleClient: GoogleGenerativeAI | null = null;

const getOpenaiClient = () => {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy',
      timeout: 60000, // 60 second timeout
      maxRetries: 2, // Auto-retry on transient failures
    });
  }
  return openaiClient;
};

// Enhanced system prompt for superior AI responses with Knowledge Base integration
const ENHANCED_SYSTEM_PROMPT = `You are Amble AI, an intelligent assistant for company specialists working in billing, disputes, customer care, sales, errors/technical support, and compliance departments.

═══════════════════════════════════════════════════════════════
🎯 KNOWLEDGE BASE PRIORITY SYSTEM - CRITICAL
═══════════════════════════════════════════════════════════════

**MANDATORY: When Knowledge Base documents are provided below, you MUST:**
1. USE ONLY the information from those documents to answer
2. DO NOT use external/web search information if KB content is available
3. DO NOT make up or infer information not in the documents
4. CITE YOUR SOURCE using this exact format: [Source: Document Name]

INFORMATION SOURCE PRIORITY (Use in this order):
1. **INTERNAL KNOWLEDGE BASE** (Highest Priority - USE THIS FIRST)
   - If KB content is provided below, BASE YOUR ENTIRE ANSWER ON IT
   - Quote exact text, prices, procedures from the documents
   - Example: "According to the Tirzepatide document, the price is $X" [Source: Tirzepatide]

2. **Project/Case Context** (Second Priority)
   - Specific case notes or patient information

3. **Web Search Results** (Third Priority - Only if NO KB content)
   - Only use if Knowledge Base section is empty/not provided

4. **General Knowledge** (Lowest Priority)
   - Only if no other sources available
   - ALWAYS SAY: "This isn't in the Knowledge Base, but generally..."

═══════════════════════════════════════════════════════════════
📋 DEPARTMENT-SPECIFIC EXPERTISE
═══════════════════════════════════════════════════════════════

You assist specialists from these departments:
🏦 BILLING: Invoices, payments, charges, refunds, credits, pricing
📝 DISPUTES: Chargebacks, complaints, escalations, resolutions
💬 CUSTOMER CARE: Support inquiries, satisfaction, service
📊 SALES: Orders, subscriptions, promotions, quotes
🔧 ERRORS/TECHNICAL: Bug reports, troubleshooting, system issues
📦 SHIPPING: Delivery tracking, shipment status, courier issues
⚖️ COMPLIANCE: HIPAA, regulations, legal, policies, audits

═══════════════════════════════════════════════════════════════
💊 PRODUCT KNOWLEDGE
═══════════════════════════════════════════════════════════════

Products in our Knowledge Base (look up in KB first!):
- GLP-1 medications: Tirzepatide, Semaglutide
- Peptides: Sermorelin, Tesamorelin, PT-141
- Others: NAD, Glutathione, Lipo-C, Lipotropic+B12, Ondansetron, Acne treatments

Partner Pharmacies (each has their own folder in KB):
Absolute, Align, Boothwyn, GoGo Meds, Greenwich Rx, Hallandale, Link, Partell, Perfect Rx, Pharmacy Hub, Revive

═══════════════════════════════════════════════════════════════
📌 RESPONSE GUIDELINES - CITATION FORMAT
═══════════════════════════════════════════════════════════════

**MANDATORY CITATION FORMAT**: When you use information from a KB document, add at the end of the relevant sentence or paragraph:
[Source: Document Name]

Example: "Tirzepatide is available in 2.5mg, 5mg, and 10mg vials. [Source: Tirzepatide]"

1. **Cite Your Sources**: ALWAYS add [Source: X] citations
2. **Be Precise**: Use EXACT information from KB documents
3. **Acknowledge Limitations**: If KB doesn't have the info, say "This information is not in the Knowledge Base"
4. **No Fabrication**: NEVER make up prices, dosages, or procedures
5. **Medical Disclaimer**: Recommend consulting healthcare providers for medical questions

FORMAT: Use markdown for readability with headers, bullet points.`;

// Initialize Google client (helper)
function getGoogleClient() {
  if (!googleClient) {
    const key = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!key) throw new Error("Missing GEMINI_API_KEY");
    googleClient = new GoogleGenerativeAI(key);
  }
  return googleClient;
}

// Safety settings for Gemini (relaxed for medical/professional content)
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

// ============================================
// COST OPTIMIZATION: Limit Conversation History
// ============================================
const MAX_HISTORY_MESSAGES = 10; // Keep last 10 messages to reduce token costs

function limitMessageHistory(messages: any[]): any[] {
  if (messages.length <= MAX_HISTORY_MESSAGES) {
    return messages;
  }
  
  // Always keep the last message (current user query)
  const lastMessage = messages[messages.length - 1];
  
  // Get recent history (excluding last)
  const recentMessages = messages.slice(-(MAX_HISTORY_MESSAGES - 1), -1);
  
  // Add a summary message for older context
  const olderCount = messages.length - MAX_HISTORY_MESSAGES;
  const summaryMessage = {
    role: 'system',
    content: `[Note: ${olderCount} earlier messages in this conversation have been summarized to optimize performance. The conversation continues from here with full context of recent exchanges.]`
  };
  
  return [summaryMessage, ...recentMessages, lastMessage];
}

// ============================================
// PERFORMANCE: Parallel Data Fetching Utility
// ============================================
async function fetchContextParallel(
  userId: string | undefined,
  query: string,
  projectId: string | undefined,
  useRAG: boolean,
  knowledgeBaseData?: { folderMap?: any[]; accessToken?: string }
): Promise<{ userMemory: string; ragContext: string; knowledgeContext: string; kbSources: any[]; usedVectorKB: boolean }> {
  
  // Log KB data status
  console.log('[API fetchContext] KB data received:', {
    hasFolderMap: !!knowledgeBaseData?.folderMap,
    folderMapLength: knowledgeBaseData?.folderMap?.length || 0,
    hasAccessToken: !!knowledgeBaseData?.accessToken
  });
  
  // Check if new vector KB system is available
  let vectorKBAvailable = false;
  let vectorKBDocCount = 0;
  try {
    const kbManager = KnowledgeBaseManager.getInstance();
    const status = await kbManager.getSyncStatus();
    vectorKBAvailable = status.configured && status.documentsCount > 0;
    vectorKBDocCount = status.documentsCount;
    console.log('[API fetchContext] Vector KB available:', vectorKBAvailable, 'docs:', status.documentsCount);
  } catch (e) {
    console.log('[API fetchContext] Vector KB check failed:', e);
  }
  
  // Check if legacy KB is available
  const hasLegacyKB = knowledgeBaseData?.folderMap && knowledgeBaseData.folderMap.length > 0;
  
  const results = await Promise.allSettled([
    // Memory retrieval
    userId ? MemoryService.retrieveRelevantMemories(userId, query) : Promise.resolve(''),
    // RAG context (project-specific)
    useRAG && projectId ? RAGService.retrieveContext(query, projectId) : Promise.resolve(''),
    // Vector KB search (always try if available)
    vectorKBAvailable 
      ? RAGPipeline.getInstance().quickSearch(query, 5)
      : Promise.resolve([]),
    // Legacy Google Drive KB context (always try if available as fallback)
    hasLegacyKB
      ? KnowledgeContextService.getContextForQuery(query, knowledgeBaseData?.accessToken, knowledgeBaseData?.folderMap)
      : Promise.resolve({ hasRelevantContent: false, context: '', sources: [] })
  ]);

  // Vector KB results (new system)
  const vectorKBResults = results[2].status === 'fulfilled' 
    ? results[2].value as any[]
    : [];
    
  // Legacy KB result (Google Drive)
  const legacyKbResult = results[3].status === 'fulfilled' 
    ? results[3].value 
    : { hasRelevantContent: false, context: '', sources: [] };

  if (results[2].status === 'rejected') {
    console.error('[API fetchContext] Vector KB search failed:', results[2].reason);
  }
  if (results[3].status === 'rejected') {
    console.error('[API fetchContext] Legacy KB query failed:', results[3].reason);
  }

  // Prefer vector KB results, fall back to legacy
  let combinedKbContext = '';
  let combinedKbSources: any[] = [];
  let usedVectorKB = false;
  
  console.log('[API fetchContext] Vector KB results count:', vectorKBResults.length);
  console.log('[API fetchContext] Legacy KB has content:', legacyKbResult.hasRelevantContent);
  
  if (vectorKBResults.length > 0) {
    // Use new vector KB system
    usedVectorKB = true;
    const kbManager = KnowledgeBaseManager.getInstance();
    const ragContext = kbManager.buildRAGContext(vectorKBResults, 3000);
    combinedKbContext = `
═══════════════════════════════════════════════════════════════
📚 KNOWLEDGE BASE DOCUMENTS (Use this information FIRST)
═══════════════════════════════════════════════════════════════

${ragContext.context}

📌 Sources: ${ragContext.sources.join(', ')}
═══════════════════════════════════════════════════════════════
`;
    combinedKbSources = ragContext.sources.map(s => ({ title: s, type: 'vector_kb' }));
    console.log('[API fetchContext] Using Vector KB context, sources:', combinedKbSources.length);
    console.log('[API fetchContext] Context preview:', combinedKbContext.substring(0, 200));
  } else if (legacyKbResult.hasRelevantContent && legacyKbResult.context) {
    // Fall back to legacy KB (Google Drive with folderMap)
    combinedKbContext = legacyKbResult.context;
    combinedKbSources = legacyKbResult.sources || [];
    console.log('[API fetchContext] Using legacy KB context, sources:', combinedKbSources.length);
    console.log('[API fetchContext] Context preview:', combinedKbContext.substring(0, 200));
  } else {
    // No KB results from Vector KB or Legacy KB — try Direct Google Drive Search as last resort
    console.log('[API fetchContext] WARNING: No KB context from Vector/Legacy — trying Direct Drive Search...');
    
    let driveResults: Array<{ title: string; content: string; documentId?: string; metadata?: { department?: string; modifiedTime?: string; [key: string]: unknown } }> = [];

    // === Attempt 1: Service Account Drive Search (no user token needed) ===
    try {
      console.log('[API fetchContext] Trying Service Account Drive search...');
      const saResults = await searchDriveWithServiceAccount(query, 5);
      if (saResults.length > 0) {
        driveResults = saResults;
        console.log('[API fetchContext] ✅ Service Account Drive Search found', saResults.length, 'results!');
      } else {
        console.log('[API fetchContext] Service Account Drive Search returned 0 results');
      }
    } catch (e) {
      console.error('[API fetchContext] Service Account Drive Search failed:', e);
    }

    // === Attempt 2: User OAuth Drive Search (fallback) ===
    if (driveResults.length === 0) {
      let driveToken = knowledgeBaseData?.accessToken || null;
      if (!driveToken && userId) {
        try {
          driveToken = await getDriveAccessToken(userId);
          console.log('[API fetchContext] Got Drive token from Firestore:', !!driveToken);
        } catch (e) {
          console.log('[API fetchContext] Failed to get Drive token from Firestore:', e);
        }
      }
      
      if (driveToken) {
        try {
          const oauthResults = await searchDriveWithContent(driveToken, query, 5);
          if (oauthResults.length > 0) {
            driveResults = oauthResults;
            console.log('[API fetchContext] ✅ User OAuth Drive Search found', oauthResults.length, 'results!');
          } else {
            console.log('[API fetchContext] User OAuth Drive Search also returned 0 results');
          }
        } catch (e) {
          console.error('[API fetchContext] User OAuth Drive Search failed:', e);
        }
      } else {
        console.log('[API fetchContext] No Drive token available for OAuth search');
      }
    }

    // Format results if any were found
    if (driveResults.length > 0) {
      combinedKbContext = `\n═══════════════════════════════════════════════════════════════\n📚 KNOWLEDGE BASE DOCUMENTS (Use this information FIRST)\n═══════════════════════════════════════════════════════════════\n\n`;
      
      for (const dr of driveResults) {
        combinedKbContext += `\n📄 **${dr.title}**\n`;
        if (dr.metadata?.department) {
          combinedKbContext += `   🏷️ Department: ${dr.metadata.department}\n`;
        }
        combinedKbContext += `\n${dr.content}\n\n---\n`;
      }
      
      combinedKbContext += `\n📌 Sources: ${driveResults.map(r => r.title).join(', ')}\n═══════════════════════════════════════════════════════════════\n`;
      combinedKbSources = driveResults.map(r => ({ title: r.title, type: 'drive_search', fileId: r.documentId }));
    }
    
    // If still no results, provide guidance
    if (!combinedKbContext) {
      combinedKbContext = `\n═══════════════════════════════════════════════════════════════\n📚 KNOWLEDGE BASE SEARCH RESULTS\n═══════════════════════════════════════════════════════════════\n\nNo specific documents were found matching this query in the Knowledge Base.\nThe Knowledge Base contains information about departments, pharmacies, products, resources, and training.\n\nIf you need information from company documents, try:\n1. Using more specific terms (product names, pharmacy names, etc.)\n2. Asking about pricing, policies, or procedures\n3. Mentioning specific departments or products\n\n═══════════════════════════════════════════════════════════════\n`;
    }
  }

  return {
    userMemory: results[0].status === 'fulfilled' ? results[0].value : '',
    ragContext: results[1].status === 'fulfilled' ? results[1].value : '',
    knowledgeContext: combinedKbContext,
    kbSources: combinedKbSources,
    usedVectorKB
  };
}

/**
 * Enhanced Chat API Route - Now powered by MagicRouter and RAGService
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now();
  
  // Rate limiting check
  const rateLimitResponse = rateLimitCheck(req, 'chat');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  
  try {
    const body = await req.json();
    
    // Validate request body
    const validationResult = ChatRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Invalid request data', details: validationResult.error.format() },
        { status: 400 }
      );
    }

    const { 
      messages: rawMessages, 
      model = 'auto',  // Default to auto-routing
      stream, 
      useRAG, 
      projectId,
      userId, // Extract userId 
      capabilities, 
      tools, 
      agentMode,
      context, // NEW: Context Injection
      temperature,
      maxTokens,
      knowledgeBase // Knowledge Base: folder map and access token
    } = validationResult.data;
    
    // COST OPTIMIZATION: Limit conversation history to reduce token costs
    const messages = limitMessageHistory(rawMessages);
    console.log(`[API] Message history limited: ${rawMessages.length} -> ${messages.length} messages`);
    
    // Log KB data for debugging
    console.log('[API] ====== CHAT REQUEST ======');
    console.log('[API] Knowledge Base data:', {
      received: !!knowledgeBase,
      hasFolderMap: !!knowledgeBase?.folderMap,
      folderMapLength: knowledgeBase?.folderMap?.length || 0,
      hasAccessToken: !!knowledgeBase?.accessToken
    });

    // --- HELPER: Extract text from potentially multimodal content ---
    const getTextFromContent = (content: string | any[]): string => {
      if (typeof content === 'string') return content;
      if (Array.isArray(content)) {
        return content
          .filter((p: any) => p.type === 'text')
          .map((p: any) => p.text)
          .join('\n');
      }
      return '';
    };

    const getLastUserMessageText = () => {
       const lastMsg = messages[messages.length - 1];
       return getTextFromContent(lastMsg?.content || '');
    };

    // --- AGENT MODE HANDLER ---
    if (agentMode) {
      const { globalExecutor } = await import('@/services/ai/agentSystem');
      const query = getLastUserMessageText();
      
      let agentName = 'PlannerAgent'; // Default
      if (agentMode === 'researcher') agentName = 'ResearcherAgent';
      if (agentMode === 'coder') agentName = 'CoderAgent';
      if (agentMode === 'planner') agentName = 'PlannerAgent';
      if (agentMode === 'auto') agentName = 'PlannerAgent';

      try {
        console.log(`[API] Delegating to Agent: ${agentName}`);
        const result = await globalExecutor.execute(agentName, query, { 
          projectId: projectId ?? undefined,
          useRAG: useRAG,
        });

        return NextResponse.json({ 
          reply: result,
          processingTime: Date.now() - startTime
        });
      } catch (error: any) {
         console.error("Agent Execution Error:", error);
         return NextResponse.json({ error: `Agent Error: ${error.message}` }, { status: 500 });
      }
    }

    // --- SMART ROUTING & CONTEXT ANALYSIS ---
    const lastUserMessageText = getLastUserMessageText();
    
    // 1. Detect Complexity to choose the right model
    const complexityTier = MagicRouter.detectComplexity(lastUserMessageText);
    
    // 2. Select Model (Override if user specifically requested a model, otherwise auto-route)
    let finalModel = model;
    let isReasoning = false;
    
    if (model === 'auto' || model === 'gpt-4o') { // Treat gpt-4o as 'auto' for backward compatibility defaults
        // COST OPTIMIZATION: Default to 'google' for 30-50% cost savings (Gemini Flash is much cheaper)
        const route = MagicRouter.getRecommendedModel(complexityTier, 'google');
        finalModel = route.modelId;
        isReasoning = route.reasoning || false;
        console.log(`[MagicRouter] Auto-routed to: ${finalModel} (Tier: ${complexityTier})`);
    }

    // --- PHASE 4: Compute active user & provider abstraction ---
    const activeUserId = (userId || context?.userId) as string | undefined;

    // --- PROVIDER ABSTRACTION ---
    const isGoogle = finalModel.includes('gemini') || finalModel.includes('veo') || finalModel.includes('imagen');

    // ==============================================
    // LATEST MODEL MAPPINGS - January 2026
    // Display names -> Actual API models
    // ==============================================
    let apiModel = finalModel;
    
    // GPT-5 series -> actual API model names
    if (finalModel === 'gpt-5.2') apiModel = 'gpt-5.2';
    if (finalModel === 'gpt-5') apiModel = 'gpt-5';
    if (finalModel === 'gpt-5-mini') apiModel = 'gpt-5-mini';
    if (finalModel === 'gpt-5-nano') apiModel = 'gpt-5-nano';
    
    // o-series reasoning models
    if (finalModel === 'o3') apiModel = 'o3';
    if (finalModel === 'o3-pro') apiModel = 'o3-pro';
    if (finalModel === 'o4-mini') apiModel = 'o4-mini';
    
    // Gemini 3 series (newest) - use -preview suffix for API
    if (finalModel === 'gemini-3-flash') apiModel = 'gemini-3-flash-preview';
    if (finalModel === 'gemini-3-pro') apiModel = 'gemini-3-pro-preview';
    
    // Gemini 2.5 series
    if (finalModel === 'gemini-2.5-flash') apiModel = 'gemini-2.5-flash';
    if (finalModel === 'gemini-2.5-flash-lite') apiModel = 'gemini-2.5-flash-lite';
    if (finalModel === 'gemini-2.5-pro') apiModel = 'gemini-2.5-pro';
    
    // Legacy fallbacks for old model names
    if (finalModel === 'gpt-4o') apiModel = 'gpt-5-mini';
    if (finalModel === 'gpt-4o-mini') apiModel = 'gpt-5-nano';
    if (finalModel === 'o1') apiModel = 'o3';
    if (finalModel === 'o1-mini') apiModel = 'o4-mini';
    if (finalModel === 'gemini-1.5-flash') apiModel = 'gemini-2.5-flash';
    if (finalModel === 'gemini-1.5-pro') apiModel = 'gemini-2.5-pro';
    if (finalModel === 'gemini-2.0-flash-exp') apiModel = 'gemini-2.5-flash';
    
    // Auto mode - use fast, cost-effective models
    if (finalModel === 'auto') {
      apiModel = isGoogle ? 'gemini-2.5-flash' : 'gpt-5-nano';
    }

    // --- Helper: Build system prompt from context ---
    const buildSystemPrompt = (params: { knowledgeContext: string; userMemory: string; ragContext: string; }) => {
      const currentDate = new Date().toLocaleDateString('en-US', { 
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
      });
      let sysCtx = `${ENHANCED_SYSTEM_PROMPT}\n\nCurrent date and time: ${currentDate}`;
      if (params.knowledgeContext) {
        sysCtx += `\n\n${params.knowledgeContext}`;
      }
      if (params.userMemory) {
        sysCtx += `\n\n--- USER PERSONALIZATION (MEMORY) ---\nThe following are known preferences or facts about the user:\n${params.userMemory}\n--- END OF MEMORY ---`;
      }
      if (context) {
        sysCtx += `\n\n--- ACTIVE APPLICATION CONTEXT ---\n${JSON.stringify(context, null, 2)}\n--- END OF ACTIVE CONTEXT ---\nEnsure your helpfulness is relevant to this context.`;
      }
      if (params.ragContext) {
        sysCtx += `\n\n--- PROJECT KNOWLEDGE BASE CONTEXT ---\n${params.ragContext}\n--- END OF PROJECT CONTEXT ---\n\nUse the above context by priority. Cite sources.`;
      }
      if (complexityTier === 'reasoning') {
        sysCtx += '\n\n[REASONING TIER: Think deeply. Break the problem down. Verify your assumptions before answering.]';
      } else if (complexityTier === 'simple') {
        sysCtx += '\n\n[Keep the response concise and direct.]';
      }
      return sysCtx;
    };

    // --- Helper: Determine web search need ---
    const determineWebSearch = (kbSources: any[], knowledgeContext: string) => {
      const needsWebSearch = MagicRouter.detectNeedsWebSearch(lastUserMessageText);
      const isKBOnlyQuery = /price|pricing|cost|policy|procedure|pharmacy|amble/i.test(lastUserMessageText);
      return (capabilities?.webBrowse || needsWebSearch) && !isKBOnlyQuery;
    };

    // ==========================================
    // STREAMING RESPONSE HANDLER
    // ==========================================
    if (stream) {
      const encoder = new TextEncoder();
      const customStream = new TransformStream();
      const writer = customStream.writable.getWriter();

      // Helper to send SSE data
      const sendData = async (data: any) => {
        await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Helper to format content for Gemini
      const getGeminiParts = (content: string | any[]): any[] => {
        if (typeof content === 'string') return [{ text: content }];
        if (Array.isArray(content)) {
            return content.map((part: any) => {
            if (part.type === 'text') return { text: part.text };
            if (part.type === 'image_url') {
                const url = part.image_url.url;
                if (url.startsWith('data:')) {
                    const [mimeInfo, data] = url.split(';base64,');
                    const mimeType = mimeInfo.split(':')[1];
                    return { inlineData: { mimeType, data } };
                }
            }
            return null;
            }).filter((p) => p !== null);
        }
        return [{ text: '' }];
      };

      // Helper to format messages for OpenAI (takes systemContext parameter)
      const getOpenAIMessages = (sysCtx: string) => {
         const mappedMessages: { role: 'system' | 'user' | 'assistant'; content: string | any[] }[] = [
            { role: 'system', content: sysCtx }
          ];
          for (const m of messages) {
            if (m.role === 'system') {
                const sysContent = getTextFromContent(m.content);
                if (typeof mappedMessages[0].content === 'string') {
                    mappedMessages[0].content += '\n\n' + sysContent;
                }
            } else {
              mappedMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
            }
          }
          return mappedMessages;
      };

      // Execute streaming in "background" relative to the return statement
      const processStream = async () => {
        try {
            // =====================================================
            // PHASE 1: TRACE-ENABLED PARALLEL CONTEXT FETCHING
            // Sends real-time trace events to the client as each
            // data source is searched and results are found.
            // =====================================================
            const sendTrace = async (event: { id: string; type: string; label: string; status: string; detail?: string; sources?: string[]; durationMs?: number }) => {
              await sendData({ meta: { trace: event } });
            };

            const contextStartTime = Date.now();

            // Check KB availability
            let vectorKBAvailable = false;
            let vectorKBDocCount = 0;
            try {
              const kbManager = KnowledgeBaseManager.getInstance();
              const kbStatus = await kbManager.getSyncStatus();
              vectorKBAvailable = kbStatus.configured && kbStatus.documentsCount > 0;
              vectorKBDocCount = kbStatus.documentsCount;
            } catch (e) {
              console.log('[API Trace] Vector KB check failed:', e);
            }
            const hasLegacyKB = knowledgeBase?.folderMap && knowledgeBase.folderMap.length > 0;

            // Send "running" traces for all active operations
            if (activeUserId) {
              await sendTrace({ id: 'mem', type: 'fetch', label: 'Loading user memory', status: 'running' });
            }
            if (vectorKBAvailable) {
              await sendTrace({ id: 'vkb', type: 'search', label: `Searching Knowledge Base (${vectorKBDocCount} docs)`, status: 'running' });
            }
            if (hasLegacyKB) {
              await sendTrace({ id: 'lkb', type: 'search', label: 'Searching Google Drive', status: 'running' });
            }
            if (useRAG && projectId) {
              await sendTrace({ id: 'rag', type: 'search', label: 'Searching project documents', status: 'running' });
            }

            // Create promises (they start executing immediately)
            const memoryOp = activeUserId 
              ? MemoryService.retrieveRelevantMemories(activeUserId, lastUserMessageText) 
              : Promise.resolve('');
            const ragOp = (useRAG && projectId) 
              ? RAGService.retrieveContext(lastUserMessageText, projectId as string) 
              : Promise.resolve('');
            const vectorKBOp = vectorKBAvailable 
              ? RAGPipeline.getInstance().quickSearch(lastUserMessageText, 5) 
              : Promise.resolve([]);
            const legacyOp = hasLegacyKB
              ? KnowledgeContextService.getContextForQuery(lastUserMessageText, knowledgeBase?.accessToken, knowledgeBase?.folderMap)
              : Promise.resolve({ hasRelevantContent: false, context: '', sources: [] });

            // Wrap each promise with completion trace
            const trackedMemory = memoryOp.then(async r => {
              if (activeUserId) {
                await sendTrace({ id: 'mem', type: 'fetch', label: r ? 'Memory loaded' : 'No stored memory', status: 'done', durationMs: Date.now() - contextStartTime });
              }
              return r;
            }).catch(async e => {
              if (activeUserId) await sendTrace({ id: 'mem', type: 'fetch', label: 'Memory unavailable', status: 'error', durationMs: Date.now() - contextStartTime });
              throw e;
            });

            const trackedRag = ragOp.then(async r => {
              if (useRAG && projectId) {
                await sendTrace({ id: 'rag', type: 'search', label: r ? 'Project docs loaded' : 'No project docs', status: 'done', durationMs: Date.now() - contextStartTime });
              }
              return r;
            }).catch(async e => {
              if (useRAG && projectId) await sendTrace({ id: 'rag', type: 'search', label: 'Project search failed', status: 'error', durationMs: Date.now() - contextStartTime });
              throw e;
            });

            const trackedVectorKB = vectorKBOp.then(async (r: any[]) => {
              if (vectorKBAvailable) {
                const count = r?.length || 0;
                const sourceNames = r?.slice(0, 3).map((d: any) => d.metadata?.title || d.metadata?.source || 'Document').join(', ') || '';
                await sendTrace({ 
                  id: 'vkb', type: 'search', 
                  label: count > 0 ? `Found ${count} KB document${count > 1 ? 's' : ''}` : 'No matching KB documents', 
                  status: 'done', durationMs: Date.now() - contextStartTime,
                  sources: count > 0 ? r.slice(0, 5).map((d: any) => d.metadata?.title || d.metadata?.source || 'Unknown') : undefined
                });
              }
              return r;
            }).catch(async e => {
              if (vectorKBAvailable) await sendTrace({ id: 'vkb', type: 'search', label: 'KB search failed', status: 'error', durationMs: Date.now() - contextStartTime });
              throw e;
            });

            const trackedLegacy = legacyOp.then(async r => {
              if (hasLegacyKB) {
                const hasContent = (r as any)?.hasRelevantContent;
                await sendTrace({ id: 'lkb', type: 'search', label: hasContent ? 'Drive documents found' : 'No Drive matches', status: 'done', durationMs: Date.now() - contextStartTime });
              }
              return r;
            }).catch(async e => {
              if (hasLegacyKB) await sendTrace({ id: 'lkb', type: 'search', label: 'Drive search failed', status: 'error', durationMs: Date.now() - contextStartTime });
              throw e;
            });

            // Wait for all operations
            const results = await Promise.allSettled([trackedMemory, trackedRag, trackedVectorKB, trackedLegacy]);

            // Extract results (same logic as fetchContextParallel)
            const userMemory = results[0].status === 'fulfilled' ? (results[0].value as string) : '';
            const fetchedRagContext = results[1].status === 'fulfilled' ? (results[1].value as string) : '';
            const vectorKBResults = results[2].status === 'fulfilled' ? (results[2].value as any[]) : [];
            const legacyKbResult = results[3].status === 'fulfilled' 
              ? (results[3].value as any) 
              : { hasRelevantContent: false, context: '', sources: [] };

            // Build combined KB context (same logic as fetchContextParallel)
            let knowledgeContext = '';
            let kbSources: any[] = [];
            let usedVectorKB = false;

            if (vectorKBResults.length > 0) {
              usedVectorKB = true;
              const kbManager = KnowledgeBaseManager.getInstance();
              const ragCtx = kbManager.buildRAGContext(vectorKBResults, 3000);
              knowledgeContext = `\n═══════════════════════════════════════════════════════════════\n📚 KNOWLEDGE BASE DOCUMENTS (Use this information FIRST)\n═══════════════════════════════════════════════════════════════\n\n${ragCtx.context}\n\n📌 Sources: ${ragCtx.sources.join(', ')}\n═══════════════════════════════════════════════════════════════\n`;
              kbSources = ragCtx.sources.map((s: string) => ({ title: s, type: 'vector_kb' }));
            } else if (legacyKbResult.hasRelevantContent && legacyKbResult.context) {
              knowledgeContext = legacyKbResult.context;
              kbSources = legacyKbResult.sources || [];
            } else {
              // Fallback: Direct Drive Search
              await sendTrace({ id: 'drive', type: 'search', label: 'Searching Google Drive (fallback)', status: 'running' });
              
              let driveResults: any[] = [];
              try {
                const saResults = await searchDriveWithServiceAccount(lastUserMessageText, 5);
                if (saResults.length > 0) driveResults = saResults;
              } catch (e) { /* ignore */ }

              if (driveResults.length === 0) {
                let driveToken = knowledgeBase?.accessToken || null;
                if (!driveToken && activeUserId) {
                  try { driveToken = await getDriveAccessToken(activeUserId); } catch (e) { /* ignore */ }
                }
                if (driveToken) {
                  try {
                    const oauthResults = await searchDriveWithContent(driveToken, lastUserMessageText, 5);
                    if (oauthResults.length > 0) driveResults = oauthResults;
                  } catch (e) { /* ignore */ }
                }
              }

              if (driveResults.length > 0) {
                knowledgeContext = `\n═══════════════════════════════════════════════════════════════\n📚 KNOWLEDGE BASE DOCUMENTS (Use this information FIRST)\n═══════════════════════════════════════════════════════════════\n\n`;
                for (const dr of driveResults) {
                  knowledgeContext += `\n📄 **${dr.title}**\n`;
                  if (dr.metadata?.department) knowledgeContext += `   🏷️ Department: ${dr.metadata.department}\n`;
                  knowledgeContext += `\n${dr.content}\n\n---\n`;
                }
                knowledgeContext += `\n📌 Sources: ${driveResults.map((r: any) => r.title).join(', ')}\n═══════════════════════════════════════════════════════════════\n`;
                kbSources = driveResults.map((r: any) => ({ title: r.title, type: 'drive_search', fileId: r.documentId }));
                await sendTrace({ id: 'drive', type: 'search', label: `Found ${driveResults.length} Drive document${driveResults.length > 1 ? 's' : ''}`, status: 'done', durationMs: Date.now() - contextStartTime, sources: driveResults.map((r: any) => r.title) });
              } else {
                knowledgeContext = `\n═══════════════════════════════════════════════════════════════\n📚 KNOWLEDGE BASE SEARCH RESULTS\n═══════════════════════════════════════════════════════════════\n\nNo specific documents were found matching this query in the Knowledge Base.\n\n═══════════════════════════════════════════════════════════════\n`;
                await sendTrace({ id: 'drive', type: 'search', label: 'No documents found', status: 'done', durationMs: Date.now() - contextStartTime });
              }
            }

            console.log(`[API] Context fetched in ${Date.now() - contextStartTime}ms (with traces)`);

            // =====================================================
            // PHASE 2: WEB SEARCH & SYSTEM PROMPT
            // =====================================================
            const shouldUseWebSearch = determineWebSearch(kbSources, knowledgeContext);
            const systemContext = buildSystemPrompt({ knowledgeContext, userMemory, ragContext: fetchedRagContext });

            if (shouldUseWebSearch) {
              await sendTrace({ id: 'web', type: 'search', label: 'Web search enabled', status: 'done' });
            }

            // =====================================================
            // PHASE 3: SEND METADATA & START GENERATION
            // =====================================================
            await sendData({
                meta: {
                    model: finalModel,
                    tier: complexityTier,
                    isReasoning,
                    usedWebSearch: shouldUseWebSearch
                }
            });

            // Send generation trace
            await sendTrace({ id: 'gen', type: 'generate', label: isReasoning ? 'Deep reasoning in progress' : `Generating response`, status: 'running' });
            // Also send legacy status for backward compatibility
            await sendData({ meta: { status: isReasoning ? '🧠 Deep reasoning in progress...' : '✨ Generating response...' } });

            // 2. Provider Specific Logic
            if (isGoogle) {
                const genAI = getGoogleClient();
                
                // Gemini 3 recommends temperature 1.0 for best performance
                // Use thinkingConfig for reasoning mode
                const generationConfig: any = {
                    temperature: 1.0, // Gemini 3 optimal default
                    maxOutputTokens: maxTokens ?? 8192,
                };
                
                // Add thinking config for reasoning/thinking mode
                if (isReasoning || finalModel === 'gemini-3-thinking') {
                    generationConfig.thinkingConfig = {
                        thinkingLevel: 'high' // Enable deep reasoning
                    };
                }
                
                const geminiModel = genAI.getGenerativeModel({ 
                    model: apiModel,
                    systemInstruction: systemContext,
                    safetySettings,
                    generationConfig
                });

                // Filter out system messages - they're handled via systemInstruction
                const nonSystemMessages = messages.filter((m: any) => m.role !== 'system');
                
                // Safety check - ensure we have at least one non-system message
                if (nonSystemMessages.length === 0) {
                    console.error('[Chat API] No non-system messages found!');
                    await sendData({ content: '⚠️ Error: No user message found. Please try again.' });
                    await sendData({ done: true });
                    await writer.close();
                    return;
                }
                
                const historyMsgs = nonSystemMessages.slice(0, nonSystemMessages.length - 1);
                const history = historyMsgs
                    .map((m: any) => ({
                        role: m.role === 'assistant' ? 'model' : 'user',
                        parts: getGeminiParts(m.content)
                    }));

                // Get the last user message (not system)
                const lastUserMessage = nonSystemMessages[nonSystemMessages.length - 1];
                
                // Also inject search context into the user message if present
                const systemMsgs = messages.filter((m: any) => m.role === 'system');
                let lastUserContent = lastUserMessage?.content || '';
                
                // Convert multimodal content to text if needed
                if (Array.isArray(lastUserContent)) {
                    lastUserContent = getTextFromContent(lastUserContent);
                }
                
                if (systemMsgs.length > 0 && lastUserContent) {
                    // Append search context to user message for Gemini
                    const searchContext = systemMsgs.map((m: any) => getTextFromContent(m.content)).join('\n\n');
                    lastUserContent = `${searchContext}\n\n---\nUser Question: ${lastUserContent}`;
                    console.log('[Chat API] Injected search context into user message for Gemini');
                }

                console.log(`[Chat API] Streaming Google: ${finalModel} -> API model: ${apiModel}, Content length: ${String(lastUserContent).length}`);
                
                try {
                  // Add timeout wrapper for Gemini - 45 seconds max
                  const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('timeout')), 45000);
                  });
                  
                  let result: any;
                  try {
                    const streamPromise = geminiModel.generateContentStream({
                        contents: [...history, { role: 'user', parts: getGeminiParts(lastUserContent) }],
                        tools: shouldUseWebSearch ? [{ googleSearch: {} } as any] : undefined
                    });
                    
                    result = await Promise.race([streamPromise, timeoutPromise]);
                  } catch (initError: any) {
                    // Catch errors during stream initialization (including 502 errors)
                    console.error('[Chat API] Gemini stream init failed:', initError.message);
                    throw new Error(`Gemini init failed: ${initError.message || '502'}`);
                  }

                  let hasContent = false;
                  let chunkCount = 0;
                  
                  // Stream timeout - if no chunks received in 30 seconds, throw
                  let lastChunkTime = Date.now();
                  
                  for await (const chunk of result.stream) {
                      lastChunkTime = Date.now();
                      chunkCount++;
                      const text = chunk.text();
                      if (text) {
                          // Check if the response looks like HTML (error page)
                          if (!hasContent && (text.includes('<!DOCTYPE') || text.includes('<html'))) {
                              throw new Error('502 Server Error - received HTML error page');
                          }
                          hasContent = true;
                          await sendData({ content: text });
                      }
                  }
                  
                  console.log(`[Chat API] Gemini stream completed: ${chunkCount} chunks, hasContent: ${hasContent}`);
                  
                  // If no content was received, send an error message
                  if (!hasContent) {
                      console.warn('[Chat API] Gemini returned empty response');
                      await sendData({ content: '⚠️ The AI returned an empty response. Please try again.' });
                  }
                  
                  // Get final response with usage metadata
                  const finalResponse = await result.response;
                  const usageMetadata = finalResponse.usageMetadata;
                  
                  // Send usage data at the end for accurate tracking
                  if (usageMetadata) {
                      await sendData({
                          usage: {
                              prompt_tokens: usageMetadata.promptTokenCount || 0,
                              completion_tokens: usageMetadata.candidatesTokenCount || 0,
                              total_tokens: usageMetadata.totalTokenCount || 0
                          },
                        model: apiModel
                    });
                    console.log(`[Chat API] Gemini usage: ${usageMetadata.promptTokenCount} in, ${usageMetadata.candidatesTokenCount} out`);
                  }
                } catch (geminiError: any) {
                  console.error('[Chat API] Gemini streaming error, falling back to GPT:', geminiError);
                  const errorMsg = String(geminiError.message || geminiError || 'Unknown error');
                  
                  // ALWAYS fallback to GPT on ANY Gemini error
                  // This ensures users always get a response even when Gemini is down
                  console.log('[Chat API] Auto-fallback to GPT due to Gemini error:', errorMsg);
                  await sendData({ meta: { status: '⚡ Switching to GPT (Gemini unavailable)...' } });
                  
                  try {
                    const openai = getOpenaiClient();
                    const fallbackMessages = getOpenAIMessages(systemContext) as any[];
                    
                    const fallbackStream = await openai.chat.completions.create({
                      model: 'gpt-4o',
                      messages: fallbackMessages,
                      temperature: 0.7,
                      max_tokens: maxTokens ?? 4096,
                      stream: true,
                      stream_options: { include_usage: true },
                    });

                    for await (const chunk of fallbackStream) {
                      if (chunk.usage) {
                        await sendData({
                          usage: {
                            prompt_tokens: chunk.usage.prompt_tokens || 0,
                            completion_tokens: chunk.usage.completion_tokens || 0,
                            total_tokens: chunk.usage.total_tokens || 0
                          },
                          model: 'gpt-4o (fallback)'
                        });
                      }
                      const content = chunk.choices[0]?.delta?.content || '';
                      if (content) {
                          await sendData({ content });
                        }
                      }
                    } catch (fallbackError: any) {
                      console.error('[Chat API] Fallback to GPT also failed:', fallbackError);
                      await sendData({ content: `⚠️ **Both AI services are currently unavailable.**\n\nPlease try again in a moment.\n\nError: ${fallbackError.message || 'Unknown error'}` });
                    }
                }
            } else {
                // OpenAI - Agentic Loop
                console.log(`[Chat API] Streaming OpenAI: ${finalModel} with Agentic Tools`);
                const openai = getOpenaiClient(); // Instantiate here to ensure secrets are loaded
                const currentMessages = getOpenAIMessages(systemContext) as any[];
                
                const availableTools = [
                  ...TOOLS_DEFINITION,
                  ...(tools || [])
                ];

                let turn = 0;
                const MAX_TURNS = 5;
                let totalPromptTokens = 0;
                let totalCompletionTokens = 0;

                while (turn < MAX_TURNS) {
                    const stream = await openai.chat.completions.create({
                        model: apiModel,
                        messages: currentMessages,
                        tools: availableTools,
                        tool_choice: 'auto',
                        temperature: isReasoning ? 1 : (temperature ?? 0.7),
                        max_completion_tokens: isReasoning ? (maxTokens ?? 4096) : undefined,
                        max_tokens: isReasoning ? undefined : (maxTokens ?? 4096),
                        stream: true,
                        stream_options: { include_usage: true }, // Enable usage in stream
                    });

                    let toolCalls: Record<number, any> = {};
                    let isFunction = false;

                    for await (const chunk of stream) {
                        // Check for usage data in the final chunk
                        if (chunk.usage) {
                            totalPromptTokens += chunk.usage.prompt_tokens || 0;
                            totalCompletionTokens += chunk.usage.completion_tokens || 0;
                        }
                        
                        const delta = chunk.choices[0]?.delta;
                        
                        // Accumulate Tool Calls
                        if (delta?.tool_calls) {
                            isFunction = true;
                            for (const tc of delta.tool_calls) {
                                if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: '', name: '', args: '' };
                                if (tc.id) toolCalls[tc.index].id = tc.id;
                                if (tc.function?.name) toolCalls[tc.index].name += tc.function.name;
                                if (tc.function?.arguments) toolCalls[tc.index].args += tc.function.arguments;
                            }
                        }

                        // Stream Content
                        const content = delta?.content || '';
                        if (content) {
                            await sendData({ content });
                        }
                    }

                    if (!isFunction) break;

                    // TOOL EXECUTION LOGIC
                    await sendData({ meta: { status: 'Executing tools...' } });
                    
                    const toolCallArray = Object.values(toolCalls).map((tc: any) => ({
                        id: tc.id,
                        type: 'function',
                        function: { name: tc.name, arguments: tc.args }
                    }));
                    
                    currentMessages.push({ role: 'assistant', content: null, tool_calls: toolCallArray });

                    for (const tc of toolCallArray) {
                        try {
                            // Check if it's a server tool
                            const isServerTool = TOOLS_DEFINITION.some(t => t.function.name === tc.function.name);
                            
                            if (isServerTool) {
                                console.log(`[Agent] Running Server Tool: ${tc.function.name}`);
                                const args = JSON.parse(tc.function.arguments);
                                const result = await ToolExecutor.execute(tc.function.name, args);
                                
                                currentMessages.push({
                                    role: 'tool',
                                    tool_call_id: tc.id,
                                    content: JSON.stringify(result)
                                });
                                
                                // Optional: Stream tool result as metadata
                                await sendData({ 
                                    meta: { 
                                        tool: { name: tc.function.name, result } 
                                    } 
                                });
                            } else {
                                // Client Tool or Unknown
                                currentMessages.push({
                                    role: 'tool',
                                    tool_call_id: tc.id,
                                    content: "Tool execution pending on client side."
                                });
                            }
                        } catch (e: any) {
                             currentMessages.push({
                                role: 'tool',
                                tool_call_id: tc.id,
                                content: JSON.stringify({ error: e.message })
                            });
                        }
                    }
                    turn++;
                }
                
                // Send usage data at the end for accurate tracking
                if (totalPromptTokens > 0 || totalCompletionTokens > 0) {
                    await sendData({
                        usage: {
                            prompt_tokens: totalPromptTokens,
                            completion_tokens: totalCompletionTokens,
                            total_tokens: totalPromptTokens + totalCompletionTokens
                        },
                        model: apiModel
                    });
                    console.log(`[Chat API] OpenAI usage: ${totalPromptTokens} in, ${totalCompletionTokens} out`);
                }
            }

            // 3. Send KB Sources metadata before done signal
            if (kbSources && kbSources.length > 0) {
              await sendData({ 
                meta: { 
                  kbSources: kbSources.map((s: any) => ({
                    fileName: s.fileName,
                    path: s.path,
                    relevanceScore: s.relevanceScore
                  }))
                }
              });
              console.log('[API] KB sources sent to client:', kbSources.length);
            }
            
            // 4. Send Done Signal
            await writer.write(encoder.encode(`data: [DONE]\n\n`));

            // --- PHASE 4: ASYNC MEMORY EXTRACTION ---
            // We do this AFTER the response is sent to not slow down the chat
            if (activeUserId) {
                // Get the final full response text (we'd need to accumulate it in stream loop, which we didn't do fully here for efficiency)
                // For simplicity, we just fire-and-forget logic if we had the full text.
                // In a production serverless environment, this might be cut off. Ideally use a queue.
                // Since this is a simple demo, we skip automatic extraction to save tokens/time for now,
                // or we could implement a separate trigger.
            }

        } catch (error: any) {
            console.error("Streaming Error:", error);
            // Send a user-friendly error message that will appear in the chat bubble
            const errorMessage = error.message || "Stream failed";
            const isOverloaded = errorMessage.includes('503') || errorMessage.includes('overloaded') || errorMessage.includes('RESOURCE_EXHAUSTED');
            
            if (isOverloaded) {
              await sendData({ content: "⚠️ **The AI service is temporarily overloaded.** Please wait a moment and try again.\n\nTip: You can also try switching to a different model (e.g., GPT-5 instead of Gemini)." });
            } else {
              await sendData({ content: `⚠️ **Error:** ${errorMessage}\n\nPlease try again or switch models.` });
            }
            await sendData({ error: errorMessage });
        } finally {
            await writer.close();
        }
      };
      
      processStream(); // Start processing

      return new NextResponse(customStream.readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        },
      });
    }

    // ==========================================
    // NON-STREAMING RESPONSE HANDLER (Legacy/Fallback)
    // ==========================================
    // Fetch context for non-streaming path (no trace events)
    const { userMemory: nsUserMemory, ragContext: nsRagContext, knowledgeContext: nsKnowledgeContext, kbSources: nsKbSources } = await fetchContextParallel(
      activeUserId, lastUserMessageText, projectId ?? undefined, useRAG ?? false, knowledgeBase
    );
    const nsShouldUseWebSearch = determineWebSearch(nsKbSources, nsKnowledgeContext);
    const nsSystemContext = buildSystemPrompt({ knowledgeContext: nsKnowledgeContext, userMemory: nsUserMemory, ragContext: nsRagContext });

    if (isGoogle) {
      try {
        const genAI = getGoogleClient();
        
        const geminiModel = genAI.getGenerativeModel({ 
            model: apiModel,
            systemInstruction: nsSystemContext,
            safetySettings,
            generationConfig: {
              temperature: isReasoning ? 0.4 : (temperature ?? 0.7),
              maxOutputTokens: maxTokens ?? 8192,
            }
        });

        const getGeminiParts = (content: string | any[]): any[] => {
            if (typeof content === 'string') return [{ text: content }];
            if (Array.isArray(content)) {
                return content.map((part: any) => {
                if (part.type === 'text') return { text: part.text };
                if (part.type === 'image_url') {
                    const url = part.image_url.url;
                    if (url.startsWith('data:')) {
                        const [mimeInfo, data] = url.split(';base64,');
                        const mimeType = mimeInfo.split(':')[1];
                        return { inlineData: { mimeType, data } };
                    }
                }
                return null;
                }).filter((p) => p !== null);
            }
            return [{ text: '' }];
        };

        const nonSystemMsgs = messages.filter((m: any) => m.role !== 'system');
        const historyMsgs = nonSystemMsgs.slice(0, nonSystemMsgs.length - 1);
        const history = historyMsgs
          .map((m: any) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: getGeminiParts(m.content)
          }));

        const lastUserMsg = nonSystemMsgs[nonSystemMsgs.length - 1];
        const systemMsgsNonStream = messages.filter((m: any) => m.role === 'system');
        let lastUserContent = lastUserMsg?.content;
        if (systemMsgsNonStream.length > 0) {
            const searchCtx = systemMsgsNonStream.map((m: any) => 
                typeof m.content === 'string' ? m.content : ''
            ).join('\n\n');
            if (typeof lastUserContent === 'string') {
                lastUserContent = `${searchCtx}\n\n---\nUser Question: ${lastUserContent}`;
            }
        }

        const result = await geminiModel.generateContent({
          contents: [...history, { role: 'user', parts: getGeminiParts(lastUserContent) }],
          tools: nsShouldUseWebSearch ? [{ googleSearch: {} } as any] : undefined
        });

        const response = result.response;
        const text = response.text();
        const usageMetadata = response.usageMetadata;

        return NextResponse.json({ 
          reply: text, 
          usedWebSearch: nsShouldUseWebSearch,
          kbSources: nsKbSources && nsKbSources.length > 0 ? nsKbSources.map((s: any) => ({
            fileName: s.fileName, path: s.path, relevanceScore: s.relevanceScore
          })) : undefined,
          processingTime: Date.now() - startTime,
          usage: usageMetadata ? {
            prompt_tokens: usageMetadata.promptTokenCount,
            completion_tokens: usageMetadata.candidatesTokenCount,
            total_tokens: usageMetadata.totalTokenCount
          } : undefined
        });

      } catch (error: any) {
        console.error("Gemini API Error:", error);
        throw error; 
      }
    }

    // Handle OpenAI (non-streaming)
    {
      const mappedMessages: { role: 'system' | 'user' | 'assistant'; content: string | any[] }[] = [
        { role: 'system', content: nsSystemContext }
      ];
      
      for (const m of messages) {
        if (m.role === 'system') {
          const sysContent = getTextFromContent(m.content);
          if (typeof mappedMessages[0].content === 'string') {
               mappedMessages[0].content += '\n\n' + sysContent;
          }
        } else {
          mappedMessages.push({ role: m.role as 'user' | 'assistant', content: m.content });
        }
      }

      const openai = getOpenaiClient();
      const response = await openai.chat.completions.create({
        model: apiModel,
        messages: mappedMessages as any,
        tools: tools && tools.length > 0 ? tools : undefined,
        temperature: isReasoning ? 1 : (temperature ?? 0.7),
        max_completion_tokens: isReasoning ? (maxTokens ?? 4096) : undefined, 
        max_tokens: isReasoning ? undefined : (maxTokens ?? 4096),
        stream: false, 
      });

      const message = response.choices[0].message;
      
      return NextResponse.json({ 
        reply: message.content,
        tool_calls: message.tool_calls,
        kbSources: nsKbSources && nsKbSources.length > 0 ? nsKbSources.map((s: any) => ({
          fileName: s.fileName, path: s.path, relevanceScore: s.relevanceScore
        })) : undefined,
        usage: response.usage,
        processingTime: Date.now() - startTime
      });
    }

  } catch (error: any) {
    console.error("Chat API Error:", error);
    return NextResponse.json({ 
      error: error.message || "Internal Server Error",
      tip: "Please try again. If the issue persists, try a different model or simplify your request."
    }, { status: 500 });
  }
}