/**
 * SearchOrchestrator - Unified Search System for Amble AI
 * 
 * This orchestrator manages the search priority:
 * 1. FIRST: Knowledge Base (pre-indexed Google Drive content) - INSTANT
 * 2. SECOND: Web Search (if KB doesn't have the answer)
 * 
 * Architecture:
 * - KB files are pre-indexed when Drive connects (stored in IndexedDB)
 * - Search queries the local index (no API calls) - sub-100ms
 * - Web search only when KB doesn't have the answer
 */

import { FolderMapEntry } from './knowledgeContext';
import { getKBIndexer, SearchHit } from './KnowledgeBaseIndexer';
import { SmartSearchQueryBuilder, SmartSearchQuery } from '@/services/chat/SmartSearchQueryBuilder';
import { Message } from '@/types/chat';

// Types
export interface SearchSource {
  type: 'knowledge_base' | 'web_google' | 'web_tavily' | 'database';
  name: string;
  content: string;
  url?: string;
  relevanceScore: number;
  fileId?: string;
  department?: string;
}

export interface SearchResult {
  query: string;
  sources: SearchSource[];
  kbHit: boolean;
  webHit: boolean;
  contextPrompt: string;
  searchDuration: number;
  summary?: string;
}

export interface SearchOptions {
  accessToken?: string;
  folderMap?: FolderMapEntry[];
  enableKB?: boolean;
  enableWeb?: boolean;
  maxKBResults?: number;
  maxWebResults?: number;
  userId?: string;
  /** Conversation history for context-aware search */
  conversationHistory?: Message[];
}

// Intent detection
type SearchIntent = 'kb_only' | 'web_only' | 'hybrid' | 'none';

const KB_PRIORITY_KEYWORDS = [
  // Pricing & Billing - ALWAYS check KB first
  'price', 'pricing', 'cost', 'fee', 'charge', 'how much', 'payment', 'invoice', 'billing', 'refund', 'credit',
  // Products - Amble medications
  'tirzepatide', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'glp-1', 'glp1',
  'medication', 'compound', 'vial', 'dosage', 'injection', 'prescription', 'dose',
  // Company policies
  'policy', 'procedure', 'sop', 'guideline', 'protocol', 'process', 'steps', 'how to', 'what is',
  // Departments
  'dispute', 'chargeback', 'complaint', 'escalation', 'customer', 'support', 'compliance', 'hipaa',
  'shipping', 'delivery', 'tracking', 'pharmacy', 'department',
  // Company-specific
  'amble', 'joinamble', 'weight loss', 'weight management',
];

const WEB_PRIORITY_KEYWORDS = [
  // Real-time info
  'news', 'latest', 'today', 'current', 'live', 'breaking', '2025', '2026', '2027',
  // External entities
  'competitor', 'market', 'industry', 'fda', 'regulation', 'government',
  // Research
  'study', 'research', 'clinical trial', 'published', 'journal', 'paper',
  // General knowledge (not in KB)
  'weather', 'stock', 'sports', 'score', 'election', 'president', 'celebrity',
  'movie', 'music', 'game', 'restaurant', 'recipe', 'travel', 'flight', 'hotel',
  'crypto', 'bitcoin', 'ethereum', 'ai', 'technology', 'startup', 'company',
  // Comparison/shopping
  'compare', 'versus', 'vs', 'best', 'top', 'review', 'reviews', 'rating',
  // How-to (general, not Amble-specific)
  'tutorial', 'guide', 'learn', 'example', 'documentation',
];

export class SearchOrchestrator {
  
