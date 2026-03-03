/**
 * Intelligent Search Service
 * Handles search intent analysis and intelligent routing
 */

const { searchGoogle, searchTavily, searchDuckDuckGo } = require('./searchService');

/**
 * Analyze a search query to determine intent and best search strategy
 */
function analyzeSearchIntent(query) {
  const lowerQuery = query.toLowerCase();
  
  // Determine search type based on patterns
  const isNews = /news|latest|recent|today|breaking|current|update/i.test(query);
  const isCode = /code|programming|syntax|function|api|documentation|github/i.test(query);
  const isAcademic = /research|study|paper|scientific|journal|citation/i.test(query);
  const isLocal = /near me|nearby|local|directions|map/i.test(query);
  const isDefinition = /what is|define|meaning of|definition/i.test(query);
  const isHowTo = /how to|how do|tutorial|guide|steps/i.test(query);
  
  return {
    query,
    isNews,
    isCode,
    isAcademic,
    isLocal,
    isDefinition,
    isHowTo,
    needsFreshResults: isNews,
    searchType: isNews ? 'news' : isCode ? 'code' : isAcademic ? 'academic' : 'general'
  };
}

/**
 * Perform an intelligent search across multiple sources
 */
async function intelligentSearch(query, options = {}) {
  const intent = analyzeSearchIntent(query);
  const results = [];
  
  try {
    // Try Tavily first for general searches
    if (process.env.TAVILY_API_KEY) {
      try {
        const tavilyResults = await searchTavily(query);
        if (tavilyResults && tavilyResults.length > 0) {
          results.push(...tavilyResults.map(r => ({
            ...r,
            source: 'tavily'
          })));
        }
      } catch (e) {
        console.warn('[IntelligentSearch] Tavily search failed:', e.message);
      }
    }
    
    // Fall back to Google if needed
    if (results.length < 3 && process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX) {
      try {
        const googleResults = await searchGoogle(query);
        if (googleResults && googleResults.length > 0) {
          results.push(...googleResults.map(r => ({
            ...r,
            source: 'google'
          })));
        }
      } catch (e) {
        console.warn('[IntelligentSearch] Google search failed:', e.message);
      }
    }
    
    // Last resort: DuckDuckGo
    if (results.length < 3) {
      try {
        const ddgResults = await searchDuckDuckGo(query);
        if (ddgResults && ddgResults.length > 0) {
          results.push(...ddgResults.map(r => ({
            ...r,
            source: 'duckduckgo'
          })));
        }
      } catch (e) {
        console.warn('[IntelligentSearch] DuckDuckGo search failed:', e.message);
      }
    }
    
  } catch (e) {
    console.error('[IntelligentSearch] Search failed:', e);
  }
  
  return {
    intent,
    results: results.slice(0, 10), // Limit to top 10
    totalResults: results.length
  };
}

/**
 * Format search results into context for the AI
 */
function formatSearchContext(searchResults) {
  if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
    return '';
  }
  
  const { intent, results } = searchResults;
  
  let context = `\n\n## Web Search Results (${intent.searchType} search)\n`;
  
  results.forEach((result, index) => {
    context += `\n### ${index + 1}. ${result.title || 'Untitled'}\n`;
    context += `**Source:** ${result.url || 'N/A'}\n`;
    if (result.snippet || result.description) {
      context += `${result.snippet || result.description}\n`;
    }
  });
  
  return context;
}

module.exports = {
  analyzeSearchIntent,
  intelligentSearch,
  formatSearchContext
};
