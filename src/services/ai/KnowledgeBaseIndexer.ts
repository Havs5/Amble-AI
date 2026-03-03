/**
 * KnowledgeBaseIndexer - Pre-indexes Google Drive files for instant search
 * 
 * Architecture:
 * 1. INDEXING PHASE (on Drive connect): 
 *    - Crawl all files in the KB folder
 *    - Extract content from Google Docs, Sheets, text files
 *    - Store in IndexedDB for fast local search
 * 
 * 2. SEARCH PHASE (instant):
 *    - Search the pre-indexed content locally
 *    - No API calls needed at query time
 *    - Sub-100ms response times
 * 
 * 3. REFRESH (background):
 *    - Periodic re-indexing (every hour or on-demand)
 *    - Incremental updates when possible
 */

// IndexedDB database name
const DB_NAME = 'amble_knowledge_base';
const DB_VERSION = 1;
const STORE_NAME = 'documents';
const META_STORE = 'metadata';

// Types
export interface IndexedDocument {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  content: string;
  keywords: string[];
  department?: string;
  indexedAt: number;
  size: number;
}

export interface KBIndex {
  documents: IndexedDocument[];
  totalSize: number;
  lastIndexed: number;
  rootFolderId: string;
}

export interface SearchHit {
  document: IndexedDocument;
  score: number;
  matchedTerms: string[];
  snippet: string;
  // Convenience accessors
  fileId: string;
  fileName: string;
  department?: string;
}

// Department keywords for auto-categorization
const DEPARTMENT_KEYWORDS: Record<string, string[]> = {
  billing: ['billing', 'invoice', 'payment', 'charge', 'refund', 'credit', 'fee', 'price', 'cost'],
  disputes: ['dispute', 'chargeback', 'complaint', 'escalation', 'resolution', 'appeal'],
  customerCare: ['customer', 'support', 'help', 'service', 'care', 'inquiry'],
  sales: ['sales', 'order', 'subscription', 'promotion', 'discount', 'quote'],
  shipping: ['shipping', 'delivery', 'tracking', 'shipment', 'package', 'courier'],
  compliance: ['compliance', 'regulation', 'hipaa', 'legal', 'policy', 'audit'],
  products: ['tirzepatide', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'glp-1', 'medication'],
};

// Google Drive API base
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

export class KnowledgeBaseIndexer {
  private db: IDBDatabase | null = null;
  private userId: string;
  
  constructor(userId: string) {
    this.userId = userId;
  }
  
  /**
   * Initialize IndexedDB
   */
  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(`${DB_NAME}_${this.userId}`, DB_VERSION);
      