  /**
   * Determine search intent based on query content
   */
  static detectIntent(query: string): SearchIntent {
    const lowerQuery = query.toLowerCase();
    
    // Count KB vs Web keyword matches
    let kbScore = 0;
    let webScore = 0;
    
    for (const kw of KB_PRIORITY_KEYWORDS) {
      if (lowerQuery.includes(kw)) kbScore += 2;
    }
    
    for (const kw of WEB_PRIORITY_KEYWORDS) {
      if (lowerQuery.includes(kw)) webScore += 2;
    }
    
    // Question patterns that typically need KB
    if (/^(what|how|where|who|when).*(price|cost|fee|charge|policy|procedure)/i.test(query)) {
      kbScore += 5;
    }
    
    // Explicit search requests - ALWAYS search web
    if (/search\s+(online|web|google|internet)|look\s+(up|online)|browse\s+(the\s+)?(web|internet)/i.test(query)) {
      webScore += 15; // Strong signal for web search
    }
    
    // Real-time information patterns - need web
    if (/what('s| is)\s+(the\s+)?(latest|current|newest|today)/i.test(query)) {
      webScore += 10;
    }
    
    // General knowledge questions (not company-specific)
    if (/^(who|what|where|when|why|how)\s+/i.test(query) && kbScore === 0) {
      webScore += 5; // Generic question without KB keywords
    }
    
    // Determine intent
    if (kbScore >= 5 && webScore === 0) return 'kb_only';
    if (webScore >= 5 && kbScore === 0) return 'web_only';
    if (kbScore > 0 || webScore > 0) return 'hybrid'; // Any match = hybrid
    
    // Default: hybrid for general questions (both sources)
    return 'hybrid';
  }
  
  /**
   * Main search method - orchestrates all sources
   * Uses pre-indexed KB for INSTANT search (< 50ms)
   * Now with SMART QUERY BUILDING for context-aware web search
   */
  static async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const startTime = Date.now();
    const {
      accessToken,
      folderMap,
      enableKB = true,
      enableWeb = true,
      maxKBResults = 5,
      maxWebResults = 8,
      userId,
      conversationHistory = [],
    } = options;
    
    const sources: SearchSource[] = [];
    let kbHit = false;
    let webHit = false;
    let summary: string | undefined;
    
    // Build smart search query using conversation context
    const smartQuery = SmartSearchQueryBuilder.buildQuery({
      currentMessage: query,
      conversationHistory,
      maxHistoryMessages: 5,
    });
    
    const intent = this.detectIntent(query);
    console.log('[SearchOrchestrator] Query:', query);
    console.log('[SearchOrchestrator] Smart Query:', smartQuery.optimizedQuery);
    console.log('[SearchOrchestrator] Detected Intent:', intent, '| Smart Intent:', smartQuery.intent);
    console.log('[SearchOrchestrator] Context:', smartQuery.context);
    console.log('[SearchOrchestrator] FolderMap available:', !!folderMap, folderMap?.length || 0, 'entries');
    
    // ============================================
    // STEP 1: KNOWLEDGE BASE SEARCH (INSTANT - PRE-CACHED CONTENT)
    // Priority: FolderMap with pre-cached content > KB Indexer
    // ============================================
    if (enableKB && (intent === 'kb_only' || intent === 'hybrid')) {
      console.log('[SearchOrchestrator] 📚 Searching Knowledge Base...');
      const kbStartTime = Date.now();
      
      // Try FolderMap FIRST (has pre-cached content from indexing)
      if (folderMap && folderMap.length > 0) {
        console.log('[SearchOrchestrator] Using FolderMap with pre-cached content');
        const kbResult = await this.performKBSearch(query, folderMap, undefined, maxKBResults);
        
        if (kbResult.hasRelevantContent && kbResult.sources.length > 0) {
          kbHit = true;
          
          for (const src of kbResult.sources) {
            sources.push({
              type: 'knowledge_base',
              name: src.fileName,
              content: kbResult.context,
              fileId: src.fileId,
              department: src.department,
              relevanceScore: src.relevanceScore,
            });
          }
          
          console.log(`[SearchOrchestrator] ✅ KB Hit via FolderMap in ${Date.now() - kbStartTime}ms:`, kbResult.sources.length, 'files');
        } else {
          console.log('[SearchOrchestrator] ⚠️ FolderMap search found no relevant content');
        }
      } 
      // Fallback to KB Indexer if FolderMap not available
      else if (userId) {
        try {
          console.log('[SearchOrchestrator] Using KB Indexer (IndexedDB)');
          const indexer = getKBIndexer(userId);
          const hits: SearchHit[] = await indexer.search(query, maxKBResults);
          
          console.log(`[SearchOrchestrator] KB Indexer search completed in ${Date.now() - kbStartTime}ms`);
          
          if (hits.length > 0) {
            kbHit = true;
            
            const context = indexer.buildContextPrompt(hits, query);
            
            for (const hit of hits) {
              sources.push({
                type: 'knowledge_base',
                name: hit.fileName,
                content: hit.snippet,
                fileId: hit.fileId,
                department: hit.department,
                relevanceScore: hit.score,
              });
            }
            
            if (sources.length > 0) {
              sources[0].content = context;
            }
            
            console.log('[SearchOrchestrator] ✅ KB Hit via Indexer:', hits.length, 'relevant files');
          }
        } catch (error) {
          console.error('[SearchOrchestrator] KB Indexer search error:', error);
        }
      } else {
        console.log('[SearchOrchestrator] ⚠️ No FolderMap or userId - cannot search KB');
      }
    }
    
    // ============================================
    // STEP 2: WEB SEARCH (if needed)
    // Key improvement: Use SMART QUERY for better web search results
    // - Uses context-aware query building
    // - Adds product/competitor context
    // - Skips useless searches
    // ============================================
    const shouldSearchWeb = enableWeb && (
      intent === 'web_only' || 
      intent === 'hybrid' || // Always search web for hybrid - don't skip if KB hit
      (intent === 'kb_only' && !kbHit) // Only fallback to web if KB-only failed
    );
    
    // Check if smart query builder recommends performing the search
    const shouldPerformSearch = SmartSearchQueryBuilder.shouldPerformWebSearch(smartQuery, kbHit);
    
    if (shouldSearchWeb && shouldPerformSearch) {
      console.log('[SearchOrchestrator] 🌐 Searching Web with optimized query...');
      console.log('[SearchOrchestrator] Original query:', query.slice(0, 50));
      console.log('[SearchOrchestrator] Optimized query:', smartQuery.optimizedQuery.slice(0, 80));
      
      try {
        // Use the OPTIMIZED query for web search, not the original
        const searchQuery = smartQuery.optimizedQuery || query;
        const webResults = await this.performWebSearch(searchQuery, maxWebResults);
        
        if (webResults.results.length > 0) {
          webHit = true;
          summary = webResults.answer;
          
          for (const result of webResults.results) {
            sources.push({
              type: result.source === 'google' ? 'web_google' : 'web_tavily',
              name: result.title,
              content: result.content || result.snippet,
              url: result.url,
              relevanceScore: 0.5, // Web results get lower base score
            });
          }
          
          console.log('[SearchOrchestrator] ✅ Web Hit:', webResults.results.length, 'results');
        }
      } catch (error) {
        console.error('[SearchOrchestrator] Web search error:', error);
      }
    }
    
    // ============================================
    // STEP 3: BUILD CONTEXT PROMPT
    // ============================================
    const contextPrompt = this.buildContextPrompt(query, sources, kbHit, webHit, summary);
    
    const result: SearchResult = {
      query,
      sources,
      kbHit,
      webHit,
      contextPrompt,
      searchDuration: Date.now() - startTime,
      summary,
    };
    
    console.log('[SearchOrchestrator] Search complete in', result.searchDuration, 'ms');
    console.log('[SearchOrchestrator] KB Hit:', kbHit, '| Web Hit:', webHit, '| Total Sources:', sources.length);
    
    return result;
  }
  
