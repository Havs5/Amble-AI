/**
 * Embedding Service
 * 
 * Handles text embedding generation and vector similarity search
 * using OpenAI's embedding models. Includes caching and batching
 * for performance optimization.
 */

import crypto from 'crypto';
import OpenAI from 'openai';
import { adminDb } from '@/lib/firebaseAdmin';
import { 
  EmbeddingRequest, 
  EmbeddingResponse, 
  VectorSearchRequest, 
  VectorSearchResult,
  KBChunk 
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLETON CLIENT
// ═══════════════════════════════════════════════════════════════════════════════

let openaiInstance: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!openaiInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required for embeddings');
    }
    openaiInstance = new OpenAI({
      apiKey,
      timeout: 60000,
      maxRetries: 3,
    });
  }
  return openaiInstance;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CACHING
// ═══════════════════════════════════════════════════════════════════════════════

interface CacheEntry {
  embedding: number[];
  timestamp: number;
}

const embeddingCache = new Map<string, CacheEntry>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function getCacheKey(text: string, model: string): string {
  // Use SHA-256 hash of full text + model to avoid collisions
  // Previously used only first 500 chars which caused different documents to collide
  const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
  return `${model}:${hash}`;
}

// Firestore batch limit
const FIRESTORE_BATCH_LIMIT = 490;

