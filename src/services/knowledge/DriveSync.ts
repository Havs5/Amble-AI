/**
 * Google Drive Sync Service
 * 
 * Handles synchronization of documents from Google Drive to the Knowledge Base.
 * Supports nested folder traversal, change tracking, and incremental syncs.
 */

import { google, drive_v3 } from 'googleapis';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { 
  KBDocument, 
  DriveSyncState, 
  SupportedMimeType,
  isSupportedMimeType,
  GOOGLE_EXPORT_TYPES
} from './types';
import { DocumentProcessor } from './DocumentProcessor';
import { EmbeddingService } from './EmbeddingService';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const MAX_RESULTS_PER_PAGE = 100;
const SYNC_BATCH_SIZE = 10;
const SYNC_STATE_COLLECTION = 'kb_sync_state';
const DOCUMENTS_COLLECTION = 'kb_documents';
const FIRESTORE_BATCH_LIMIT = 490;
const MAX_RETRIES = 3;
const FOLDER_CONCURRENCY = 3;

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVE SYNC SERVICE
// ═══════════════════════════════════════════════════════════════════════════════

export class DriveSync {
  private drive: drive_v3.Drive | null = null;
  private db: FirebaseFirestore.Firestore;
  private rootFolderId: string;
  private syncInProgress = false;
  
  constructor(
    rootFolderId?: string,
    private maxDocuments: number = 500
  ) {
    // Use non-public env var first, fall back to public one
    this.rootFolderId = rootFolderId 
      || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID 
      || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID 
      || '';
    this.db = getFirestore();
    
    if (!this.rootFolderId) {
      console.warn('[DriveSync] No root folder ID configured.');
    }
  }
  
  /**
   * Retry wrapper with exponential backoff for Drive API calls
   */
  private async withRetry<T>(fn: () => Promise<T>, context: string, retries = MAX_RETRIES): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const isRetryable = error.code === 429 || error.code === 503 || error.code === 500 
          || error.message?.includes('ECONNRESET') || error.message?.includes('rate limit');
        
