import { adminDb } from '@/lib/firebaseAdmin';
import OpenAI from 'openai';

// Initialize OpenAI client for embeddings (singleton for performance)
let openaiInstance: OpenAI | null = null;
const getOpenAI = () => {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy',
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return openaiInstance;
};

// Simple in-memory cache for embeddings (TTL: 5 minutes)
const embeddingCache = new Map<string, { vector: number[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Simple in-memory cache for context results (TTL: 2 minutes)
const contextCache = new Map<string, { context: string; timestamp: number }>();
const CONTEXT_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

export class RAGService {
  
  /**
   * Generates embedding with caching for performance
   */
  private static async getEmbedding(text: string): Promise<number[]> {
    const cacheKey = text.substring(0, 200); // Use first 200 chars as key
    const cached = embeddingCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      console.log('[RAG] Using cached embedding');
      return cached.vector;
    }
    
    const openai = getOpenAI();
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });
    
    const vector = embeddingResponse.data[0].embedding;
    
    // Cache the result
    embeddingCache.set(cacheKey, { vector, timestamp: Date.now() });
    
    // Clean old cache entries
    if (embeddingCache.size > 100) {
      const now = Date.now();
      for (const [key, value] of embeddingCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          embeddingCache.delete(key);
        }
      }
    }
    
    return vector;
  }
  
  /**
   * Retrieves relevant context chunks from Firestore Vector Store
   * Optimized with caching and parallel processing
   */
  static async retrieveContext(query: string, projectId?: string): Promise<string> {
    if (!projectId) return '';

    // Check context cache first
    const cacheKey = `${projectId}:${query.substring(0, 100)}`;
    const cached = contextCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CONTEXT_CACHE_TTL) {
      console.log('[RAG] Using cached context');
      return cached.context;
    }

    try {
      console.log(`[RAG] Generating embedding for: "${query.substring(0, 50)}..."`);
      
      // 1. Generate Query Embedding (with caching)
      const queryVector = await this.getEmbedding(query);

      // 2. Perform Vector Search
      // Note: Ideally, use a dedicated Vector DB or Firestore Vector Search (preview) 
      // This implementation assumes 'chunks' has a vector field and we do manual cos-sim or use a query extension
      const chunksSnapshot = await adminDb.collectionGroup('chunks')
        .where('projectId', '==', projectId)
        .limit(100)
        .get();
        
      if (chunksSnapshot.empty) {
        console.log('[RAG] No chunks found for project.');
        return '';
      }

      // Calculate cosine similarity
      const scoredChunks = chunksSnapshot.docs.map(doc => {
        const data = doc.data();
        const chunkVector = data.embedding;
        
        if (!chunkVector || chunkVector.length !== queryVector.length) return null;

        let dotProduct = 0;
        let queryNorm = 0;
        let chunkNorm = 0;
        
        for (let i = 0; i < queryVector.length; i++) {
          dotProduct += queryVector[i] * chunkVector[i];
          queryNorm += queryVector[i] * queryVector[i];
          chunkNorm += chunkVector[i] * chunkVector[i];
        }
        
        const similarity = dotProduct / (Math.sqrt(queryNorm) * Math.sqrt(chunkNorm));
        
        return { 
          content: data.content, 
          score: similarity,
          source: data.sourceName || 'Knowledge Base',
        };
      }).filter(Boolean) as { content: string, score: number, source: string }[];

      // 3. Re-ranking / Filtering
      const chunksToRerank = scoredChunks
        .sort((a, b) => b.score - a.score)
        .slice(0, 15); // Take top 15 for re-ranking

      console.log(`[RAG] Re-ranking ${chunksToRerank.length} chunks...`);
      
      const refinedChunks = await this.rerankWithLLM(query, chunksToRerank);
      
      const context = refinedChunks.map(c => `[Source: ${c.source}]\n${c.content}`).join('\n\n---\n\n');
      
      // Cache the result
      contextCache.set(cacheKey, { context, timestamp: Date.now() });
      
      // Clean old cache entries
      if (contextCache.size > 50) {
        const now = Date.now();
        for (const [key, value] of contextCache.entries()) {
          if (now - value.timestamp > CONTEXT_CACHE_TTL) {
            contextCache.delete(key);
          }
        }
      }
      
      return context;

    } catch (error) {
      console.error("[RAG] Context Retrieval Failed:", error);
      return ''; // Fail gracefully (continue chat without context)
    }
  }

  /**
   * Uses a fast LLM to re-rank chunks by actual query relevance
   */
  private static async rerankWithLLM(query: string, chunks: { content: string, source: string, score: number }[]): Promise<{ content: string, source: string }[]> {
      // If we have very few chunks, no need to re-rank
      if (chunks.length <= 5) return chunks;

      const candidates = chunks.map((c, i) => `ID ${i} [${c.source}]: ${c.content.substring(0, 300).replace(/\n/g, ' ')}...`).join('\n');
      
      try {
          const openai = getOpenAI();
          const response = await openai.chat.completions.create({
              model: "gpt-4o-mini", // Use cheap model for ranking
              messages: [
                  { role: "system", content: "You are a specialized relevance ranker for a RAG system.\nTask: Select the top 5 most relevant document chunks for the user's query.\nOutput: JSON object { \"indices\": [0, 2, ...] }" },
                  { role: "user", content: `QUERY: "${query}"\n\nDOCUMENTS:\n${candidates}` }
              ],
              temperature: 0,
              response_format: { type: "json_object" }
          });
          
          const text = response.choices[0].message.content;
          const result = JSON.parse(text || '{ "indices": [] }');
          const indices: number[] = result.indices || [];
          
          if (!Array.isArray(indices) || indices.length === 0) {
              return chunks.slice(0, 5); // Fallback to vector score
          }

          console.log(`[RAG] Re-ranker selected indices: ${indices.join(', ')}`);
          
          return indices
              .filter(i => chunks[i])
              .map(i => chunks[i]);
              
      } catch (e) {
          console.error("[RAG] Re-ranking failed:", e);
          return chunks.slice(0, 5); // Fallback to vector score
      }
  }
}