function cleanCache(): void {
  const now = Date.now();
  for (const [key, entry] of embeddingCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL) {
      embeddingCache.delete(key);
    }
  }
  // Also limit cache size
  if (embeddingCache.size > 1000) {
    const entries = Array.from(embeddingCache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp);
    // Remove oldest 200 entries
    entries.slice(0, 200).forEach(([key]) => embeddingCache.delete(key));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMBEDDING SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class EmbeddingService {
  private static instance: EmbeddingService;
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): EmbeddingService {
    if (!EmbeddingService.instance) {
      EmbeddingService.instance = new EmbeddingService();
    }
    return EmbeddingService.instance;
  }
  
  /**
   * Clear the embedding cache
   */
  clearCache(): void {
    embeddingCache.clear();
  }
  
  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string, model?: 'text-embedding-3-small' | 'text-embedding-3-large'): Promise<EmbeddingResponse> {
    return EmbeddingService.generateEmbeddingStatic({ text, model });
  }
  
  /**
   * Search for similar content using hybrid search (vector + keyword)
   */
  async searchSimilar(
    query: string,
    limit: number = 5,
    filters?: Record<string, string>
  ): Promise<import('./types').SearchResult[]> {
    const vectorResults: import('./types').SearchResult[] = [];
    const keywordResults: import('./types').SearchResult[] = [];
    
    // Try vector similarity search
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      const results = await EmbeddingService.searchSimilarStatic({
        queryEmbedding: queryEmbedding.embedding,
        limit: limit * 2,
        filters: filters ? {
          categories: filters.category ? [filters.category as any] : undefined,
          departments: filters.department ? [filters.department] : undefined,
          products: filters.product ? [filters.product] : undefined,
          pharmacies: filters.pharmacy ? [filters.pharmacy] : undefined,
        } : undefined,
      });
      
      if (results.length > 0) {
        vectorResults.push(...results.map(r => ({
          documentId: r.documentId,
          content: r.content,
          score: r.score,
          matchType: 'semantic' as const,
          metadata: r.metadata as any,
        })));
      }
    } catch (embeddingError: any) {
      console.log('[EmbeddingService] Vector search failed:', embeddingError.message);
    }
    
    // Always run keyword search for hybrid fusion
    try {
      const kwResults = await this.keywordSearch(query, limit * 2, filters);
      keywordResults.push(...kwResults);
    } catch (kwError: any) {
      console.log('[EmbeddingService] Keyword search failed:', kwError.message);
    }
    
    // If no vector results, return keyword results directly
    if (vectorResults.length === 0) {
      console.log(`[EmbeddingService] Using keyword-only results (${keywordResults.length})`);
      return keywordResults.slice(0, limit);
    }
    
    // If no keyword results, return vector results
    if (keywordResults.length === 0) {
      return vectorResults.slice(0, limit);
    }
    
    // Hybrid fusion: Reciprocal Rank Fusion (RRF)
    const k = 60;
    const fusedScores = new Map<string, { score: number; result: import('./types').SearchResult }>();
    
    vectorResults.forEach((result, rank) => {
      const key = `${result.documentId}:${result.content.substring(0, 100)}`;
      const rrfScore = 1 / (k + rank + 1);
      fusedScores.set(key, { score: rrfScore, result: { ...result, matchType: 'hybrid' as const } });
    });
    
    keywordResults.forEach((result, rank) => {
      const key = `${result.documentId}:${result.content.substring(0, 100)}`;
      const rrfScore = 1 / (k + rank + 1);
      const existing = fusedScores.get(key);
      if (existing) {
        existing.score += rrfScore; // Boost if found in both
      } else {
        fusedScores.set(key, { score: rrfScore, result: { ...result, matchType: 'hybrid' as const } });
      }
    });
    
    const fusedResults = Array.from(fusedScores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(entry => ({ ...entry.result, score: Math.min(entry.score * (k + 1), 1) }));
    
    console.log(`[EmbeddingService] Hybrid search: ${vectorResults.length} vector + ${keywordResults.length} keyword → ${fusedResults.length} fused`);
    
    return fusedResults;
  }

  /**
   * Keyword-based search fallback when embeddings aren't available
   */
  private async keywordSearch(
    query: string,
    limit: number = 5,
    filters?: Record<string, string>
  ): Promise<import('./types').SearchResult[]> {
    try {
      // Extract keywords from query
      const keywords = query.toLowerCase()
        .split(/\s+/)
        .filter(word => word.length > 2)
        .slice(0, 10);
      
      if (keywords.length === 0) return [];
      
      // Identify high-value keywords (longer words, product names, etc.)
      const highValueKeywords = keywords.filter(w => w.length >= 5);
      
      // Query chunks from Firestore (without embedding requirement)
      let queryRef = adminDb.collection('kb_chunks').limit(500);
      
      if (filters?.category) {
        queryRef = queryRef.where('category', '==', filters.category) as any;
      }
      if (filters?.department) {
        queryRef = queryRef.where('department', '==', filters.department) as any;
      }
      
      const snapshot = await queryRef.get();
      
      if (snapshot.empty) {
        console.log('[EmbeddingService] No chunks in database for keyword search');
        return [];
      }
      
      // Score chunks by keyword matches
      const results: Array<{
        documentId: string;
        content: string;
        score: number;
        metadata: any;
      }> = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        const content = (data.content || '').toLowerCase();
        const docName = (data.documentName || '').toLowerCase();
        
        // Count keyword matches with weighted scoring
        let matchScore = 0;
        let exactPhraseBonus = 0;
        let highValueMatches = 0;
        
        for (const keyword of keywords) {
          const contentMatches = (content.match(new RegExp(keyword, 'gi')) || []).length;
          const nameMatches = (docName.match(new RegExp(keyword, 'gi')) || []).length;
          matchScore += contentMatches + (nameMatches * 3); // Name matches worth more
          
          // Track high-value keyword matches (product names, medical terms)
          if (highValueKeywords.includes(keyword) && (contentMatches > 0 || nameMatches > 0)) {
            highValueMatches++;
            matchScore += 3; // Bonus for matching important terms
          }
        }
        
        // Bonus for exact phrase match
        if (content.includes(query.toLowerCase())) {
          exactPhraseBonus = 10;
        }
        
        if (matchScore > 0 || exactPhraseBonus > 0) {
          // Improved scoring normalization: 
          // - Base: match score relative to reasonable max
          // - High-value matches get significant boost
          // - Ensure score can actually reach meaningful levels
          const rawScore = matchScore + exactPhraseBonus;
          const maxExpectedScore = keywords.length * 4; // More realistic denominator
          const score = Math.min(rawScore / maxExpectedScore, 1.0);
          
          // Give extra boost if high-value keywords matched (e.g., "tirzepatide")
          const boostedScore = highValueMatches > 0 
            ? Math.min(score + 0.2, 1.0) 
            : score;
          
          results.push({
            documentId: data.documentId || doc.id,
            content: data.content || '',
            score: boostedScore,
            metadata: {
              documentName: data.documentName,
              sourcePath: data.sourcePath,
              category: data.category,
              department: data.department,
            },
          });
        }
      });
      
      // Sort by score and limit
      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, limit);
      
      console.log(`[EmbeddingService] Keyword search found ${topResults.length} results (from ${results.length} matches)`);
      if (topResults.length > 0) {
        console.log(`[EmbeddingService] Top score: ${topResults[0].score.toFixed(3)}, doc: ${topResults[0].metadata.documentName}`);
      }
      
      return topResults.map(r => ({
        documentId: r.documentId,
        content: r.content,
        score: r.score,
        matchType: 'keyword' as const,
        metadata: r.metadata,
      }));
      
    } catch (error: any) {
      console.error('[EmbeddingService] Keyword search error:', error.message);
      return [];
    }
  }
  
  /**
   * Store a chunk with embedding
   */
  async storeChunk(
    chunk: import('./types').KBChunk,
    sourcePath: string,
    title: string,
    category: import('./types').DocumentCategory,
    tags: string[]
  ): Promise<void> {
    // Generate embedding if not present
    if (!chunk.embedding) {
      const embeddingResult = await this.generateEmbedding(chunk.content);
      chunk.embedding = embeddingResult.embedding;
    }
    
    // Extract department/product/pharmacy from tags
    const department = tags.find(t => t.startsWith('department:'))?.split(':')[1];
    const product = tags.find(t => t.startsWith('product:'))?.split(':')[1];
    const pharmacy = tags.find(t => t.startsWith('pharmacy:'))?.split(':')[1];
    
    await EmbeddingService.storeChunkStatic({
      ...chunk,
      documentName: title,
      category,
      department,
      product,
      pharmacy,
    });
  }
  
  /**
   * Generate embedding for a single text (static)
   */
  static async generateEmbeddingStatic(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = request.model || 'text-embedding-3-small';
    const cacheKey = getCacheKey(request.text, model);
    
    // Check cache
    const cached = embeddingCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return {
        embedding: cached.embedding,
        model,
        tokenCount: 0, // Unknown from cache
      };
    }
    
    const openai = getOpenAI();
    
    try {
      const response = await openai.embeddings.create({
        model,
        input: request.text,
        encoding_format: 'float',
      });
      
      const embedding = response.data[0].embedding;
      const tokenCount = response.usage?.total_tokens || 0;
      
      // Cache result
      embeddingCache.set(cacheKey, {
        embedding,
        timestamp: Date.now(),
      });
      
      // Clean old cache entries periodically
      if (Math.random() < 0.1) cleanCache();
      
      return {
        embedding,
        model,
        tokenCount,
      };
    } catch (error: any) {
      console.error('[EmbeddingService] Error generating embedding:', error.message);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }
  
  /**
   * Generate embeddings for multiple texts (batched for efficiency)
   */
  static async generateEmbeddingsBatch(
    texts: string[], 
    model: 'text-embedding-3-small' | 'text-embedding-3-large' = 'text-embedding-3-small'
  ): Promise<Array<{ text: string; embedding: number[]; tokenCount: number }>> {
    const openai = getOpenAI();
    // Use a map keyed by global index to avoid alignment bugs
    const allResults = new Map<number, { text: string; embedding: number[]; tokenCount: number }>();
    
    const BATCH_SIZE = 100;
    
    for (let batchStart = 0; batchStart < texts.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, texts.length);
      const batch = texts.slice(batchStart, batchEnd);
      
      // Check cache for each item
      const needsEmbedding: { globalIndex: number; text: string }[] = [];
      
      batch.forEach((text, localIdx) => {
        const globalIndex = batchStart + localIdx;
        const cacheKey = getCacheKey(text, model);
        const cached = embeddingCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          allResults.set(globalIndex, { text, embedding: cached.embedding, tokenCount: 0 });
        } else {
          needsEmbedding.push({ globalIndex, text });
        }
      });
      
      // Generate embeddings for uncached texts
      if (needsEmbedding.length > 0) {
        try {
          const response = await openai.embeddings.create({
            model,
            input: needsEmbedding.map(item => item.text),
            encoding_format: 'float',
          });
          
          // response.data[i] corresponds to needsEmbedding[i]
          for (let i = 0; i < response.data.length; i++) {
            const item = response.data[i];
            const originalItem = needsEmbedding[i];
            const embedding = item.embedding;
            
            // Cache result
            const cacheKey = getCacheKey(originalItem.text, model);
            embeddingCache.set(cacheKey, { embedding, timestamp: Date.now() });
            
            allResults.set(originalItem.globalIndex, {
              text: originalItem.text,
              embedding,
              tokenCount: 0,
            });
          }
        } catch (error: any) {
          console.error('[EmbeddingService] Batch embedding error:', error.message);
        }
      }
    }
    
    // Return results in original order
    const results: Array<{ text: string; embedding: number[]; tokenCount: number }> = [];
    for (let i = 0; i < texts.length; i++) {
      const result = allResults.get(i);
      if (result) results.push(result);
    }
    
    return results;
  }
  
  /**
   * Calculate cosine similarity between two vectors
   */
  static cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  
  /**
   * Search for similar chunks using vector similarity
   * Uses Firestore with manual cosine similarity (for compatibility)
   */
  static async searchSimilarStatic(request: VectorSearchRequest): Promise<VectorSearchResult[]> {
    try {
      // Paginate through chunks to handle large collections
      const CHUNK_PAGE_SIZE = 500;
      const MAX_PAGES = 10; // Up to 5000 chunks
      const results: VectorSearchResult[] = [];
      let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      
      for (let page = 0; page < MAX_PAGES; page++) {
        let query: FirebaseFirestore.Query = adminDb.collection('kb_chunks');
        
        if (request.filters?.categories?.length) {
          query = query.where('category', 'in', request.filters.categories);
        }
        
        query = query.orderBy('__name__').limit(CHUNK_PAGE_SIZE);
        
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }
        
        const snapshot = await query.get();
        if (snapshot.empty) break;
        
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        snapshot.forEach(doc => {
          const data = doc.data();
          if (!data.embedding || !Array.isArray(data.embedding)) return;
          
          const score = this.cosineSimilarity(request.queryEmbedding, data.embedding);
          
          if (request.minScore && score < request.minScore) return;
          
          if (request.filters) {
            if (request.filters.departments?.length && 
                !request.filters.departments.includes(data.department)) return;
            if (request.filters.products?.length && 
                !request.filters.products.includes(data.product)) return;
            if (request.filters.pharmacies?.length && 
                !request.filters.pharmacies.includes(data.pharmacy)) return;
          }
          
          results.push({
            chunkId: doc.id,
            documentId: data.documentId,
            score,
            content: data.content,
            metadata: {
              startIndex: data.startIndex || 0,
              endIndex: data.endIndex || 0,
              pageNumber: data.pageNumber,
              sectionTitle: data.sectionTitle,
              isHeader: data.isHeader || false,
              isTable: data.isTable || false,
              isCode: data.isCode || false,
            },
          });
        });
        
        if (snapshot.size < CHUNK_PAGE_SIZE) break;
      }
      
      if (results.length === 0) {
        console.log('[EmbeddingService] No matching chunks found in vector search');
        return [];
      }
      
      results.sort((a, b) => b.score - a.score);
      console.log(`[EmbeddingService] Vector search: ${results.length} candidates, top score: ${results[0]?.score.toFixed(3)}`);
      return results.slice(0, request.limit);
      
    } catch (error: any) {
      console.error('[EmbeddingService] Search error:', error.message);
      return [];
    }
  }
  
  /**
   * Store chunk with embedding in Firestore
   */
  static async storeChunkStatic(chunk: KBChunk & { 
    documentId: string; 
    documentName: string;
    category?: string;
    department?: string;
    product?: string;
    pharmacy?: string;
  }): Promise<void> {
    try {
      await adminDb.collection('kb_chunks').doc(chunk.id).set({
        documentId: chunk.documentId,
        documentName: chunk.documentName,
        content: chunk.content,
        embedding: chunk.embedding,
        tokenCount: chunk.tokenCount,
        category: chunk.category || 'general',
        department: chunk.department,
        product: chunk.product,
        pharmacy: chunk.pharmacy,
        startIndex: chunk.metadata.startIndex,
        endIndex: chunk.metadata.endIndex,
        pageNumber: chunk.metadata.pageNumber,
        sectionTitle: chunk.metadata.sectionTitle,
        isHeader: chunk.metadata.isHeader,
        isTable: chunk.metadata.isTable,
        isCode: chunk.metadata.isCode,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error: any) {
      console.error('[EmbeddingService] Store chunk error:', error.message);
      throw error;
    }
  }
  
  /**
   * Delete all chunks for a document
   */
  static async deleteDocumentChunks(documentId: string): Promise<number> {
    try {
      const snapshot = await adminDb.collection('kb_chunks')
        .where('documentId', '==', documentId)
        .get();
      
      if (snapshot.empty) return 0;
      
      // Fixed: chunk deletes into batches of <500 to avoid Firestore limit
      const docs = snapshot.docs;
      let deleted = 0;
      
      for (let i = 0; i < docs.length; i += FIRESTORE_BATCH_LIMIT) {
        const batchDocs = docs.slice(i, i + FIRESTORE_BATCH_LIMIT);
        const batch = adminDb.batch();
        batchDocs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        deleted += batchDocs.length;
      }
      
      return deleted;
    } catch (error: any) {
      console.error('[EmbeddingService] Delete chunks error:', error.message);
      return 0;
    }
  }
  
  /**
   * Get stats about stored embeddings
   */
  static async getStats(): Promise<{
    totalChunks: number;
    totalDocuments: number;
    avgChunksPerDoc: number;
  }> {
    try {
      const chunksSnapshot = await adminDb.collection('kb_chunks').count().get();
      const totalChunks = chunksSnapshot.data().count;
      
      // Get unique document count
      const uniqueDocs = new Set<string>();
      const docsSnapshot = await adminDb.collection('kb_chunks')
        .select('documentId')
        .limit(5000)
        .get();
      
      docsSnapshot.forEach(doc => uniqueDocs.add(doc.data().documentId));
      
      const totalDocuments = uniqueDocs.size;
      const avgChunksPerDoc = totalDocuments > 0 ? totalChunks / totalDocuments : 0;
      
      return {
        totalChunks,
        totalDocuments,
        avgChunksPerDoc: Math.round(avgChunksPerDoc * 10) / 10,
      };
    } catch (error: any) {
      console.error('[EmbeddingService] Stats error:', error.message);
      return { totalChunks: 0, totalDocuments: 0, avgChunksPerDoc: 0 };
    }
  }
}

export default EmbeddingService;
