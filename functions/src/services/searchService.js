async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 5000 } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

function extractMainContent(html) {
  let clean = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gmi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gmi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gmi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gmi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gmi, "")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gmi, "")
    .replace(/<!--[\s\S]*?-->/g, "");

  const pRegex = /<p\b[^>]*>([\s\S]*?)<\/p>/gmi;
  let paragraphs = [];
  let match;
  while ((match = pRegex.exec(clean)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (text.length > 50) paragraphs.push(text);
  }

  if (paragraphs.length === 0) {
      const bodyText = clean.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return bodyText.substring(0, 2000);
  }
  return paragraphs.join("\n\n").substring(0, 8000);
}

async function searchGoogle(query, options = {}) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;
  
  console.log('[Search] Google API keys check:', { hasKey: !!apiKey, hasCx: !!cx });
  
  // Return null to signal fallback if keys are missing
  if (!apiKey || !cx) {
    console.log('[Search] Google keys missing, will fallback to Tavily');
    return null;
  }

  try {
    console.log('[Search] Trying Google Custom Search for:', query);
    const url = new URL("https://www.googleapis.com/customsearch/v1");
    url.searchParams.append("key", apiKey);
    url.searchParams.append("cx", cx);
    url.searchParams.append("q", query);
    url.searchParams.append("num", options.max_results || 5);
    
    if (options.topic === 'news') {
        url.searchParams.append("dateRestrict", "d" + (options.days || 1));
    }

    const res = await fetch(url.toString());
    
    if (!res.ok) {
        const errorText = await res.text();
        console.error(`[Search] Google API returned ${res.status}: ${errorText}`);
        return null; // Fallback
    }
    
    const data = await res.json();
    if (!data.items) {
      console.log('[Search] Google returned no items');
      return [];
    }

    console.log('[Search] Google returned', data.items.length, 'results');
    return data.items.map(item => ({
      title: item.title,
      url: item.link,
      content: item.snippet,
      snippet: item.snippet,
      source: 'google'
    }));
  } catch (error) {
    console.error("[Search] Google search error:", error);
    return null; // Fallback
  }
}

async function searchTavily(query, options = {}) {
  const apiKey = process.env.TAVILY_API_KEY;
  const googleKey = process.env.GOOGLE_SEARCH_API_KEY;
  const googleCx = process.env.GOOGLE_SEARCH_CX;
  
  // Try Google Custom Search first
  if (googleKey && googleCx) {
    try {
      console.log('[Search] Trying Google Custom Search first...');
      const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&num=10`;
      const response = await fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        if (data.items && data.items.length > 0) {
          console.log(`[Search] Google returned ${data.items.length} results`);
          return data.items.map((item) => ({
            title: item.title,
            url: item.link,
            content: item.snippet,
            snippet: item.snippet,
            raw_content: item.snippet
          }));
        }
      } else {
        console.error('[Search] Google API error:', response.status, await response.text());
      }
    } catch (error) {
      console.error('[Search] Google search failed:', error.message);
    }
  } else {
    console.log('[Search] Google keys not configured, skipping...');
  }
  
  // Fallback to Tavily
  if (!apiKey) {
    console.error('[Search] TAVILY_API_KEY not found');
    return [];
  }
  
  try {
    console.log('[Search] Trying Tavily search...');
    const body = {
        api_key: apiKey,
        query: query,
        search_depth: options.search_depth || "advanced",
        include_answer: true,
        max_results: options.max_results || 8,
        include_images: false,
        include_raw_content: true,
        topic: options.topic || "general"
    };

    if (options.topic === 'news' && options.days) {
        body.days = options.days;
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      console.error('[Search] Tavily API error:', response.status, await response.text());
      return [];
    }
    const data = await response.json();
    console.log(`[Search] Tavily returned ${data.results?.length || 0} results`);
    return data.results.map((r) => ({
      title: r.title,
      url: r.url,
      content: r.content,
      snippet: r.content,
      raw_content: r.raw_content,
      source: 'tavily'
    }));
  } catch (error) {
    console.error("Tavily search failed:", error);
    return [];
  }
}

async function extractTavily(urls) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return { error: "No API Key" };
  try {
     const response = await fetch("https://api.tavily.com/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            api_key: apiKey,
            urls: urls,
            include_images: false // Text focus
        })
     });
     if (!response.ok) return { error: "Extraction failed" };
     const data = await response.json();
     return data.results || [];
  } catch (error) {
      console.error("Tavily extract failed:", error);
      return { error: error.message };
  }
}

async function searchDuckDuckGo(query) {
  try {
    const response = await fetchWithTimeout(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 4000
    });
    if (!response.ok) return [];

    const htmlText = await response.text();
    const results = [];
    const regex = /<h2 class="result__title">[\s\S]*?<a class="result__a" href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet" href="[^"]+">([\s\S]*?)<\/a>/g;
    
    let match;
    let count = 0;
    while ((match = regex.exec(htmlText)) !== null && count < 8) {
        const url = match[1];
        const title = match[2].replace(/<[^>]*>/g, '').trim(); 
        const snippet = match[3].replace(/<[^>]*>/g, '').trim(); 
        if (url && !url.includes('duckduckgo.com')) {
            results.push({ title, url, snippet });
            count++;
        }
    }
    return results;
  } catch (error) {
    console.warn("DuckDuckGo scrape failed:", error);
    return [];
  }
}

module.exports = { searchGoogle, searchTavily, extractTavily, searchDuckDuckGo };
