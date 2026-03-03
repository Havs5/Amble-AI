
import { Tool } from '../agentSystem';

export class SearchTool implements Tool {
  name = 'web_search';
  description = 'Search the web for information using a search engine. Use this for current events or facts.';
  
  schema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query string'
      }
    },
    required: ['query']
  };

  async execute(args: { query: string }): Promise<string> {
    console.log(`[SearchTool] Searching for: ${args.query}`);
    
    try {
      const response = await fetch('/api/tools/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: args.query })
      });

      if (!response.ok) {
        throw new Error(`Search API failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!data.results || data.results.length === 0) {
        return "No results found.";
      }

      // Format results for the agent
      return data.results.map((r: any) => `Title: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}\n---`).join('\n');

    } catch (error: any) {
      console.error('[SearchTool] Error:', error);
      return `Error performing search: ${error.message}`;
    }
  }
}
