/**
 * SmartSearchQueryBuilder
 * 
 * Intelligently constructs search queries based on:
 * 1. Current user message
 * 2. Conversation context (previous messages)
 * 3. Domain knowledge (competitors, products, etc.)
 * 4. Search intent analysis
 * 
 * Key Features:
 * - Context-aware query construction
 * - Domain-specific keyword injection
 * - Competitor/product recognition
 * - Query optimization for relevance
 */

import { Message } from '@/types/chat';

// ============================================================================
// Domain Knowledge
// ============================================================================

/** Known competitors in the weight loss/telehealth space */
const COMPETITORS = {
  telehealth: [
    'Hims', 'Hers', 'Ro', 'Henry Meds', 'Calibrate', 'Found', 'Noom',
    'WeightWatchers', 'Sequence', 'Plushcare', 'Sesame'
  ],
  compounding: [
    'Empower Pharmacy', 'Hallandale Pharmacy', 'Strive Pharmacy',
    'Olympia Pharmacy', 'Value Scripts', 'Perfect Rx', 'Smart Scripts'
  ],
  brands: [
    'Novo Nordisk', 'Eli Lilly', 'Wegovy', 'Ozempic', 'Mounjaro', 'Zepbound'
  ]
};

/** Product keywords and their full names */
const PRODUCT_MAPPINGS: Record<string, string[]> = {
  'tirzepatide': ['tirzepatide', 'mounjaro', 'zepbound', 'GLP-1/GIP', 'compound tirzepatide'],
  'semaglutide': ['semaglutide', 'ozempic', 'wegovy', 'rybelsus', 'GLP-1', 'compound semaglutide'],
  'glp-1': ['GLP-1', 'glucagon-like peptide', 'weight loss injection', 'diabetes medication'],
  'weight loss': ['weight loss medication', 'weight management', 'obesity treatment', 'medical weight loss'],
};

/** Context keywords that help understand intent */
const CONTEXT_KEYWORDS = {
  pricing: ['price', 'cost', 'fee', 'how much', 'pricing', 'expensive', 'cheap', 'affordable', 'payment'],
  comparison: ['compare', 'competitor', 'vs', 'versus', 'difference', 'better', 'alternative', 'other'],
  availability: ['where', 'available', 'get', 'buy', 'purchase', 'order', 'supply', 'shortage'],
  dosage: ['dose', 'dosage', 'mg', 'milligram', 'injection', 'vial', 'pen'],
  side_effects: ['side effect', 'risk', 'danger', 'safe', 'safety', 'reaction', 'adverse'],
  eligibility: ['eligible', 'qualify', 'requirements', 'criteria', 'who can', 'insurance', 'coverage'],
};

// ============================================================================
// Types
// ============================================================================

export interface SearchQueryContext {
  currentMessage: string;
  conversationHistory: Message[];
  maxHistoryMessages?: number;
}

export interface SmartSearchQuery {
  originalQuery: string;
  optimizedQuery: string;
  keywords: string[];
  intent: string;
  confidence: number;
  context: {
    topic?: string;
    product?: string;
    competitors?: string[];
    isComparison: boolean;
    isPricing: boolean;
  };
}

// ============================================================================
// Smart Search Query Builder
// ============================================================================

export class SmartSearchQueryBuilder {
  
  /**
   * Build an optimized search query based on context
   */
  static buildQuery(ctx: SearchQueryContext): SmartSearchQuery {
    const { currentMessage, conversationHistory, maxHistoryMessages = 5 } = ctx;
    const lowerMessage = currentMessage.toLowerCase();
    
    // Extract context from conversation history
    const contextInfo = this.extractConversationContext(
      conversationHistory.slice(-maxHistoryMessages)
    );
    
    // Detect intent from current message
    const intent = this.detectIntent(lowerMessage);
    
    // Extract keywords from current message + context
    const keywords = this.extractKeywords(lowerMessage, contextInfo);
    
    // Detect if this is a comparison/competitor query
    const isComparison = this.isComparisonQuery(lowerMessage);
    const isPricing = this.isPricingQuery(lowerMessage);
    
    // Detect product focus
    const product = this.detectProduct(lowerMessage, contextInfo);
    
    // Build optimized query
    const optimizedQuery = this.constructOptimizedQuery({
      originalQuery: currentMessage,
      intent,
      keywords,
      product,
      isComparison,
      isPricing,
      contextInfo,
    });
    
    // Get relevant competitors if needed
    const competitors = isComparison ? this.getRelevantCompetitors(intent) : [];
    
    console.log('[SmartSearch] Query optimization:', {
      original: currentMessage.slice(0, 50),
      optimized: optimizedQuery.slice(0, 80),
      intent,
      product,
      isComparison,
      isPricing,
      keywords: keywords.slice(0, 5),
    });
    
    return {
      originalQuery: currentMessage,
      optimizedQuery,
      keywords,
      intent,
      confidence: this.calculateConfidence(keywords, intent),
      context: {
        topic: contextInfo.mainTopic,
        product,
        competitors,
        isComparison,
        isPricing,
      },
    };
  }
  
