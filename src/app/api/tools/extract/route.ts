import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { urls, query } = await req.json();

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ error: 'Missing or invalid urls array' }, { status: 400 });
    }

    // Try Tavily Extract first (best quality)
    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      try {
        const response = await fetch('https://api.tavily.com/extract', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${tavilyKey}`
          },
          body: JSON.stringify({
            urls: urls.slice(0, 5) // Limit to 5 URLs
          })
        });

        if (response.ok) {
          const data = await response.json();
          return NextResponse.json({
            results: data.results?.map((r: any) => ({
              url: r.url,
              raw_content: r.raw_content || r.content || '',
              success: true
            })) || [],
            failed_results: data.failed_results || []
          });
        }
      } catch (tavilyError) {
        console.error('Tavily Extract failed:', tavilyError);
        // Fall through to alternative methods
      }
    }

    // Fallback: Use a simple fetch with text extraction
    const results = await Promise.all(
      urls.slice(0, 5).map(async (url: string) => {
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (compatible; AmbleAI/1.0; +https://amble-ai.web.app)',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });

          if (!response.ok) {
            return { url, raw_content: '', success: false, error: `HTTP ${response.status}` };
          }

          const html = await response.text();
          
          // Basic HTML to text extraction
          const textContent = extractTextFromHtml(html);
          
          return {
            url,
            raw_content: textContent.slice(0, 50000), // Limit to 50k chars
            success: true
          };
        } catch (error: any) {
          console.error(`Failed to extract ${url}:`, error);
          return { url, raw_content: '', success: false, error: error.message };
        }
      })
    );

    return NextResponse.json({ 
      results: results.filter(r => r.success),
      failed_results: results.filter(r => !r.success)
    });

  } catch (error) {
    console.error('Extract API Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// Basic HTML to text extraction
function extractTextFromHtml(html: string): string {
  // Remove script and style tags with their content
  let text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  
  // Replace common block elements with newlines
  text = text
    .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
    .replace(/<\/?(td|th)[^>]*>/gi, ' | ');
  
  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '');
  
  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&[a-z]+;/gi, ' ');
  
  // Clean up whitespace
  text = text
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();
  
  return text;
}
