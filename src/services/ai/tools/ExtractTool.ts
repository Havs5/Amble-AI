
import { Tool } from '../agentSystem';

export class ExtractTool implements Tool {
  name = 'web_extract';
  description = 'Extract the full text content from a list of URLs. Use this after searching to read the details of a page.';
  
  schema = {
    type: 'object',
    properties: {
      urls: {
        type: 'array',
        items: { type: 'string' },
        description: 'The list of URLs to extract content from'
      }
    },
    required: ['urls']
  };

  async execute(args: { urls: string[] }): Promise<string> {
    console.log(`[ExtractTool] Extracting from ${args.urls.length} URLs`);
    
    try {
      const response = await fetch('/api/tools/extract', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ urls: args.urls })
      });

      if (!response.ok) {
        throw new Error(`Extract API failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        return "No content extracted.";
      }

      // Format results for the agent (limit length to prevent context overflow)
      return data.results.map((r: any) => `URL: ${r.url}\nContent: ${r.raw_content ? r.raw_content.substring(0, 5000) : 'No content'}...\n---`).join('\n');

    } catch (error: any) {
      console.error('[ExtractTool] Error:', error);
      return `Error extracting content: ${error.message}`;
    }
  }
}