  /**
   * Perform KB search using client-side scoring and optional content extraction
   */
  private static async performKBSearch(
    query: string, 
    folderMap: FolderMapEntry[], 
    accessToken?: string,
    maxResults: number = 5
  ): Promise<{
    hasRelevantContent: boolean;
    context: string;
    sources: Array<{ fileName: string; fileId: string; path: string; department?: string; relevanceScore: number }>;
  }> {
    // Department keywords for analysis
    const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
      billing: ['billing', 'invoice', 'payment', 'charge', 'refund', 'credit', 'fee', 'price', 'cost'],
      disputes: ['dispute', 'chargeback', 'complaint', 'escalation', 'resolution'],
      customerCare: ['customer', 'support', 'help', 'service', 'care', 'inquiry'],
      sales: ['sales', 'order', 'subscription', 'promotion', 'discount', 'quote'],
      shipping: ['shipping', 'delivery', 'tracking', 'shipment', 'package'],
      compliance: ['compliance', 'regulation', 'hipaa', 'legal', 'policy', 'audit'],
      products: ['tirzepatide', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'medication', 'compound'],
    };
    
    const lowerQuery = query.toLowerCase();
    
    // Detect departments in query
    const queryDepts: string[] = [];
    for (const [dept, keywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
      if (dept !== 'products' && keywords.some(kw => lowerQuery.includes(kw))) {
        queryDepts.push(dept);
      }
    }
    
    // Detect products in query
    const queryProducts: string[] = [];
    for (const product of DEPARTMENT_KEYWORDS.products) {
      if (lowerQuery.includes(product)) {
        queryProducts.push(product);
      }
    }
    
    console.log('[KB Search] Query:', query);
    console.log('[KB Search] Departments:', queryDepts);
    console.log('[KB Search] Products:', queryProducts);
    console.log('[KB Search] Files in map:', folderMap.length);
    
    // Score and filter files
    const fileEntries = folderMap.filter(entry => entry.type === 'file');
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);
    
