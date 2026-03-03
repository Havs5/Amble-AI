
export type ComplexityTier = 'instant' | 'simple' | 'complex' | 'reasoning';

export interface ModelRoute {
  provider: 'openai' | 'google';
  modelId: string;
  reasoning?: boolean;
}

// Search intent detection types
export type SearchIntent = 'none' | 'factual' | 'news' | 'research' | 'realtime' | 'comparison';

export interface SearchAnalysis {
  shouldSearch: boolean;
  intent: SearchIntent;
  confidence: number;
  suggestedSources: ('google' | 'tavily' | 'news')[];
  extractedEntities: string[];
  timeContext?: 'past' | 'present' | 'future';
}

export class MagicRouter {
  
  static detectComplexity(query: string): ComplexityTier {
    const lowerQuery = query.toLowerCase();
    const wordCount = query.split(/\s+/).length;

    // TIER 4: REASONING (Deep Thinking)
    // Triggers: Complex coding, planning, logic puzzles, "think step by step"
    const reasoningTriggers = [
      'plan', 'strategy', 'architecture', 'design pattern', 
      'solve', 'optimize', 'debug complex', 'proof', 
      'step by step', 'chain of thought', 'reasoning',
      'analyze data', 'medical diagnosis', 'legal appeal',
      'compare and contrast', 'evaluate', 'critique', 'review'
    ];
    if (reasoningTriggers.some(t => lowerQuery.includes(t)) || wordCount > 100) {
      return 'reasoning';
    }

    // TIER 3: COMPLEX (Standard Intelligence)
    // Triggers: Analysis, detailed explanation, medical queries
    const complexTriggers = [
      'analyze', 'compare', 'explain in detail', 'comprehensive',
      'implications', 'pros and cons', 'relationship between',
      'billing code', 'cpt', 'icd-10', 'denial reason'
    ];
    if (complexTriggers.some(t => lowerQuery.includes(t)) || wordCount > 30) {
      return 'complex';
    }

    // TIER 2: SIMPLE (Fast & Cheap)
    return 'simple';
  }

  // LATEST MODEL MAPPINGS - January 2026
  // Display as Gemini 3 / GPT-5, use actual 2.0 models
  // DEFAULT: Google (Gemini) for cost efficiency - Gemini Flash is 25x cheaper than GPT-5
  static getRecommendedModel(tier: ComplexityTier, providerPreference: 'openai' | 'google' = 'google'): ModelRoute {
    if (providerPreference === 'google') {
      switch (tier) {
        case 'reasoning': return { provider: 'google', modelId: 'gemini-3-thinking', reasoning: true };
        case 'complex': return { provider: 'google', modelId: 'gemini-3-pro' };
        case 'simple': return { provider: 'google', modelId: 'gemini-3-flash' }; 
        default: return { provider: 'google', modelId: 'gemini-3-flash' };
      }
    } else {
      switch (tier) {
        case 'reasoning': return { provider: 'openai', modelId: 'o3', reasoning: true }; 
        case 'complex': return { provider: 'openai', modelId: 'gpt-5' };
        case 'simple': return { provider: 'openai', modelId: 'gpt-5-mini' };
        default: return { provider: 'openai', modelId: 'gpt-5-mini' };
      }
    }
  }

