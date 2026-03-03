/**
 * Knowledge Base Manager
 * 
 * Central orchestrator for the KB system. Provides a unified API for:
 * - Searching the knowledge base
 * - Managing document sync
 * - Monitoring KB health
 */

import { 
  KBDocument, 
  SearchResult, 
  DocumentCategory,
  RAGContext
} from './types';
import { EmbeddingService } from './EmbeddingService';
import { DriveSync } from './DriveSync';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DOCUMENTS_COLLECTION = 'kb_documents';
const DEFAULT_SEARCH_LIMIT = 5;
const MIN_RELEVANCE_SCORE = parseFloat(process.env.KB_MIN_RELEVANCE_SCORE || '0.3');
const FIRESTORE_BATCH_LIMIT = 490;

// ═══════════════════════════════════════════════════════════════════════════════
// KNOWLEDGE BASE MANAGER
// ═══════════════════════════════════════════════════════════════════════════════

export class KnowledgeBaseManager {
  private static instance: KnowledgeBaseManager;
  private embeddingService: EmbeddingService;
  private driveSync: DriveSync;
  private db: FirebaseFirestore.Firestore;
  
  private constructor() {
    this.embeddingService = EmbeddingService.getInstance();
    this.driveSync = new DriveSync();
    this.db = getFirestore();
  }
  
