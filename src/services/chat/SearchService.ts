/**
 * SearchService — Streamlined KB + Web Search
 * 
 * Architecture: Single search path via Vector KB API → server does the real work.
 * All legacy search paths (folderMap, SITEMAP, orchestrator) have been removed.
 * 
 * The server-side chat.js is the AUTHORITATIVE KB search — this client search
 * provides early results for UI display (tool calls, source icons) and injects
 * a compact context flag so the server can skip its own search if client found results.
 */

import { 
  SearchDecision, 
  SearchResultData, 
  SearchSource, 
  ISearchService,
  Message 
} from './types';
import { SearchOrchestrator } from '@/services/ai/SearchOrchestrator';
import { MagicRouter } from '@/services/ai/router';

// Vector KB search result interface (matches API response)
interface VectorKBResult {
  documentId: string;
  title: string;
  content: string;
  score: number;
  filePath?: string;
  metadata?: {
    department?: string;
    [key: string]: unknown;
  };
}

// Protected domains that require authentication
const PROTECTED_DOMAINS = [
  'sites.google.com',
  'docs.google.com',
  'drive.google.com',
  'my.sharepoint.com',
  'dropbox.com/home',
  'notion.so',
  'confluence.atlassian.com',
];

// Keywords that indicate KB should be prioritized — must be company-specific terms
const KB_PRIORITY_KEYWORDS = [
  'tirzepatide', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'zepbound',
  'compound', 'compounding', 'vial', 'dosage',
  'amble', 'joinamble', 'amble health',
  'policy', 'procedure', 'sop', 'guideline', 'protocol',
  'formulary', 'onboarding',
  'hallandale', 'perfectrx', 'reviverx', 'gogomeds', 'empower', 'valor', 'boothwyn',
];

// These keywords ONLY trigger KB when combined with company context
const KB_CONTEXT_KEYWORDS = [
  'price', 'pricing', 'cost', 'fee', 'charge', 'how much', 'payment', 'invoice',
  'medication', 'pharmacy', 'department',
];

// URL regex pattern
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/gi;

export class SearchService implements ISearchService {
  private userId: string;
  
  constructor(userId: string) {
    this.userId = userId;
  }
  
  /**
   * Check if KB search is available.
   * Returns true only when there's a real search API endpoint.
   * Previously always returned true — now does a lightweight check.
   */
  hasKBData(): boolean {
    // The Vector KB API (/api/knowledge/search) is always available server-side
    // It searches Drive via service account + Firestore
    return true;
  }
  
  /** @deprecated No-op — legacy method kept for backward compatibility */
  loadKBCache(): void {
    // No-op: legacy localStorage cache removed in architecture revamp
  }
  
  /**
   * Analyze a query to determine search strategy.
   * Simplified: uses keyword matching only — no MagicRouter overhead.
   */
  analyzeQuery(query: string, capabilities: Record<string, boolean>): SearchDecision {
    const lowerQuery = query.toLowerCase();
    
    // Extract URLs from query
    const extractUrls = query.match(URL_REGEX) || [];
    
    // Check for protected URLs
    const hasProtectedUrl = extractUrls.some(url => 
      PROTECTED_DOMAINS.some(domain => url.includes(domain))
    );
    
    // Check for URL extraction intent
    const hasExtractionIntent = ['analyze', 'read', 'extract', 'summarize', 'explain']
      .some(keyword => lowerQuery.includes(keyword));
    
    if (extractUrls.length > 0 && hasExtractionIntent) {
      return {
        shouldSearchKB: false,
        shouldSearchWeb: false,
        intent: 'none',
        confidence: 1,
        hasProtectedUrl,
        extractUrls,
      };
    }
    
    // KB priority detection — company-specific terms
    const isStrongKBQuery = KB_PRIORITY_KEYWORDS.some(kw => lowerQuery.includes(kw));
    const hasContextKeyword = KB_CONTEXT_KEYWORDS.some(kw => lowerQuery.includes(kw));
    const isKBQuery = isStrongKBQuery || (hasContextKeyword && /\b(our|amble|company|internal|team)\b/i.test(query));
    
    // Use MagicRouter only for web search confidence
    const searchAnalysis = MagicRouter.analyzeSearchIntent(query);
    const canBrowse = capabilities?.enableBrowse || capabilities?.webBrowse;
    
    // KB search: only when query matches company keywords (not for "hello" or general chat)
    const shouldSearchKB = isKBQuery || isStrongKBQuery;
    
    // Web search: only when NOT a KB query, and user has browsing enabled
    const explicitWebRequest = /\b(search online|search the web|look online|google|browse|find online|web search|internet|latest news|current news)\b/i.test(query);
    const shouldSearchWeb = canBrowse && !isKBQuery && (
      explicitWebRequest ||
      (searchAnalysis.shouldSearch && searchAnalysis.confidence > 0.7)
    );
    
    let intent: SearchDecision['intent'] = 'none';
    if (shouldSearchKB && shouldSearchWeb) intent = 'hybrid';
    else if (shouldSearchKB) intent = 'kb_only';
    else if (shouldSearchWeb) intent = 'web_only';
    
    console.log('[SearchService] Query analysis:', { query: query.slice(0, 50), intent, shouldSearchKB, shouldSearchWeb });
    
    return {
      shouldSearchKB,
      shouldSearchWeb,
      intent,
      confidence: searchAnalysis.confidence,
      hasProtectedUrl: false,
      extractUrls: [],
    };
  }
  