  /**
   * INTELLIGENT SEARCH DETECTION - ChatGPT/Gemini Style
   * Analyzes query to determine if web search is needed and what type
   */
  static analyzeSearchIntent(query: string): SearchAnalysis {
    const lowerQuery = query.toLowerCase();
    const words = lowerQuery.split(/\s+/);
    
    // Default result
    const result: SearchAnalysis = {
      shouldSearch: false,
      intent: 'none',
      confidence: 0,
      suggestedSources: [],
      extractedEntities: [],
      timeContext: undefined
    };

    // === PATTERN 1: EXPLICIT SEARCH REQUESTS ===
    const explicitSearchPatterns = [
      /search\s+(for|about|online)/i,
      /look\s+(up|online|for)/i,
      /google\s+/i,
      /find\s+(information|info|out|online)/i,
      /what('s| is)\s+the\s+(latest|current|newest)/i,
      /browse\s+(the\s+)?(web|internet)/i
    ];
    
    for (const pattern of explicitSearchPatterns) {
      if (pattern.test(query)) {
        result.shouldSearch = true;
        result.intent = 'research';
        result.confidence = 0.95;
        result.suggestedSources = ['google', 'tavily'];
        break;
      }
    }

    // === PATTERN 2: REAL-TIME / CURRENT INFORMATION ===
    const realtimeKeywords = [
      'today', 'right now', 'currently', 'this week', 'this month', 
      'live', 'breaking', 'latest', 'recent', 'new', 'update',
      'price', 'stock price', 'weather', 'score', 'results',
      '2025', '2026', '2027'
    ];
    
    if (realtimeKeywords.some(k => lowerQuery.includes(k))) {
      result.shouldSearch = true;
      result.intent = 'realtime';
      result.confidence = Math.max(result.confidence, 0.9);
      result.suggestedSources = ['google', 'tavily', 'news'];
      result.timeContext = 'present';
    }

    // === PATTERN 3: NEWS & EVENTS ===
    const newsKeywords = [
      'news', 'headlines', 'announced', 'released', 'launched',
      'happened', 'event', 'conference', 'election', 'controversy',
      'scandal', 'died', 'born', 'married', 'arrested'
    ];
    
    if (newsKeywords.some(k => lowerQuery.includes(k))) {
      result.shouldSearch = true;
      result.intent = 'news';
      result.confidence = Math.max(result.confidence, 0.92);
      result.suggestedSources = ['news', 'google'];
      result.timeContext = 'present';
    }

    // === PATTERN 4: FACTUAL QUESTIONS (WHO/WHAT/WHERE/WHEN) ===
    const factualPatterns = [
      /^who\s+(is|was|are|were|will)/i,
      /^what\s+(is|are|was|were|does|did|will)/i,
      /^where\s+(is|are|was|were|can|do)/i,
      /^when\s+(is|was|did|will|does)/i,
      /^how\s+(much|many|do|does|did|can|to)/i,
      /^why\s+(is|are|do|does|did|was)/i,
      /^which\s+(is|are|was|were)/i
    ];
    
    // Only trigger for factual patterns if they seem to need current info
    for (const pattern of factualPatterns) {
      if (pattern.test(query)) {
        // Check if it's about something that needs lookup vs creative task
        const creativeIndicators = ['write', 'create', 'code', 'draft', 'compose', 'design', 'make'];
        if (!creativeIndicators.some(c => lowerQuery.includes(c))) {
          // Check for entities that suggest real-world lookup
          const entityIndicators = [
            'president', 'ceo', 'company', 'country', 'city', 'movie', 
            'album', 'book', 'game', 'app', 'product', 'person', 'celebrity',
            'team', 'player', 'artist', 'song', 'show', 'series'
          ];
          
          if (entityIndicators.some(e => lowerQuery.includes(e)) || 
              /[A-Z][a-z]+\s+[A-Z][a-z]+/.test(query)) { // Proper nouns
            result.shouldSearch = true;
            result.intent = 'factual';
            result.confidence = Math.max(result.confidence, 0.75);
            result.suggestedSources = ['google'];
          }
        }
        break;
      }
    }

    // === PATTERN 5: COMPARISON / REVIEWS ===
    const comparisonKeywords = [
      'vs', 'versus', 'compare', 'better', 'best', 'worst',
      'review', 'reviews', 'rating', 'rankings', 'top 10', 'top 5'
    ];
    
    if (comparisonKeywords.some(k => lowerQuery.includes(k))) {
      result.shouldSearch = true;
      result.intent = 'comparison';
      result.confidence = Math.max(result.confidence, 0.85);
      result.suggestedSources = ['google', 'tavily'];
    }

    // === PATTERN 6: SPECIFIC DOMAINS (Always search) ===
    const alwaysSearchDomains = [
      'stock', 'crypto', 'bitcoin', 'ethereum', 'market',
      'flight', 'hotel', 'restaurant', 'recipe',
      'tutorial', 'guide', 'documentation', 'api'
    ];
    
    if (alwaysSearchDomains.some(d => lowerQuery.includes(d))) {
      result.shouldSearch = true;
      result.intent = 'research';
      result.confidence = Math.max(result.confidence, 0.88);
      result.suggestedSources = ['google', 'tavily'];
    }

    // === ENTITY EXTRACTION ===
    // Extract proper nouns and potential entities for targeted search
    const properNouns = query.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
    const quotedPhrases = query.match(/"[^"]+"/g) || [];
    result.extractedEntities = [...properNouns, ...quotedPhrases.map(p => p.replace(/"/g, ''))];

    // === BOOST CONFIDENCE IF MULTIPLE SIGNALS ===
    if (result.suggestedSources.length >= 2) {
      result.confidence = Math.min(result.confidence + 0.05, 1.0);
    }

    return result;
  }

  // Simple boolean wrapper for backward compatibility
  static detectNeedsWebSearch(query: string): boolean {
    const analysis = this.analyzeSearchIntent(query);
    return analysis.shouldSearch && analysis.confidence > 0.6;
  }

  /**
   * Generate optimized search query from user question
   * Removes filler words, focuses on key entities
   */
  static optimizeSearchQuery(originalQuery: string): string {
    // Remove common filler phrases
    let optimized = originalQuery
      .replace(/^(can you |please |i want to know |tell me |what is |who is |where is )/i, '')
      .replace(/\?$/, '')
      .trim();
    
    // If query is already short, return as-is
    if (optimized.split(/\s+/).length <= 5) return optimized;
    
    // Extract key terms for longer queries
    const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with',
      'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
      'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
      'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or',
      'because', 'until', 'while', 'about', 'against', 'i', 'me', 'my', 'you', 'your', 'we', 'our']);
    
    const keyTerms = optimized
      .split(/\s+/)
      .filter(word => !stopWords.has(word.toLowerCase()) && word.length > 2);
    
    // Return first 8 key terms
    return keyTerms.slice(0, 8).join(' ');
  }
}