      request.onerror = () => reject(request.error);
      
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Documents store with indexes
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
          store.createIndex('department', 'department', { unique: false });
          store.createIndex('path', 'path', { unique: false });
        }
        
        // Metadata store
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
    });
  }
  
  /**
   * Get cached index metadata
   */
  async getIndexMeta(): Promise<{ lastIndexed: number; documentCount: number; rootFolderId: string } | null> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const request = store.get('index_meta');
      
      request.onsuccess = () => resolve(request.result?.value || null);
      request.onerror = () => resolve(null);
    });
  }
  
  /**
   * Check if index is fresh (less than 1 hour old)
   */
  async isIndexFresh(rootFolderId: string): Promise<boolean> {
    const meta = await this.getIndexMeta();
    if (!meta) return false;
    
    const ONE_HOUR = 60 * 60 * 1000;
    const isFresh = (Date.now() - meta.lastIndexed) < ONE_HOUR;
    const sameFolder = meta.rootFolderId === rootFolderId;
    
    return isFresh && sameFolder;
  }
  
  /**
   * Get the last indexed timestamp
   */
  async getLastIndexedTime(): Promise<number | null> {
    const meta = await this.getIndexMeta();
    return meta?.lastIndexed || null;
  }
  
  /**
   * MAIN: Index all files from Google Drive
   * Call this when Drive connects or user requests refresh
   */
  async indexDrive(
    accessToken: string,
    rootFolderId: string,
    onProgress?: (progress: { current: number; total: number; fileName: string }) => void
  ): Promise<{ success: boolean; documentCount: number; errors: string[] }> {
    if (!this.db) await this.init();
    
    const startTime = Date.now();
    const errors: string[] = [];
    let indexed = 0;
    
    console.log('[KB Indexer] Starting indexing of folder:', rootFolderId);
    
    try {
      // 1. List all files recursively
      const allFiles = await this.listAllFiles(accessToken, rootFolderId);
      console.log('[KB Indexer] Found', allFiles.length, 'files to index');
      
      // 2. Filter to indexable file types
      const indexableFiles = allFiles.filter(f => this.isIndexable(f.mimeType));
      console.log('[KB Indexer] Indexable files:', indexableFiles.length);
      
      // 3. Clear old index
      await this.clearIndex();
      
      // 4. Index each file (with parallel batching for speed)
      const BATCH_SIZE = 5; // Process 5 files at a time
      
      for (let i = 0; i < indexableFiles.length; i += BATCH_SIZE) {
        const batch = indexableFiles.slice(i, i + BATCH_SIZE);
        
        const results = await Promise.allSettled(
          batch.map(async (file) => {
            try {
              onProgress?.({ current: indexed + 1, total: indexableFiles.length, fileName: file.name });
              
              const content = await this.extractContent(accessToken, file.id, file.mimeType);
              
              if (content) {
                const doc = this.createDocument(file, content);
                await this.saveDocument(doc);
                indexed++;
                return true;
              }
              return false;
            } catch (e: any) {
              errors.push(`${file.name}: ${e.message}`);
              return false;
            }
          })
        );
      }
      
      // 5. Save metadata
      await this.saveIndexMeta(rootFolderId, indexed);
      
      const duration = Date.now() - startTime;
      console.log(`[KB Indexer] ✅ Indexed ${indexed} documents in ${duration}ms`);
      
      return { success: true, documentCount: indexed, errors };
      
    } catch (error: any) {
      console.error('[KB Indexer] Indexing failed:', error);
      return { success: false, documentCount: indexed, errors: [error.message] };
    }
  }
  
  /**
   * List all files recursively from a folder
   */
  private async listAllFiles(
    accessToken: string,
    folderId: string,
    path: string = ''
  ): Promise<Array<{ id: string; name: string; mimeType: string; path: string }>> {
    const files: Array<{ id: string; name: string; mimeType: string; path: string }> = [];
    
    try {
      let pageToken: string | undefined;
      
      do {
        const url = new URL(`${DRIVE_API}/files`);
        url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
        url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType)');
        url.searchParams.set('pageSize', '100');
        if (pageToken) url.searchParams.set('pageToken', pageToken);
        
        const response = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        
        if (!response.ok) throw new Error(`Drive API error: ${response.status}`);
        
        const data = await response.json();
        
        for (const file of data.files || []) {
          const filePath = path ? `${path}/${file.name}` : file.name;
          
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            // Recurse into subfolders (limit depth to 4 levels)
            if (path.split('/').length < 4) {
              const subFiles = await this.listAllFiles(accessToken, file.id, filePath);
              files.push(...subFiles);
            }
          } else {
            files.push({ ...file, path: filePath });
          }
        }
        
        pageToken = data.nextPageToken;
      } while (pageToken);
      
    } catch (error) {
      console.error('[KB Indexer] Error listing files:', error);
    }
    
    return files;
  }
  
  /**
   * Check if a file type can be indexed
   */
  private isIndexable(mimeType: string): boolean {
    const indexableTypes = [
      'application/vnd.google-apps.document',
      'application/vnd.google-apps.spreadsheet',
      'text/plain',
      'text/csv',
      'text/markdown',
      'text/html',
      'application/json',
    ];
    
    return indexableTypes.includes(mimeType) || mimeType.startsWith('text/');
  }
  
  /**
   * Extract content from a file
   */
  private async extractContent(accessToken: string, fileId: string, mimeType: string): Promise<string | null> {
    try {
      let url: string;
      
      if (mimeType === 'application/vnd.google-apps.document') {
        url = `${DRIVE_API}/files/${fileId}/export?mimeType=text/plain`;
      } else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
        url = `${DRIVE_API}/files/${fileId}/export?mimeType=text/csv`;
      } else {
        url = `${DRIVE_API}/files/${fileId}?alt=media`;
      }
      
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (!response.ok) return null;
      
      const text = await response.text();
      
      // Limit content size (max 50KB per file for indexing)
      return text.length > 50000 ? text.substring(0, 50000) : text;
      
    } catch (error) {
      console.error('[KB Indexer] Error extracting content:', error);
      return null;
    }
  }
  
  /**
   * Create an indexed document from file data
   */
  private createDocument(
    file: { id: string; name: string; mimeType: string; path: string },
    content: string
  ): IndexedDocument {
    // Extract keywords from name and content
    const textForKeywords = `${file.name} ${file.path} ${content}`.toLowerCase();
    const words = textForKeywords.split(/\s+/).filter(w => w.length > 3);
    const keywords = [...new Set(words)].slice(0, 100); // Top 100 unique words
    
    // Detect department
    let department: string | undefined;
    for (const [dept, deptKeywords] of Object.entries(DEPARTMENT_KEYWORDS)) {
      if (deptKeywords.some(kw => textForKeywords.includes(kw))) {
        department = dept;
        break;
      }
    }
    
    return {
      id: file.id,
      name: file.name,
      path: file.path,
      mimeType: file.mimeType,
      content,
      keywords,
      department,
      indexedAt: Date.now(),
      size: content.length,
    };
  }
  
  /**
   * Save document to IndexedDB
   */
  private async saveDocument(doc: IndexedDocument): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(doc);
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Clear all indexed documents
   */
  private async clearIndex(): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Save index metadata
   */
  private async saveIndexMeta(rootFolderId: string, documentCount: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      const request = store.put({
        key: 'index_meta',
        value: {
          lastIndexed: Date.now(),
          documentCount,
          rootFolderId,
        }
      });
      
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * FAST SEARCH: Search the pre-indexed content
   * This is instant - no API calls!
   */
  async search(query: string, maxResults: number = 5): Promise<SearchHit[]> {
    if (!this.db) await this.init();
    
    const startTime = Date.now();
    const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    
    if (queryTerms.length === 0) return [];
    
    // Get all documents
    const documents = await this.getAllDocuments();
    
    // Score each document
    const scored: SearchHit[] = [];
    
    for (const doc of documents) {
      const score = this.scoreDocument(doc, queryTerms);
      
      if (score > 0) {
        const matchedTerms = queryTerms.filter(term => 
          doc.content.toLowerCase().includes(term) || 
          doc.name.toLowerCase().includes(term)
        );
        
        const snippet = this.extractSnippet(doc.content, queryTerms);
        
        scored.push({ 
          document: doc, 
          score, 
          matchedTerms, 
          snippet,
          // Convenience accessors for SearchOrchestrator
          fileId: doc.id,
          fileName: doc.name,
          department: doc.department,
        });
      }
    }
    
    // Sort by score and return top results
    scored.sort((a, b) => b.score - a.score);
    
    const duration = Date.now() - startTime;
    console.log(`[KB Search] Found ${scored.length} results in ${duration}ms`);
    
    return scored.slice(0, maxResults);
  }
  
  /**
   * Get all indexed documents
   */
  private async getAllDocuments(): Promise<IndexedDocument[]> {
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * Score a document based on query terms
   */
  private scoreDocument(doc: IndexedDocument, queryTerms: string[]): number {
    let score = 0;
    const contentLower = doc.content.toLowerCase();
    const nameLower = doc.name.toLowerCase();
    const pathLower = doc.path.toLowerCase();
    
    for (const term of queryTerms) {
      // High score for name match
      if (nameLower.includes(term)) score += 50;
      
      // Medium score for path match
      if (pathLower.includes(term)) score += 25;
      
      // Score based on content occurrences (max 10 per term)
      const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
      score += Math.min(occurrences * 5, 50);
      
      // Boost for exact phrase match
      if (contentLower.includes(queryTerms.join(' '))) score += 100;
    }
    
    // Boost for department match
    if (doc.department) {
      const deptKeywords = DEPARTMENT_KEYWORDS[doc.department] || [];
      if (deptKeywords.some(kw => queryTerms.some(qt => qt.includes(kw) || kw.includes(qt)))) {
        score += 30;
      }
    }
    
    return score;
  }
  
  /**
   * Extract a relevant snippet from content
   */
  private extractSnippet(content: string, queryTerms: string[], maxLength: number = 500): string {
    const contentLower = content.toLowerCase();
    
    // Find the first occurrence of any query term
    let bestIndex = -1;
    for (const term of queryTerms) {
      const idx = contentLower.indexOf(term);
      if (idx !== -1 && (bestIndex === -1 || idx < bestIndex)) {
        bestIndex = idx;
      }
    }
    
    if (bestIndex === -1) {
      // No match found, return start of content
      return content.substring(0, maxLength) + (content.length > maxLength ? '...' : '');
    }
    
    // Extract snippet around the match
    const start = Math.max(0, bestIndex - 100);
    const end = Math.min(content.length, bestIndex + maxLength - 100);
    
    let snippet = content.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < content.length) snippet = snippet + '...';
    
    return snippet;
  }
  
  /**
   * Get document count
   */
  async getDocumentCount(): Promise<number> {
    if (!this.db) await this.init();
    
    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(0);
    });
  }
  
  /**
   * Build context prompt from search hits
   */
  buildContextPrompt(hits: SearchHit[], query: string): string {
    if (hits.length === 0) return '';
    
    let prompt = `
═══════════════════════════════════════════════════════════════
📚 AMBLE KNOWLEDGE BASE - AUTHORITATIVE SOURCE
═══════════════════════════════════════════════════════════════

The following documents from the company's Knowledge Base match your query.
⚠️ USE THIS INFORMATION AS YOUR PRIMARY SOURCE.

`;
    
    for (const hit of hits) {
      prompt += `\n📄 **${hit.document.name}**\n`;
      prompt += `   📁 ${hit.document.path}\n`;
      if (hit.document.department) {
        prompt += `   🏷️ Department: ${hit.document.department}\n`;
      }
      prompt += `   🔍 Matched: ${hit.matchedTerms.join(', ')}\n`;
      prompt += `\n${hit.document.content}\n`;
      prompt += `\n---\n`;
    }
    
    prompt += `
═══════════════════════════════════════════════════════════════
INSTRUCTIONS:
1. BASE YOUR RESPONSE on the document content above
2. CITE the document name when referencing specific information
3. If documents don't fully answer, indicate what's missing
═══════════════════════════════════════════════════════════════
`;
    
    return prompt;
  }
}

// Singleton instance
let indexerInstance: KnowledgeBaseIndexer | null = null;

export function getKBIndexer(userId: string): KnowledgeBaseIndexer {
  if (!indexerInstance || (indexerInstance as any).userId !== userId) {
    indexerInstance = new KnowledgeBaseIndexer(userId);
  }
  return indexerInstance;
}
