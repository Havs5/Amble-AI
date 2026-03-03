/**
 * RAG Pipeline
 * 
 * Intelligent routing and response generation:
 * 1. Analyze query intent
 * 2. Search KB first
 * 3. Fall back to web search if needed
 * 4. Combine contexts and generate rich responses
 */

import {
  RAGRequest,
  RAGResponse,
  RAGContext,
  SearchResult,
  RAGPipelineConfig,
  WebSearchResult
} from './types';
import { KnowledgeBaseManager } from './KnowledgeBaseManager';
import OpenAI from 'openai';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_CONFIG: RAGPipelineConfig = {
  maxKBResults: 5,
  maxWebResults: 3,
  minKBConfidence: 0.3,
  enableWebFallback: process.env.KB_WEB_SEARCH_FALLBACK === 'true',
  maxContextTokens: 3000,
  responseFormat: 'markdown',
};

// Query classification prompts
const QUERY_CLASSIFICATION_PROMPT = `Analyze the following query and classify it. Respond with JSON only.

Query: "{query}"

Classify into one of these categories:
- "kb_specific": Questions about company policies, procedures, products, pharmacies, departments (e.g., "What is the return policy?", "How do I use AmbleRx?")
- "general_knowledge": General questions that likely require internet search (e.g., "What are the side effects of aspirin?", "Current pharmacy regulations")
- "conversational": Greetings, thanks, or simple conversational messages
- "hybrid": Questions that may need both company KB and general knowledge

Also identify:
- keywords: Important search terms
- department: If relevant (pharmacy, IT, HR, etc.)
- product: If relevant (AmbleRx, etc.)

Respond ONLY with valid JSON:
{"category": "...", "keywords": [...], "department": null|"...", "product": null|"..."}`;

// Response generation prompt
const RAG_SYSTEM_PROMPT = `You are Amble AI, an intelligent assistant for Amble healthcare company.

Your capabilities:
- Answer questions about company policies, procedures, and products using the provided Knowledge Base context
- Provide accurate, helpful responses with proper formatting
- Use tables, code blocks, and rich formatting when appropriate
- Always cite sources when using KB information

Guidelines:
1. If KB context is provided and relevant, prioritize that information
2. Be concise but thorough
3. Use markdown formatting for better readability
4. When showing data, prefer tables over lists when appropriate
5. If you're unsure or the context doesn't contain the answer, say so clearly
6. Never make up information about company policies or procedures

Response Format:
- Use headers (##) for sections
- Use bullet points for lists
- Use tables for comparative data
- Use \`code\` for technical terms or paths
- Include source citations when using KB data`;

// ═══════════════════════════════════════════════════════════════════════════════
// RAG PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

export class RAGPipeline {
  private static instance: RAGPipeline;
  private openai: OpenAI;
  private kbManager: KnowledgeBaseManager;
  private config: RAGPipelineConfig;
  