        if (attempt === retries || !isRetryable) {
          throw error;
        }
        
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        console.warn(`[DriveSync] ${context} failed (attempt ${attempt}/${retries}), retrying in ${delay}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Unreachable');
  }
  
  /**
   * Initialize Google Drive client with service account
   */
  private async initDriveClient(): Promise<drive_v3.Drive> {
    if (this.drive) return this.drive;
    
    try {
      // Option 1: Use service account credentials from environment
      const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      
      if (credentials) {
        const serviceAccount = JSON.parse(credentials);
        const auth = new google.auth.GoogleAuth({
          credentials: serviceAccount,
          scopes: DRIVE_SCOPES,
        });
        
        this.drive = google.drive({ version: 'v3', auth });
        console.log('[DriveSync] Initialized with service account');
        return this.drive;
      }
      
      // Option 2: Use Application Default Credentials (Firebase Functions)
      const auth = new google.auth.GoogleAuth({
        scopes: DRIVE_SCOPES,
      });
      
      this.drive = google.drive({ version: 'v3', auth });
      console.log('[DriveSync] Initialized with ADC');
      return this.drive;
      
    } catch (error: any) {
      console.error('[DriveSync] Failed to initialize Drive client:', error.message);
      throw new Error('Failed to initialize Google Drive client');
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // SYNC OPERATIONS
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Perform a full sync of the configured Drive folder
   */
  async syncFolder(options: {
    force?: boolean;
    progressCallback?: (progress: { current: number; total: number; message: string }) => void;
  } = {}): Promise<{
    success: boolean;
    documentsProcessed: number;
    chunksCreated: number;
    errors: string[];
  }> {
    if (this.syncInProgress) {
      return {
        success: false,
        documentsProcessed: 0,
        chunksCreated: 0,
        errors: ['Sync already in progress'],
      };
    }
    
    if (!this.rootFolderId) {
      return {
        success: false,
        documentsProcessed: 0,
        chunksCreated: 0,
        errors: ['No root folder ID configured'],
      };
    }
    
    this.syncInProgress = true;
    const errors: string[] = [];
    let documentsProcessed = 0;
    let chunksCreated = 0;
    
    try {
      const drive = await this.initDriveClient();
      
      // Get current sync state
      const syncState = await this.getSyncState();
      const lastSyncTime = options.force ? null : syncState?.lastSyncTime;
      
      console.log(`[DriveSync] Starting sync from folder ${this.rootFolderId}`);
      console.log(`[DriveSync] Last sync: ${lastSyncTime?.toDate() || 'never'}`);
      
      // Update sync state to running
      await this.updateSyncState({
        status: 'syncing',
        syncStartedAt: FieldValue.serverTimestamp() as any,
        currentOperation: 'Scanning folders',
      });
      
      // List all files in the folder tree
      const files = await this.listAllFiles(drive, this.rootFolderId, '', lastSyncTime);
      const totalFiles = Math.min(files.length, this.maxDocuments);
      
      console.log(`[DriveSync] Found ${files.length} files to process`);
      
      options.progressCallback?.({
        current: 0,
        total: totalFiles,
        message: `Processing ${totalFiles} documents...`,
      });
      
      // Process files in batches
      for (let i = 0; i < totalFiles; i += SYNC_BATCH_SIZE) {
        const batch = files.slice(i, Math.min(i + SYNC_BATCH_SIZE, totalFiles));
        
        const results = await Promise.allSettled(
          batch.map(file => this.processFile(drive, file))
        );
        
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            documentsProcessed++;
            chunksCreated += result.value.chunksCreated;
          } else if (result.status === 'rejected') {
            errors.push(result.reason?.message || 'Unknown error');
          }
        }
        
        options.progressCallback?.({
          current: Math.min(i + SYNC_BATCH_SIZE, totalFiles),
          total: totalFiles,
          message: `Processed ${documentsProcessed} documents...`,
        });
        
        // Update sync state
        await this.updateSyncState({
          documentsProcessed,
          currentOperation: `Processing ${Math.min(i + SYNC_BATCH_SIZE, totalFiles)}/${totalFiles}`,
        });
      }
      
      // Update final sync state
      await this.updateSyncState({
        status: 'completed',
        lastSyncTime: FieldValue.serverTimestamp() as any,
        documentsProcessed,
        totalChunks: chunksCreated,
        lastSyncDuration: Date.now() - (new Date(syncState?.syncStartedAt?.toDate() || Date.now())).getTime(),
        errors: errors.length > 0 ? errors : undefined,
        currentOperation: undefined,
        syncStartedAt: undefined,
      });
      
      console.log(`[DriveSync] Sync complete: ${documentsProcessed} docs, ${chunksCreated} chunks`);
      
      return {
        success: errors.length === 0,
        documentsProcessed,
        chunksCreated,
        errors,
      };
      
    } catch (error: any) {
      console.error('[DriveSync] Sync failed:', error);
      
      await this.updateSyncState({
        status: 'error',
        errors: [error.message],
        currentOperation: undefined,
      });
      
      return {
        success: false,
        documentsProcessed,
        chunksCreated,
        errors: [error.message, ...errors],
      };
    } finally {
      this.syncInProgress = false;
    }
  }
  
  /**
   * List all files recursively in a folder
   */
  private async listAllFiles(
    drive: drive_v3.Drive,
    folderId: string,
    currentPath: string,
    modifiedAfter?: FirebaseFirestore.Timestamp | null
  ): Promise<Array<{
    id: string;
    name: string;
    mimeType: string;
    path: string;
    modifiedTime: string;
    size?: string;
  }>> {
    const allFiles: Array<{
      id: string;
      name: string;
      mimeType: string;
      path: string;
      modifiedTime: string;
      size?: string;
    }> = [];
    
    let pageToken: string | undefined;
    
    do {
      // Build query
      let query = `'${folderId}' in parents and trashed = false`;
      if (modifiedAfter) {
        query += ` and modifiedTime > '${modifiedAfter.toDate().toISOString()}'`;
      }
      
      const response = await this.withRetry(
        () => drive.files.list({
          q: query,
          pageSize: MAX_RESULTS_PER_PAGE,
          pageToken,
          fields: 'nextPageToken, files(id, name, mimeType, modifiedTime, size)',
        }),
        `listFiles(${folderId})`
      );
      
      const files = response.data.files || [];
      
      for (const file of files) {
        if (!file.id || !file.name || !file.mimeType) continue;
        
        const filePath = currentPath ? `${currentPath}/${file.name}` : file.name;
        
        if (file.mimeType === 'application/vnd.google-apps.folder') {
          // Collect folder promises for concurrent processing
          const subFiles = await this.listAllFiles(
            drive,
            file.id,
            filePath,
            modifiedAfter
          );
          allFiles.push(...subFiles);
        } else if (isSupportedMimeType(file.mimeType)) {
          allFiles.push({
            id: file.id,
            name: file.name,
            mimeType: file.mimeType,
            path: filePath,
            modifiedTime: file.modifiedTime || new Date().toISOString(),
            size: file.size || undefined,
          });
        }
      }
      
      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);
    
    return allFiles;
  }
  
  /**
   * Process a single file: download, extract, chunk, embed
   */
  private async processFile(
    drive: drive_v3.Drive,
    file: {
      id: string;
      name: string;
      mimeType: string;
      path: string;
      modifiedTime: string;
      size?: string;
    }
  ): Promise<{ chunksCreated: number } | null> {
    try {
      console.log(`[DriveSync] Processing: ${file.path}`);
      
      // Check if document already exists and is up to date
      const existingDoc = await this.getDocument(file.id);
      if (existingDoc) {
        const existingModified = existingDoc.updatedAt?.toDate?.() || new Date(0);
        const fileModified = new Date(file.modifiedTime);
        
        if (fileModified <= existingModified) {
          console.log(`[DriveSync] Skipping ${file.name} (not modified)`);
          return null;
        }
      }
      
      // Download file content
      const content = await this.downloadFile(drive, file.id, file.mimeType);
      if (!content || content.length === 0) {
        console.warn(`[DriveSync] Empty content for ${file.name}`);
        return null;
      }
      
      // Extract text, metadata, AND analyze images with GPT-4o vision
      const { text, metadata, imageResult } = await DocumentProcessor.extractContentWithImages(
        content,
        file.mimeType,
        file.name,
        { documentContext: file.path }
      );
      
      if (imageResult?.imageCount) {
        console.log(`[DriveSync] Processed ${imageResult.imageCount} images from ${file.name}`);
      }
      
      if (!text || text.length < 50) {
        console.warn(`[DriveSync] Insufficient text extracted from ${file.name}`);
        return null;
      }
      
      // Classify document
      const classification = DocumentProcessor.classifyDocument(
        file.path,
        text,
        file.name
      );
      
      // Create document record
      const document: Omit<KBDocument, 'createdAt' | 'updatedAt'> = {
        id: file.id,
        title: metadata.title || file.name,
        sourceType: 'google_drive',
        sourcePath: file.path,
        sourceId: file.id,
        mimeType: file.mimeType as SupportedMimeType,
        category: classification.category,
        tags: classification.tags,
        metadata: {
          ...metadata,
          department: classification.department,
          product: classification.product,
          pharmacy: classification.pharmacy,
        },
        syncStatus: 'synced',
      };
      
      // Create chunks
      const chunks = DocumentProcessor.createChunks(text, file.id, file.name);
      
      // Generate embeddings and store chunks
      const embeddingService = EmbeddingService.getInstance();
      let chunksCreated = 0;
      
      for (const chunk of chunks) {
        try {
          await embeddingService.storeChunk(
            chunk,
            document.sourcePath,
            document.title,
            document.category,
            document.tags
          );
          chunksCreated++;
        } catch (error: any) {
          console.error(`[DriveSync] Failed to store chunk: ${error.message}`);
        }
      }
      
      // Save document record
      await this.saveDocument(document);
      
      console.log(`[DriveSync] Completed ${file.name}: ${chunksCreated} chunks`);
      
      return { chunksCreated };
      
    } catch (error: any) {
      console.error(`[DriveSync] Failed to process ${file.name}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Download file content from Drive
   */
  private async downloadFile(
    drive: drive_v3.Drive,
    fileId: string,
    mimeType: string
  ): Promise<string | Buffer> {
    // Google Workspace files need to be exported
    if (mimeType.startsWith('application/vnd.google-apps.')) {
      const exportMimeType = GOOGLE_EXPORT_TYPES[mimeType as keyof typeof GOOGLE_EXPORT_TYPES] || 'text/plain';
      
      const response = await this.withRetry(
        () => drive.files.export(
          { fileId, mimeType: exportMimeType },
          { responseType: 'text' }
        ),
        `export(${fileId})`
      );
      
      return response.data as string;
    }
    
    // Regular files - download directly
    const response = await this.withRetry(
      () => drive.files.get(
        { fileId, alt: 'media' },
        { responseType: 'arraybuffer' }
      ),
      `download(${fileId})`
    );
    
    return Buffer.from(response.data as ArrayBuffer);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // STATE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════════
  
  /**
   * Get current sync state
   */
  async getSyncState(): Promise<DriveSyncState | null> {
    try {
      const doc = await this.db
        .collection(SYNC_STATE_COLLECTION)
        .doc('current')
        .get();
      
      return doc.exists ? (doc.data() as DriveSyncState) : null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Update sync state
   */
  private async updateSyncState(update: Partial<DriveSyncState>): Promise<void> {
    try {
      await this.db
        .collection(SYNC_STATE_COLLECTION)
        .doc('current')
        .set(
          {
            ...update,
            rootFolderId: this.rootFolderId,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
    } catch (error: any) {
      console.error('[DriveSync] Failed to update sync state:', error.message);
    }
  }
  
  /**
   * Get document by ID
   */
  private async getDocument(id: string): Promise<KBDocument | null> {
    try {
      const doc = await this.db.collection(DOCUMENTS_COLLECTION).doc(id).get();
      return doc.exists ? (doc.data() as KBDocument) : null;
    } catch {
      return null;
    }
  }
  
  /**
   * Save document record
   */
  private async saveDocument(document: Omit<KBDocument, 'createdAt' | 'updatedAt'>): Promise<void> {
    await this.db.collection(DOCUMENTS_COLLECTION).doc(document.id).set(
      {
        ...document,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  
  /**
   * Get sync status for UI
   */
  async getStatus(): Promise<{
    configured: boolean;
    rootFolderId: string | null;
    lastSync: Date | null;
    status: 'idle' | 'syncing' | 'error' | 'completed';
    documentsCount: number;
    chunksCount: number;
    errors?: string[];
  }> {
    const state = await this.getSyncState();
    
    // Get document count
    const docsCount = await this.db.collection(DOCUMENTS_COLLECTION).count().get();
    const chunksCount = await this.db.collection('kb_chunks').count().get();
    
    return {
      configured: !!this.rootFolderId,
      rootFolderId: this.rootFolderId || null,
      lastSync: state?.lastSyncTime?.toDate() || null,
      status: state?.status || 'idle',
      documentsCount: docsCount.data().count,
      chunksCount: chunksCount.data().count,
      errors: state?.errors || undefined,
    };
  }
  
  /**
   * Clear all KB data (for full resync)
   */
  async clearAllData(): Promise<void> {
    console.log('[DriveSync] Clearing all KB data...');
    
    // Delete all documents in batches (Firestore limit: 500 per batch)
    const allDocs = await this.db.collection(DOCUMENTS_COLLECTION).listDocuments();
    for (let i = 0; i < allDocs.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = this.db.batch();
      const slice = allDocs.slice(i, i + FIRESTORE_BATCH_LIMIT);
      slice.forEach(doc => batch.delete(doc));
      await batch.commit();
    }
    
    // Delete all chunks in batches
    const allChunks = await this.db.collection('kb_chunks').listDocuments();
    for (let i = 0; i < allChunks.length; i += FIRESTORE_BATCH_LIMIT) {
      const batch = this.db.batch();
      const slice = allChunks.slice(i, i + FIRESTORE_BATCH_LIMIT);
      slice.forEach(chunk => batch.delete(chunk));
      await batch.commit();
    }
    
    // Reset sync state
    await this.db.collection(SYNC_STATE_COLLECTION).doc('current').delete();
    
    // Clear embedding cache
    EmbeddingService.getInstance().clearCache();
    
    console.log(`[DriveSync] Cleared ${allDocs.length} docs and ${allChunks.length} chunks`);
  }
}

export default DriveSync;