  /**
   * Extract context from conversation history
   */
  private static extractConversationContext(history: Message[]): {
    mainTopic: string | undefined;
    mentionedProducts: string[];
    mentionedCompetitors: string[];
    recentKeywords: string[];
  } {
    const mentionedProducts: Set<string> = new Set();
    const mentionedCompetitors: Set<string> = new Set();
    const recentKeywords: string[] = [];
    let mainTopic: string | undefined;
    
    for (const msg of history) {
      const content = msg.content.toLowerCase();
      
      // Check for products
      for (const [product, aliases] of Object.entries(PRODUCT_MAPPINGS)) {
        if (aliases.some(alias => content.includes(alias.toLowerCase()))) {
          mentionedProducts.add(product);
          if (!mainTopic) mainTopic = product;
        }
      }
      
      // Check for competitors
      for (const category of Object.values(COMPETITORS)) {
        for (const competitor of category) {
          if (content.includes(competitor.toLowerCase())) {
            mentionedCompetitors.add(competitor);
          }
        }
      }
      
      // Extract important nouns/keywords (simple extraction)
      const words = content.split(/\s+/).filter(w => 
        w.length > 3 && 
        !['what', 'when', 'where', 'how', 'that', 'this', 'with', 'from', 'have', 'will', 'would', 'could', 'should', 'about', 'your', 'they', 'them', 'their', 'there', 'been', 'being'].includes(w)
      );
      recentKeywords.push(...words.slice(0, 5));
    }
    
    return {
      mainTopic,
      mentionedProducts: Array.from(mentionedProducts),
      mentionedCompetitors: Array.from(mentionedCompetitors),
      recentKeywords: [...new Set(recentKeywords)].slice(0, 10),
    };
  }
  
  /**
   * Detect the primary intent of the query
   */
  private static detectIntent(query: string): string {
    for (const [intent, keywords] of Object.entries(CONTEXT_KEYWORDS)) {
      if (keywords.some(kw => query.includes(kw))) {
        return intent;
      }
    }
    
    // Check for general question patterns
    if (/^(what|who|where|when|how|why|can|does|is|are)\s/i.test(query)) {
      return 'general_question';
    }
    
    return 'unknown';
  }
  
  /**
   * Check if this is a comparison/competitor query
   */
  private static isComparisonQuery(query: string): boolean {
    const comparisonKeywords = [
      'competitor', 'competitors', 'compare', 'comparison', 'vs', 'versus',
      'other', 'alternative', 'alternatives', 'different', 'better', 'best',
      'options', 'choices'
    ];
    return comparisonKeywords.some(kw => query.includes(kw));
  }
  
  /**
   * Check if this is a pricing query
   */
  private static isPricingQuery(query: string): boolean {
    return CONTEXT_KEYWORDS.pricing.some(kw => query.includes(kw));
  }
  
  /**
   * Detect which product the query is about
   */
  private static detectProduct(query: string, context: { mentionedProducts: string[] }): string | undefined {
    // Check query first
    for (const [product, aliases] of Object.entries(PRODUCT_MAPPINGS)) {
      if (aliases.some(alias => query.includes(alias.toLowerCase()))) {
        return product;
      }
    }
    
    // Fall back to context
    return context.mentionedProducts[0];
  }
  
  /**
   * Extract meaningful keywords
   */
  private static extractKeywords(query: string, context: { recentKeywords: string[]; mentionedProducts: string[] }): string[] {
    const keywords: Set<string> = new Set();
    
    // Add product-related keywords
    for (const product of context.mentionedProducts) {
      keywords.add(product);
      const mappings = PRODUCT_MAPPINGS[product];
      if (mappings) keywords.add(mappings[0]); // Add primary name
    }
    
    // Add relevant context keywords
    for (const kw of context.recentKeywords) {
      if (kw.length > 4) keywords.add(kw);
    }
    
    // Extract nouns from query (simple approach)
    const queryWords = query.split(/\s+/).filter(w =>
      w.length > 3 &&
      !/^(what|when|where|how|that|this|with|from|have|will|would|could|should|about|your|they|them|their|there|been|being|tell|give|some|info|information|please|can|you|the|for)$/i.test(w)
    );
    queryWords.forEach(w => keywords.add(w));
    
    return Array.from(keywords);
  }
  
  /**
   * Get relevant competitors based on intent
   */
  private static getRelevantCompetitors(intent: string): string[] {
    // For telehealth/pricing comparisons, include top competitors
    const topCompetitors = [
      ...COMPETITORS.telehealth.slice(0, 5),
      ...COMPETITORS.compounding.slice(0, 3),
    ];
    return topCompetitors;
  }
  
