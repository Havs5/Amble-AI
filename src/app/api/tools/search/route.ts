import { NextRequest, NextResponse } from 'next/server';
import { rateLimitCheck } from '@/lib/rateLimiter';

export async function POST(req: NextRequest) {
  // Rate limiting for search
  const rateLimitResponse = rateLimitCheck(req, 'tools');
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { query, extractContent = true } = await req.json();

    if (!query) {
      return NextResponse.json({ error: 'Missing query' }, { status: 400 });
    }

    const tavilyKey = process.env.TAVILY_API_KEY;
    const googleKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_SEARCH_API_KEY;
    const googleCx = process.env.GOOGLE_SEARCH_CX || process.env.NEXT_PUBLIC_GOOGLE_SEARCH_CX;

    // Try Google Custom Search API first (user preference)
    if (googleKey && googleCx) {
      try {
        console.log('[Search API] Using Google Custom Search');
        const url = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&num=10`;
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[Search API] Google returned', data.items?.length || 0, 'results');
          
          if (data.items && data.items.length > 0) {
            let results = data.items.map((item: any) => ({
              title: item.title,
              url: item.link,
              snippet: item.snippet,
              content: item.snippet, // Google only gives snippets, we'll extract more below
              source: 'google'
            }));

            // Extract full content from top URLs using Tavily Extract if available
            if (extractContent && tavilyKey) {
              const urlsToExtract = results.slice(0, 5).map((r: any) => r.url);
              
              try {
                console.log('[Search API] Extracting content from Google results using Tavily');
                const extractResponse = await fetch('https://api.tavily.com/extract', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tavilyKey}`
                  },
                  body: JSON.stringify({ urls: urlsToExtract })
                });

                if (extractResponse.ok) {
                  const extractData = await extractResponse.json();
                  
                  // Merge extracted content back into results
                  const extractedMap = new Map(
                    extractData.results?.map((e: any) => [e.url, e.raw_content]) || []
                  );
                  
                  results = results.map((r: any) => ({
                    ...r,
                    content: extractedMap.get(r.url) || r.content
                  }));
                }
              } catch (extractError) {
                console.error('Tavily extract failed:', extractError);
                // Continue with snippets only
              }
            }

            return NextResponse.json({ results, searchEngine: 'google' });
          }
        } else {
          console.error('Google Search API error:', response.status, await response.text());
        }
      } catch (googleError) {
        console.error('Google search failed:', googleError);
        // Fall through to Tavily
      }
    }

    // Fallback to Tavily with deep search
    if (tavilyKey) {
      try {
        console.log('[Search API] Using Tavily Search (fallback)');
        const searchResponse = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tavilyKey}`
          },
          body: JSON.stringify({
            query,
            search_depth: 'advanced',
            include_answer: true,
            include_images: false,
            include_raw_content: true,
            max_results: 8,
          })
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          
          let results = searchData.results.map((r: any) => ({
            title: r.title,
            url: r.url,
            content: r.raw_content || r.content,
            snippet: r.content,
            source: 'tavily'
          }));

          // Extract more content if needed
          if (extractContent) {
            const urlsToExtract = results
              .filter((r: any) => !r.content || r.content.length < 500)
              .map((r: any) => r.url)
              .slice(0, 5);
            
            if (urlsToExtract.length > 0) {
              try {
                const extractResponse = await fetch('https://api.tavily.com/extract', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${tavilyKey}`
                  },
                  body: JSON.stringify({ urls: urlsToExtract })
                });

                if (extractResponse.ok) {
                  const extractData = await extractResponse.json();
                  const extractedMap = new Map(
                    extractData.results?.map((e: any) => [e.url, e.raw_content]) || []
                  );
                  
                  results = results.map((r: any) => ({
                    ...r,
                    content: extractedMap.get(r.url) || r.content
                  }));
                }
              } catch (extractError) {
                console.error('Tavily extract failed:', extractError);
              }
            }
          }

          return NextResponse.json({
            answer: searchData.answer,
            results,
            searchEngine: 'tavily'
          });
        }
      } catch (tavilyError) {
        console.error('Tavily search failed:', tavilyError);
      }
    }

    // Mock response if no keys or all failed
    console.warn('All search APIs failed or not configured. Returning mock data.');
    return NextResponse.json({
        results: [
            {
                title: `Results for ${query}`,
                url: 'https://example.com',
                content: 'Search APIs are not configured or failed. Please configure GOOGLE_SEARCH_API_KEY/GOOGLE_SEARCH_CX or TAVILY_API_KEY.',
                snippet: 'Search APIs are not configured or failed.'
            }
        ]
    });

  } catch (error) {
    console.error('Search API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