    const scoredFiles = fileEntries
      .map(entry => {
        let score = 0;
        const lowerName = entry.name.toLowerCase();
        const lowerPath = entry.path.toLowerCase();
        
        // Exact phrase match in name (highest priority)
        if (lowerName.includes(lowerQuery)) score += 100;
        
        // Word matches in name
        for (const word of queryWords) {
          if (lowerName.includes(word)) score += 30;
          if (lowerPath.includes(word)) score += 15;
        }
        
        // Department match
        if (entry.department && queryDepts.includes(entry.department)) {
          score += 50;
        }
        
        // Product match
        for (const product of queryProducts) {
          if (lowerName.includes(product) || lowerPath.includes(product)) {
            score += 60;
          }
        }
        
        // Keyword matches
        for (const keyword of entry.keywords || []) {
          if (queryWords.some(qw => keyword.includes(qw) || qw.includes(keyword))) {
            score += 10;
          }
        }
        
        return { entry, score };
      })
      .filter(sf => sf.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);
    
    console.log('[KB Search] Matched files:', scoredFiles.length);
    if (scoredFiles.length > 0) {
      console.log('[KB Search] Top matches:', scoredFiles.slice(0, 3).map(sf => ({ name: sf.entry.name, score: sf.score })));
    }
    
    if (scoredFiles.length === 0) {
      return {
        hasRelevantContent: false,
        context: '',
        sources: [],
      };
    }
    
    // Build context with file references (content extraction happens server-side via API if needed)
    let context = `
═══════════════════════════════════════════════════════════════
📚 KNOWLEDGE BASE REFERENCE
═══════════════════════════════════════════════════════════════

The following documents from the company's Google Drive have been identified as relevant.
USE THIS INFORMATION AS YOUR PRIMARY SOURCE.

`;
    
    if (queryDepts.length > 0) {
      context += `🏢 Relevant Departments: ${queryDepts.join(', ')}\n`;
    }
    if (queryProducts.length > 0) {
      context += `💊 Relevant Products: ${queryProducts.join(', ')}\n`;
    }
    