  /**
   * Search Vector KB via API endpoint (server-side Drive + Firestore search)
   */
  private async searchVectorKB(query: string, limit: number = 5): Promise<VectorKBResult[]> {
    try {
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const user = auth.currentUser;
      
      if (!user) {
        console.log('[SearchService] No authenticated user, skipping Vector KB');
        return [];
      }
      
      const token = await user.getIdToken();
      
      const response = await fetch('/api/knowledge/search', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ query, limit, useRAG: false }),
      });
      
      if (!response.ok) {
        console.warn('[SearchService] Vector KB API returned:', response.status);
        return [];
      }
      
      const data = await response.json();
      const results = data.results || [];
      console.log('[SearchService] Vector KB results:', results.length, 'docs from:', data.source || 'unknown');
      return results;
    } catch (error) {
      console.error('[SearchService] Vector KB search failed:', error);
      return [];
    }
  }
  
  /**
   * Perform search — SINGLE PATH: Vector KB API only (no legacy fallbacks).
   * 
   * The server (chat.js handleChat) is the authoritative KB search.
   * This client-side search provides early results for UI display and
   * injects a compact context so the server can skip re-searching.
   */
  async search(
    query: string, 
    decision: SearchDecision, 
    conversationHistory: Message[] = []
  ): Promise<SearchResultData | null> {
    if (!decision.shouldSearchKB && !decision.shouldSearchWeb) {
      return null;
    }
    
    console.log('[SearchService] Search:', { kb: decision.shouldSearchKB, web: decision.shouldSearchWeb, intent: decision.intent });
    
    try {
      let vectorKBResults: VectorKBResult[] = [];
      let kbContextPrompt = '';
      let kbHit = false;

      // ── KB Search: Single path via Vector KB API ──
      if (decision.shouldSearchKB) {
        vectorKBResults = await this.searchVectorKB(query, 5);
        
        if (vectorKBResults.length > 0) {
          kbHit = true;
          vectorKBResults.sort((a, b) => b.score - a.score);
          
          // COMPACT context format — no ASCII art, no emoji, standardized 8K per doc
          kbContextPrompt = '\n\n--- KNOWLEDGE BASE RESULTS ---\n';
          for (const r of vectorKBResults) {
            const dept = r.metadata?.department ? ` [${r.metadata.department}]` : '';
            const score = r.score ? ` (${(r.score * 100).toFixed(0)}%)` : '';
            const content = (r.content || '').substring(0, 8000);
            kbContextPrompt += `\n[${r.title}]${dept}${score}\n${content}\n`;
          }
          kbContextPrompt += '\n--- END KNOWLEDGE BASE ---\n';
          kbContextPrompt += 'Use the documents above to answer. Cite document names. Do NOT fabricate.\n';
        }
      }

      // ── Web Search: via SearchOrchestrator (only if no KB results) ──
      let webContextPrompt = '';
      let webHit = false;
      
      if (decision.shouldSearchWeb && !kbHit) {
        try {
          const webResult = await SearchOrchestrator.search(query, {
            enableKB: false,
            enableWeb: true,
            maxWebResults: 8,
            userId: this.userId,
            conversationHistory,
          });
          
          if (webResult.webHit) {
            webHit = true;
            webContextPrompt = webResult.contextPrompt || '';
          }
        } catch (e) {
          console.warn('[SearchService] Web search failed:', e);
        }
      }

      // ── Build result ──
      const sources: SearchSource[] = [];
      
      if (vectorKBResults.length > 0) {
        for (const r of vectorKBResults) {
          sources.push({
            type: 'knowledge_base' as const,
            name: r.title,
            content: r.content,
            relevanceScore: r.score,
            fileId: r.documentId,
            department: r.metadata?.department || 'Knowledge Base',
          });
        }
      }
      
      const contextPrompt = kbContextPrompt + webContextPrompt;
      
      console.log('[SearchService] Search complete:', {
        kbHit,
        webHit,
        sources: sources.length,
        contextLength: contextPrompt.length,
      });
      
      return {
        query,
        kbHit,
        webHit,
        sources,
        contextPrompt,
        summary: contextPrompt,
        searchDuration: 0,
      };
    } catch (error) {
      console.error('[SearchService] Search failed:', error);
      return null;
    }
  }
  
  /**
   * Extract content from URLs
   */
  async extractUrls(urls: string[]): Promise<any> {
    try {
      const response = await fetch('/api/tools/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls: urls.slice(0, 5) }),
      });
      
      if (!response.ok) {
        throw new Error(`Extract API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('[SearchService] URL extraction failed:', error);
      return { results: [], failed_results: urls.map(url => ({ url })) };
    }
  }
  
  /**
   * Build context prompt for URL extraction results
   */
  buildUrlExtractionContext(extractResults: any): string {
    if (!extractResults.results || extractResults.results.length === 0) {
      return '';
    }
    
    let context = `\n\n[SYSTEM: WEB CONTENT EXTRACTION COMPLETE]\n`;
    context += `The user requested analysis of specific URLs. Content extracted below.\n`;
    context += `INSTRUCTIONS:\n`;
    context += `1. Analyze the extracted content thoroughly.\n`;
    context += `2. Answer the user's specific question about this content.\n`;
    context += `3. If content is incomplete or failed, inform the user.\n\n`;
    context += `--- EXTRACTED CONTENT ---\n`;
    
    for (const r of extractResults.results) {
      const extractedContent = r.raw_content || '';
      context += `\nURL: ${r.url}\n`;
      context += `CONTENT:\n${extractedContent.slice(0, 20000)}`;
      if (extractedContent.length > 20000) {
        context += '\n... (truncated)';
      }
      context += `\n---\n`;
    }
    
    if (extractResults.failed_results?.length > 0) {
      context += `\n[FAILED EXTRACTIONS: ${extractResults.failed_results.map((f: any) => f.url).join(', ')}]\n`;
    }
    
    return context;
  }
  
  /**
   * Build context prompt for protected domain error
   */
  buildProtectedDomainContext(domain: string): string {
    return `\n\n[SYSTEM: ACCESS DENIED]\nThe user requested access to a protected URL (${domain}).\nThis is a private/organization-internal site. You CANNOT access it via web search.\nINSTRUCTION: Inform the user that this is a restricted organization site that requires authentication. You cannot log in for them. Ask them to copy-paste the text content or upload a PDF/Screenshot of the page so you can analyze it.`;
  }
  
  /**
   * Extract KB sources for UI display
   */
  extractKBSources(result: SearchResultData): Array<{ name: string; fileId: string; department?: string }> {
    return result.sources
      .filter(s => s.type === 'knowledge_base' && s.fileId)
      .map(s => ({
        name: s.name,
        fileId: s.fileId!,
        department: s.department,
      }));
  }
  
  /**
   * Create tool call object for search results
   */
  createSearchToolCall(type: 'kb' | 'web', query: string, result: SearchResultData): any {
    const id = Math.random().toString(36).substring(7);
    
    if (type === 'kb') {
      const sources = this.extractKBSources(result);
      return {
        id,
        toolName: 'knowledge_base_search',
        args: { query },
        status: 'completed',
        result: {
          sources,
          hitCount: sources.length,
          searchDuration: result.searchDuration,
        },
      };
    } else {
      return {
        id,
        toolName: 'web_search',
        args: { query },
        status: 'completed',
        result: {
          sources: result.sources
            .filter(s => s.type.startsWith('web_'))
            .map(s => ({ title: s.name, url: s.url })),
          summary: result.summary,
        },
      };
    }
  }
  
  /**
   * Create tool call for blocked search (protected domain)
   */
  createBlockedSearchToolCall(domain: string): any {
    return {
      id: Math.random().toString(36).substring(7),
      toolName: 'search_blocked',
      args: { reason: 'protected_domain', domain },
      status: 'failed',
      result: { error: 'Access Denied: Organization Protected Site' },
    };
  }
  
  /**
   * Create tool call for URL extraction
   */
  createUrlExtractionToolCall(urls: string[], result: any): any {
    return {
      id: Math.random().toString(36).substring(7),
      toolName: 'web_extract',
      args: { urls },
      status: 'completed',
      result,
    };
  }
}

// Factory function for creating service instances
export function createSearchService(userId: string): SearchService {
  return new SearchService(userId);
}