  private constructor(config: Partial<RAGPipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.kbManager = KnowledgeBaseManager.getInstance();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(config?: Partial<RAGPipelineConfig>): RAGPipeline {
    if (!this.instance) {
      this.instance = new RAGPipeline(config);
    }
    return this.instance;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // MAIN PIPELINE
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Process a query through the RAG pipeline
   */
  async process(request: RAGRequest): Promise<RAGResponse> {
    const startTime = Date.now();
    console.log(`[RAGPipeline] Processing: "${request.query.substring(0, 100)}..."`);
    
    try {
      // Step 1: Classify the query
      const classification = await this.classifyQuery(request.query);
      console.log(`[RAGPipeline] Classification:`, classification);
      
      // Step 2: Search based on classification
      let kbResults: SearchResult[] = [];
      let webResults: WebSearchResult[] = [];
      
      if (classification.category === 'conversational') {
        // Pure conversational - no search needed
        return this.generateResponse(request, [], [], classification, startTime);
      }
      
      // Step 3: Search Knowledge Base
      if (classification.category === 'kb_specific' || classification.category === 'hybrid') {
        kbResults = await this.kbManager.search(
          request.query,
          {
            limit: this.config.maxKBResults,
            department: classification.department || request.filters?.department,
            product: classification.product || request.filters?.product,
            minScore: this.config.minKBConfidence,
          }
        );
        
        console.log(`[RAGPipeline] KB results: ${kbResults.length}`);
      }
      
      // Step 4: Web search fallback (if enabled and needed)
      if (this.config.enableWebFallback) {
        const needsWebSearch = 
          classification.category === 'general_knowledge' ||
          (classification.category === 'hybrid') ||
          (classification.category === 'kb_specific' && kbResults.length === 0);
        
        if (needsWebSearch) {
          webResults = await this.searchWeb(request.query, classification.keywords);
          console.log(`[RAGPipeline] Web results: ${webResults.length}`);
        }
      }
      
      // Step 5: Generate response
      return this.generateResponse(request, kbResults, webResults, classification, startTime);
      
    } catch (error: any) {
      console.error('[RAGPipeline] Error:', error.message);
      
      return {
        answer: "I apologize, but I encountered an error processing your request. Please try again.",
        sources: [],
        confidence: 0,
        processingTimeMs: Date.now() - startTime,
        usedKB: false,
        usedWebSearch: false,
        error: error.message,
      };
    }
  }
  
  /**
   * Classify query intent
   */
  private async classifyQuery(query: string): Promise<{
    category: 'kb_specific' | 'general_knowledge' | 'conversational' | 'hybrid';
    keywords: string[];
    department?: string;
    product?: string;
  }> {
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: QUERY_CLASSIFICATION_PROMPT.replace('{query}', query),
          },
        ],
        temperature: 0,
        max_tokens: 200,
      });
      
      const content = response.choices[0]?.message?.content || '{}';
      
      // Parse JSON response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      
      // Default to hybrid if parsing fails
      return {
        category: 'hybrid',
        keywords: query.split(' ').filter(w => w.length > 3),
      };
      
    } catch (error: any) {
      console.error('[RAGPipeline] Classification error:', error.message);
      
      // Simple heuristic fallback
      const lowerQuery = query.toLowerCase();
      
      if (/^(hi|hello|hey|thanks|thank you)[\s!.]*$/i.test(query)) {
        return { category: 'conversational', keywords: [] };
      }
      
      if (lowerQuery.includes('policy') || 
          lowerQuery.includes('procedure') || 
          lowerQuery.includes('amble') ||
          lowerQuery.includes('pharmacy')) {
        return { category: 'kb_specific', keywords: query.split(' ') };
      }
      
      return { category: 'hybrid', keywords: query.split(' ') };
    }
  }
  
  /**
   * Search the web using a search API
   */
  private async searchWeb(query: string, keywords: string[]): Promise<WebSearchResult[]> {
    try {
      // Check for Serper API key (Google Search API alternative)
      const serperKey = process.env.SERPER_API_KEY;
      
      if (serperKey) {
        const response = await fetch('https://google.serper.dev/search', {
          method: 'POST',
          headers: {
            'X-API-KEY': serperKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            q: query,
            num: this.config.maxWebResults,
          }),
        });
        
        if (response.ok) {
          const data = await response.json();
          const organic = data.organic || [];
          
          return organic.slice(0, this.config.maxWebResults).map((result: any) => ({
            title: result.title,
            url: result.link,
            snippet: result.snippet,
            source: 'serper',
          }));
        }
      }
      
      // Fallback: Use DuckDuckGo instant answer API (limited but free)
      const duckResponse = await fetch(
        `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`
      );
      
      if (duckResponse.ok) {
        const data = await duckResponse.json();
        const results: WebSearchResult[] = [];
        
        if (data.AbstractText) {
          results.push({
            title: data.Heading || 'DuckDuckGo Result',
            url: data.AbstractURL || 'https://duckduckgo.com',
            snippet: data.AbstractText,
            source: 'duckduckgo',
          });
        }
        
        // Add related topics
        const topics = data.RelatedTopics?.slice(0, 2) || [];
        topics.forEach((topic: any) => {
          if (topic.Text) {
            results.push({
              title: topic.Text?.substring(0, 50) || 'Related',
              url: topic.FirstURL || '',
              snippet: topic.Text,
              source: 'duckduckgo',
            });
          }
        });
        
        return results;
      }
      
      return [];
      
    } catch (error: any) {
      console.error('[RAGPipeline] Web search error:', error.message);
      return [];
    }
  }
  
  /**
   * Generate final response
   */
  private async generateResponse(
    request: RAGRequest,
    kbResults: SearchResult[],
    webResults: WebSearchResult[],
    classification: { category: string; keywords: string[] },
    startTime: number
  ): Promise<RAGResponse> {
    // Build context from KB results
    const kbContext = kbResults.length > 0 
      ? this.kbManager.buildRAGContext(kbResults, this.config.maxContextTokens)
      : null;
    
    // Build context from web results
    const webContext = webResults.length > 0
      ? webResults.map(r => `[${r.title}](${r.url})\n${r.snippet}`).join('\n\n')
      : null;
    
    // Combine contexts
    const contextParts: string[] = [];
    
    if (kbContext?.context) {
      contextParts.push('## Knowledge Base Information:\n' + kbContext.context);
    }
    
    if (webContext) {
      contextParts.push('## Web Search Results:\n' + webContext);
    }
    
    const fullContext = contextParts.length > 0
      ? contextParts.join('\n\n---\n\n')
      : null;
    
    // Build messages
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: RAG_SYSTEM_PROMPT },
    ];
    
    // Add conversation history
    if (request.conversationHistory?.length) {
      const recentHistory = request.conversationHistory.slice(-6);
      recentHistory.forEach(msg => {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      });
    }
    
    // Build user message with context
    let userMessage = request.query;
    
    if (fullContext) {
      userMessage = `Context:\n${fullContext}\n\n---\n\nUser Question: ${request.query}`;
    }
    
    messages.push({ role: 'user', content: userMessage });
    
    // Generate response
    const completion = await this.openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 1500,
    });
    
    const answer = completion.choices[0]?.message?.content || 'I could not generate a response.';
    
    // Calculate confidence
    const confidence = this.calculateConfidence(kbResults, webResults, classification.category);
    
    // Build sources list
    const sources: string[] = [];
    
    if (kbContext?.sources) {
      sources.push(...kbContext.sources.map(s => `📚 ${s}`));
    }
    
    if (webResults.length > 0) {
      sources.push(...webResults.map(r => `🌐 ${r.title}`));
    }
    
    return {
      answer,
      sources: [...new Set(sources)],
      confidence,
      processingTimeMs: Date.now() - startTime,
      usedKB: kbResults.length > 0,
      usedWebSearch: webResults.length > 0,
      kbResults: kbResults.length > 0 ? kbResults : undefined,
      webResults: webResults.length > 0 ? webResults : undefined,
    };
  }
  
  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    kbResults: SearchResult[],
    webResults: WebSearchResult[],
    category: string
  ): number {
    if (category === 'conversational') {
      return 1.0;
    }
    
    let confidence = 0.3; // Base confidence
    
    // KB results boost confidence significantly
    if (kbResults.length > 0) {
      const avgKBScore = kbResults.reduce((sum, r) => sum + r.score, 0) / kbResults.length;
      confidence += avgKBScore * 0.5;
    }
    
    // Web results add some confidence
    if (webResults.length > 0) {
      confidence += 0.15;
    }
    
    return Math.min(confidence, 1.0);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // QUICK METHODS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Quick search - just search KB without full RAG
   */
  async quickSearch(query: string, limit: number = 5): Promise<SearchResult[]> {
    return this.kbManager.search(query, { limit });
  }
  
  /**
   * Check if query can be answered from KB
   */
  async canAnswerFromKB(query: string): Promise<boolean> {
    const result = await this.kbManager.canAnswerFromKB(query);
    return result.likely;
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<RAGPipelineConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

export default RAGPipeline;