  /**
   * Construct an optimized search query
   */
  private static constructOptimizedQuery(params: {
    originalQuery: string;
    intent: string;
    keywords: string[];
    product?: string;
    isComparison: boolean;
    isPricing: boolean;
    contextInfo: { mainTopic?: string; mentionedProducts: string[]; mentionedCompetitors: string[] };
  }): string {
    const { originalQuery, intent, keywords, product, isComparison, isPricing, contextInfo } = params;
    
    const parts: string[] = [];
    
    // Add product if detected
    if (product) {
      parts.push(product);
    } else if (contextInfo.mainTopic) {
      parts.push(contextInfo.mainTopic);
    }
    
    // Handle specific intents
    if (isComparison && isPricing) {
      // "competitor prices" → "tirzepatide compounding pharmacy prices comparison Hims Ro Henry Meds 2026"
      parts.push('compounding pharmacy prices comparison');
      parts.push(...COMPETITORS.telehealth.slice(0, 3).map(c => c));
      parts.push(new Date().getFullYear().toString());
    } else if (isComparison) {
      // General comparison
      parts.push('alternatives comparison');
      parts.push(...COMPETITORS.telehealth.slice(0, 3));
    } else if (isPricing) {
      // Pricing query
      parts.push('pricing cost');
      if (contextInfo.mentionedCompetitors.length > 0) {
        parts.push(...contextInfo.mentionedCompetitors.slice(0, 2));
      }
    } else if (intent === 'availability') {
      parts.push('availability where to get');
    } else if (intent === 'side_effects') {
      parts.push('side effects safety risks');
    } else if (intent === 'dosage') {
      parts.push('dosage mg injection');
    } else if (intent === 'eligibility') {
      parts.push('eligibility requirements insurance coverage');
    } else {
      // Default: use extracted keywords
      parts.push(...keywords.slice(0, 5));
    }
    
    // Build final query, removing duplicates
    const uniqueParts = [...new Set(parts.filter(p => p && p.length > 0))];
    const optimizedQuery = uniqueParts.join(' ').trim();
    
    // If the optimized query is too short or empty, return enhanced original
    if (optimizedQuery.length < 10) {
      return this.enhanceOriginalQuery(originalQuery, contextInfo);
    }
    
    return optimizedQuery;
  }
  
  /**
   * Enhance the original query with context if optimization failed
   */
  private static enhanceOriginalQuery(
    query: string,
    context: { mainTopic?: string; mentionedProducts: string[] }
  ): string {
    const parts = [query];
    
    // Add product context if available
    if (context.mainTopic && !query.toLowerCase().includes(context.mainTopic)) {
      parts.unshift(context.mainTopic);
    }
    
    return parts.join(' ');
  }
  
  /**
   * Calculate confidence score for the query
   */
  private static calculateConfidence(keywords: string[], intent: string): number {
    let confidence = 0.5;
    
    // More keywords = more confidence
    confidence += Math.min(keywords.length * 0.1, 0.3);
    
    // Known intent = higher confidence
    if (intent !== 'unknown') {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Determine if a web search should be performed at all
   * Returns false if KB should handle it or if query is too vague
   * 
   * IMPORTANT: We want to SKIP web search when:
   * 1. KB already has the answer (pricing, dosage, policies)
   * 2. Query is too vague to get useful results
   * 3. It's an internal/company-specific question
   */
  static shouldPerformWebSearch(query: SmartSearchQuery, hasKBHit: boolean): boolean {
    // Internal topics that KB should handle - SKIP web search
    const internalTopics = ['pricing', 'dosage', 'eligibility', 'policy', 'procedure'];
    const isInternalTopic = internalTopics.includes(query.intent) || 
      query.context.isPricing; // Pricing is usually internal
    
    // If KB has results for internal topics, SKIP web search entirely
    if (hasKBHit && isInternalTopic && !query.context.isComparison) {
      console.log('[SmartSearch] ⏭️ Skipping web search - KB has internal info');
      return false;
    }
    
    // If KB has good results and not a comparison, skip web
    if (hasKBHit && !query.context.isComparison) {
      console.log('[SmartSearch] ⏭️ Skipping web search - KB has results');
      return false;
    }
    
    // Only search web for competitor comparisons
    if (query.context.isComparison) {
      console.log('[SmartSearch] ✅ Web search needed - comparison query');
      return true;
    }
    
    // Skip if query is too vague
    if (query.keywords.length < 2 && query.intent === 'unknown') {
      console.log('[SmartSearch] ⏭️ Skipping web search - query too vague');
      return false;
    }
    
    // Default: skip web search if KB has any results
    if (hasKBHit) {
      console.log('[SmartSearch] ⏭️ Skipping web search - KB sufficient');
      return false;
    }
    
    return true;
  }
}