    context += `\n--- RELEVANT DOCUMENTS ---\n`;
    
    // USE PRE-CACHED CONTENT from folder map (extracted during indexing)
    // No need for real-time API calls - content was pre-extracted!
    const filesWithContent: { entry: FolderMapEntry; content?: string }[] = [];
    
    for (const sf of scoredFiles.slice(0, 5)) {
      // Use pre-cached content from the folder map
      const content = sf.entry.content;
      console.log(`[KB Search] File: ${sf.entry.name}, has content: ${!!content}, length: ${content?.length || 0}`);
      filesWithContent.push({ entry: sf.entry, content: content || undefined });
    }
    
    for (const { entry, content } of filesWithContent) {
      context += `\n📄 **${entry.name}**\n`;
      context += `   📁 Location: ${entry.path}\n`;
      
      if (entry.department) {
        context += `   🏷️ Department: ${entry.department}\n`;
      }
      
      if (content) {
        // Truncate long content
        const truncatedContent = content.length > 4000 
          ? content.substring(0, 4000) + '\n...[content truncated]'
          : content;
        context += `   📝 Content:\n${truncatedContent}\n`;
      } else {
        context += `   📝 (File content not available - user may need to reconnect Google Drive)\n`;
      }
      
      context += `\n---\n`;
    }
    
    context += `
═══════════════════════════════════════════════════════════════
END OF KNOWLEDGE BASE REFERENCE
═══════════════════════════════════════════════════════════════

INSTRUCTIONS:
1. BASE YOUR RESPONSE on the document content above when available.
2. If the document provides specific information, use it EXACTLY.
3. CITE the document name when referencing specific information.
4. If no relevant content was found, indicate this and use general knowledge.
`;
    
