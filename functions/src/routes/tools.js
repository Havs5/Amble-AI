/**
 * Tools Route Handler
 * 
 * Handles /api/tools/* endpoints for search and extraction.
 */

const { searchGoogle, searchTavily, extractTavily } = require('../services/searchService');

// ============================================================================
// Search Handler
// ============================================================================

async function handleSearch(req, res, { writeJson, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const query = body.query;
    
    if (!query) {
      return writeJson(res, 400, { error: 'Query is required' });
    }

    // Try Google first, then fallback to Tavily
    let results = await searchGoogle(query, body);
    
    if (!results) {
      console.log('[Search] Google Search unavailable, falling back to Tavily');
      results = await searchTavily(query, body);
    }

    return writeJson(res, 200, { results });
    
  } catch (e) {
    console.error('Error in search handler:', e);
    return writeJson(res, 500, { error: 'Search failed' });
  }
}

// ============================================================================
// Extract Handler
// ============================================================================

async function handleExtract(req, res, { writeJson, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const urls = body.urls;
    
    if (!urls || !Array.isArray(urls)) {
      return writeJson(res, 400, { error: 'URLs array is required' });
    }

    const results = await extractTavily(urls);
    return writeJson(res, 200, { results });
    
  } catch (e) {
    console.error('Error in extract handler:', e);
    return writeJson(res, 500, { error: 'Extract failed' });
  }
}

module.exports = { handleSearch, handleExtract };