  /**
   * Get singleton instance
   */
  static getInstance(): KnowledgeBaseManager {
    if (!this.instance) {
      this.instance = new KnowledgeBaseManager();
    }
    return this.instance;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // SEARCH OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Search the knowledge base
   */
  async search(
    query: string,
    options: {
      limit?: number;
      category?: DocumentCategory;
      department?: string;
      pharmacy?: string;
      product?: string;
      minScore?: number;
    } = {}
  ): Promise<SearchResult[]> {
    const {
      limit = DEFAULT_SEARCH_LIMIT,
      category,
      department,
      pharmacy,
      product,
      minScore = MIN_RELEVANCE_SCORE,
    } = options;
    
    console.log(`[KBManager] Searching: "${query.substring(0, 100)}..."`);
    
    try {
      // Build filters for embedding search
      const filters: Record<string, string> = {};
      if (category) filters.category = category;
      if (department) filters.department = department;
      if (pharmacy) filters.pharmacy = pharmacy;
      if (product) filters.product = product;
      
      // Search using embeddings
      const searchLimit = limit * 3; // Get more results to filter
      const results = await this.embeddingService.searchSimilar(
        query,
        searchLimit,
        Object.keys(filters).length > 0 ? filters : undefined
      );
      
      // Filter by minimum score
      const filteredResults = results.filter(r => r.score >= minScore);
      
      // Keep top N chunks per document (not just best) for richer context
      const MAX_CHUNKS_PER_DOC = 3;
      const documentChunkCounts = new Map<string, number>();
      const dedupedResults: SearchResult[] = [];
      
      for (const result of filteredResults) {
        const docId = result.documentId;
        const count = documentChunkCounts.get(docId) || 0;
        
        if (count < MAX_CHUNKS_PER_DOC) {
          dedupedResults.push(result);
          documentChunkCounts.set(docId, count + 1);
        }
      }
      
      // Sort by score and limit
      const topResults = dedupedResults
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      
      // Enrich with document metadata
      const enrichedResults = await Promise.all(
        topResults.map(async (result) => {
          const doc = await this.getDocument(result.documentId);
          if (doc) {
            return {
              ...result,
              documentTitle: doc.title,
              sourcePath: doc.sourcePath,
              metadata: doc.metadata,
            };
          }
          return result;
        })
      );
      
      console.log(`[KBManager] Found ${enrichedResults.length} results`);
      
      return enrichedResults;
      
    } catch (error: any) {
      console.error('[KBManager] Search error:', error.message);
      return [];
    }
  }
  
  /**
   * Check if a query is likely answerable from the KB
   */
  async canAnswerFromKB(query: string): Promise<{
    likely: boolean;
    confidence: number;
    topResult?: SearchResult;
  }> {
    const results = await this.search(query, { limit: 1 });
    
    if (results.length === 0) {
      return { likely: false, confidence: 0 };
    }
    
    const topResult = results[0];
    const confidence = topResult.score;
    
    // Moderate threshold - 0.5 is enough given hybrid search quality
    const likely = confidence >= 0.5;
    
    return {
      likely,
      confidence,
      topResult: likely ? topResult : undefined,
    };
  }
  
  /**
   * Build RAG context from search results
   */
  buildRAGContext(
    results: SearchResult[],
    maxTokens: number = 3000
  ): RAGContext {
    const contexts: string[] = [];
    const sources: string[] = [];
    let totalTokens = 0;
    
    for (const result of results) {
      const chunkTokens = Math.ceil(result.content.length / 4);
      
      if (totalTokens + chunkTokens > maxTokens) {
        break;
      }
      
      // Format context block
      const sourceName = result.documentTitle || result.sourcePath || 'Unknown';
      const contextBlock = `
[Source: ${sourceName}]
${result.content}
---
`.trim();
      
      contexts.push(contextBlock);
      sources.push(sourceName);
      totalTokens += chunkTokens;
    }
    
    return {
      relevantChunks: results,
      context: contexts.join('\n\n'),
      sources: [...new Set(sources)],
      totalTokens,
      searchQuery: '',
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // DOCUMENT OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<KBDocument | null> {
    try {
      const doc = await this.db.collection(DOCUMENTS_COLLECTION).doc(id).get();
      return doc.exists ? (doc.data() as KBDocument) : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Get all documents
   */
  async getAllDocuments(options: {
    category?: DocumentCategory;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    documents: KBDocument[];
    total: number;
  }> {
    const { category, limit = 50, offset = 0 } = options;
    
    try {
      let query = this.db.collection(DOCUMENTS_COLLECTION) as FirebaseFirestore.Query;
      
      if (category) {
        query = query.where('category', '==', category);
      }
      
      query = query.orderBy('updatedAt', 'desc');
      
      // Get total count first
      const totalSnapshot = await query.count().get();
      const total = totalSnapshot.data().count;
      
      // Cursor-based pagination: skip using startAfter if offset > 0
      if (offset > 0) {
        const skipSnapshot = await query.limit(offset).get();
        if (!skipSnapshot.empty) {
          const lastVisible = skipSnapshot.docs[skipSnapshot.docs.length - 1];
          query = query.startAfter(lastVisible);
        }
      }
      query = query.limit(limit);
      
      const snapshot = await query.get();
      const documents = snapshot.docs.map(doc => doc.data() as KBDocument);
      
      return { documents, total };
      
    } catch (error: any) {
      console.error('[KBManager] Failed to get documents:', error.message);
      return { documents: [], total: 0 };
    }
  }
  
  /**
   * Delete a document and its chunks
   */
  async deleteDocument(id: string): Promise<boolean> {
    try {
      // Delete document
      await this.db.collection(DOCUMENTS_COLLECTION).doc(id).delete();
      
      // Delete associated chunks (in batches to avoid >500 limit)
      const chunksQuery = this.db
        .collection('kb_chunks')
        .where('documentId', '==', id);
      
      const chunks = await chunksQuery.get();
      const chunkDocs = chunks.docs;
      
      for (let i = 0; i < chunkDocs.length; i += FIRESTORE_BATCH_LIMIT) {
        const batch = this.db.batch();
        const slice = chunkDocs.slice(i, i + FIRESTORE_BATCH_LIMIT);
        slice.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      
      console.log(`[KBManager] Deleted document ${id} and ${chunks.size} chunks`);
      
      return true;
    } catch (error: any) {
      console.error('[KBManager] Delete error:', error.message);
      return false;
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // SYNC OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Trigger a manual sync
   */
  async triggerSync(options: {
    force?: boolean;
    progressCallback?: (progress: { current: number; total: number; message: string }) => void;
  } = {}): Promise<{
    success: boolean;
    documentsProcessed: number;
    chunksCreated: number;
    errors: string[];
  }> {
    return this.driveSync.syncFolder(options);
  }
  
  /**
   * Get sync status
   */
  async getSyncStatus(): Promise<{
    configured: boolean;
    rootFolderId: string | null;
    lastSync: Date | null;
    status: 'idle' | 'syncing' | 'error' | 'completed';
    documentsCount: number;
    chunksCount: number;
    errors?: string[];
  }> {
    return this.driveSync.getStatus();
  }
  
  /**
   * Clear all KB data and resync
   */
  async rebuildKnowledgeBase(): Promise<{
    success: boolean;
    documentsProcessed: number;
    chunksCreated: number;
    errors: string[];
  }> {
    console.log('[KBManager] Rebuilding knowledge base...');
    
    // Clear all data
    await this.driveSync.clearAllData();
    
    // Trigger fresh sync
    return this.triggerSync({ force: true });
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // HEALTH & STATS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Get KB statistics
   */
  async getStats(): Promise<{
    totalDocuments: number;
    totalChunks: number;
    byCategory: Record<string, number>;
    byDepartment: Record<string, number>;
    lastUpdated: Date | null;
    avgChunksPerDocument: number;
  }> {
    try {
      const docsSnapshot = await this.db.collection(DOCUMENTS_COLLECTION).get();
      const chunksCount = await this.db.collection('kb_chunks').count().get();
      
      const totalDocuments = docsSnapshot.size;
      const totalChunks = chunksCount.data().count;
      
      const byCategory: Record<string, number> = {};
      const byDepartment: Record<string, number> = {};
      let latestUpdate: Date | null = null;
      
      docsSnapshot.docs.forEach(doc => {
        const data = doc.data() as KBDocument;
        
        // Count by category
        const cat = data.category || 'general';
        byCategory[cat] = (byCategory[cat] || 0) + 1;
        
        // Count by department
        const dept = data.metadata?.department || 'unknown';
        byDepartment[dept] = (byDepartment[dept] || 0) + 1;
        
        // Track latest update
        const updated = data.updatedAt?.toDate?.();
        if (updated && (!latestUpdate || updated > latestUpdate)) {
          latestUpdate = updated;
        }
      });
      
      return {
        totalDocuments,
        totalChunks,
        byCategory,
        byDepartment,
        lastUpdated: latestUpdate,
        avgChunksPerDocument: totalDocuments > 0 
          ? Math.round(totalChunks / totalDocuments * 10) / 10 
          : 0,
      };
      
    } catch (error: any) {
      console.error('[KBManager] Failed to get stats:', error.message);
      return {
        totalDocuments: 0,
        totalChunks: 0,
        byCategory: {},
        byDepartment: {},
        lastUpdated: null,
        avgChunksPerDocument: 0,
      };
    }
  }
  
  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    
    // Check configuration
    const syncStatus = await this.getSyncStatus();
    if (!syncStatus.configured) {
      issues.push('Google Drive folder not configured (NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID)');
    }
    
    // Check embeddings availability (use a lightweight test, don't pay for embedding)
    try {
      if (!process.env.OPENAI_API_KEY) {
        issues.push('OPENAI_API_KEY not configured for embeddings');
      }
    } catch (error: any) {
      issues.push(`Embedding service error: ${error.message}`);
    }
    
    // Check for documents
    if (syncStatus.documentsCount === 0) {
      issues.push('No documents in knowledge base. Run sync to populate.');
    }
    
    // Check for stale data
    if (syncStatus.lastSync) {
      const hoursSinceSync = (Date.now() - syncStatus.lastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync > 24) {
        issues.push(`Knowledge base not synced in ${Math.round(hoursSinceSync)} hours`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues,
    };
  }
}

export default KnowledgeBaseManager;