    return {
      hasRelevantContent: true,
      context,
      sources: scoredFiles.map(sf => ({
        fileName: sf.entry.name,
        fileId: sf.entry.id,
        path: sf.entry.path,
        department: sf.entry.department,
        relevanceScore: sf.score,
      })),
    };
  }
  
  /**
   * Extract content from a Google Drive file
   */
  private static async extractDriveFileContent(
    fileId: string,
    mimeType?: string,
    accessToken?: string
  ): Promise<string | null> {
    if (!accessToken || !mimeType) return null;
    
    const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
    
    try {
      // For Google Docs, export as plain text
      if (mimeType === 'application/vnd.google-apps.document') {
        const url = `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/plain`;
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (response.ok) {
          return await response.text();
        }
      }
      
      // For Google Sheets, export as CSV
      if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        const url = `${DRIVE_API_BASE}/files/${fileId}/export?mimeType=text/csv`;
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (response.ok) {
          return await response.text();
        }
      }
      
      // For plain text files, download directly
      if (mimeType?.startsWith('text/')) {
        const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
        const response = await fetch(url, {
          headers: { 'Authorization': `Bearer ${accessToken}` },
        });
        
        if (response.ok) {
          return await response.text();
        }
      }
      
      return null;
    } catch (error) {
      console.error('[KB Search] Content extraction error:', error);
      return null;
    }
  }
  
  /**
   * Perform web search using available APIs
   * With timeout to prevent hanging
   */
  private static async performWebSearch(query: string, maxResults: number): Promise<{
    results: Array<{ title: string; url: string; snippet: string; content?: string; source: string }>;
    answer?: string;
  }> {
    const SEARCH_TIMEOUT = 8000; // 8 second timeout for web search
    
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT);
      
      console.log('[SearchOrchestrator] Starting web search with', SEARCH_TIMEOUT, 'ms timeout');
      
      // Call our internal search API
      const response = await fetch('/api/tools/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query, 
          extractContent: false, // DISABLE content extraction for speed
          maxResults: Math.min(maxResults, 5), // Limit results for speed
        }),
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Search API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      return {
        results: (data.results || []).map((r: any) => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          content: r.content || r.snippet, // Use snippet if no content
          source: r.source || 'google',
        })),
        answer: data.answer,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.warn('[SearchOrchestrator] Web search timed out after', SEARCH_TIMEOUT, 'ms');
      } else {
        console.error('[SearchOrchestrator] Web search failed:', error);
      }
      return { results: [] };
    }
  }
  
  /**
   * Build the final context prompt for the AI
   */
  private static buildContextPrompt(
    query: string,
    sources: SearchSource[],
    kbHit: boolean,
    webHit: boolean,
    summary?: string
  ): string {
    if (sources.length === 0) {
      return '';
    }
    
    let prompt = '\n\n';
    
    // ============================================
    // KNOWLEDGE BASE SECTION (HIGHEST PRIORITY)
    // ============================================
    const kbSources = sources.filter(s => s.type === 'knowledge_base');
    
    if (kbSources.length > 0) {
      // KB sources already contain formatted content
      for (const src of kbSources) {
        if (src.content) {
          prompt += src.content;
        }
      }
    }
    
    // ============================================
    // WEB SEARCH SECTION (SUPPLEMENTARY)
    // ============================================
    const webSources = sources.filter(s => s.type.startsWith('web_'));
    
    if (webSources.length > 0) {
      // Only add web section header if no KB hit, otherwise it's supplementary
      if (!kbHit) {
        prompt += `═══════════════════════════════════════════════════════════════
🌐 WEB SEARCH RESULTS
═══════════════════════════════════════════════════════════════

The following information was retrieved from the web. Use with appropriate sourcing.

`;
      } else {
        prompt += `\n--- SUPPLEMENTARY WEB INFORMATION ---
(Lower priority than Knowledge Base - use only if KB doesn't fully answer)

`;
      }
      
      if (summary) {
        prompt += `📋 AI Summary: ${summary}\n\n`;
      }
      
      for (const src of webSources) {
        const content = src.content || '';
        const truncated = content.length > 3000 
          ? content.substring(0, 3000) + '... [truncated]'
          : content;
        
        prompt += `📄 **${src.name}**\n`;
        prompt += `🔗 ${src.url}\n`;
        prompt += `${truncated}\n\n---\n\n`;
      }
    }
    
    // ============================================
    // FINAL INSTRUCTIONS
    // ============================================
    prompt += `\n═══════════════════════════════════════════════════════════════
RESPONSE INSTRUCTIONS
═══════════════════════════════════════════════════════════════

`;
    
    if (kbHit && webHit) {
      prompt += `✅ Both Knowledge Base AND Web sources are available.
1. PRIORITIZE Knowledge Base for company-specific information (pricing, policies, products)
2. Use Web sources for external/market information
3. ALWAYS cite which source you're using
`;
    } else if (kbHit) {
      prompt += `✅ Knowledge Base information is available - use it as your PRIMARY source.
1. Base your response on the KB content above
2. Quote specific information when relevant
3. If KB doesn't fully answer, say so (don't make up information)
`;
    } else if (webHit) {
      prompt += `✅ Web search results are available.
1. Synthesize information from multiple sources
2. Cite sources with URLs when stating facts
3. Note that this is external information, not from Amble's internal KB
`;
    }
    
    return prompt;
  }
  
  /**
   * Quick check if a query should prioritize KB
   */
  static shouldPrioritizeKB(query: string): boolean {
    const intent = this.detectIntent(query);
    return intent === 'kb_only' || intent === 'hybrid';
  }
  
  /**
   * Extract relevant file IDs from a KB search for UI display
   */
  static extractKBSources(result: SearchResult): Array<{ name: string; fileId: string; department?: string }> {
    return result.sources
      .filter(s => s.type === 'knowledge_base' && s.fileId)
      .map(s => ({
        name: s.name,
        fileId: s.fileId!,
        department: s.department,
      }));
  }
}
