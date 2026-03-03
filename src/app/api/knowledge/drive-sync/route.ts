/**
 * Drive Sync API - Syncs Google Drive files to Firestore using user's OAuth token
 * 
 * POST /api/knowledge/drive-sync
 * 
 * This endpoint accepts the user's Google OAuth token and syncs documents
 * from their Google Drive to the Firestore Knowledge Base.
 * 
 * Unlike /api/knowledge/sync which requires service account credentials,
 * this endpoint works with any user's OAuth token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import OpenAI from 'openai';

// Lazy-init OpenAI for embedding generation
let openaiClient: OpenAI | null = null;
function getOpenAI(): OpenAI | null {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 30000, maxRetries: 2 });
  }
  return openaiClient;
}

// Google Drive API base
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// Collections
const DOCUMENTS_COLLECTION = 'kb_documents';
const CHUNKS_COLLECTION = 'kb_chunks';

// Supported file types
const SUPPORTED_MIME_TYPES = [
  'application/vnd.google-apps.document',
  'application/vnd.google-apps.spreadsheet',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'application/json',
];

// Export types for Google Docs
const EXPORT_MIME_TYPES: Record<string, string> = {
  'application/vnd.google-apps.document': 'text/plain',
  'application/vnd.google-apps.spreadsheet': 'text/csv',
};

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  path?: string; // Folder path for context
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[Drive-Sync] POST /api/knowledge/drive-sync called');
  
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const firebaseToken = authHeader.substring(7);
    let userId: string;
    
    try {
      const decoded = await adminAuth.verifyIdToken(firebaseToken);
      userId = decoded.uid;
      console.log('[Drive-Sync] Verified user:', userId);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { accessToken, folderId } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'Google Drive access token required' }, { status: 400 });
    }

    const rootFolderId = folderId || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID;
    if (!rootFolderId) {
      return NextResponse.json({ error: 'No folder ID provided' }, { status: 400 });
    }

    console.log('[Drive-Sync] Starting sync for folder:', rootFolderId);

    // List all files in the folder tree
    const files = await listAllFiles(accessToken, rootFolderId);
    console.log('[Drive-Sync] Found', files.length, 'files');

    // Filter to supported file types
    const indexableFiles = files.filter(f => SUPPORTED_MIME_TYPES.includes(f.mimeType));
    console.log('[Drive-Sync] Indexable files:', indexableFiles.length);

    // Process each file
    let syncedCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    // Process in batches of 5 for parallel efficiency
    for (let i = 0; i < indexableFiles.length; i += 5) {
      const batch = indexableFiles.slice(i, i + 5);
      
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          try {
            // Extract content
            const content = await extractContent(accessToken, file.id, file.mimeType);
            
            if (!content || content.trim().length === 0) {
              console.log('[Drive-Sync] No content for:', file.name);
              return false;
            }

            // Determine category/department from path
            const category = detectCategory(file.name, content);

            // Save to Firestore
            const docRef = adminDb.collection(DOCUMENTS_COLLECTION).doc(file.id);
            await docRef.set({
              id: file.id,
              title: file.name,
              content: content.substring(0, 50000), // Limit content size
              mimeType: file.mimeType,
              category: category,
              department: category,
              syncedAt: FieldValue.serverTimestamp(),
              syncedBy: userId,
              lastModified: file.modifiedTime || null,
            }, { merge: true });

            // Create searchable chunks WITH embeddings
            const chunks = createChunks(content, file.id, file.name);
            const openai = getOpenAI();
            
            // Generate embeddings in batches for efficiency
            let chunkEmbeddings: number[][] = [];
            if (openai) {
              try {
                const textsToEmbed = chunks.map(c => c.content);
                // OpenAI supports batched embedding requests
                for (let ci = 0; ci < textsToEmbed.length; ci += 20) {
                  const batch = textsToEmbed.slice(ci, ci + 20);
                  const embResponse = await openai.embeddings.create({
                    model: 'text-embedding-3-small',
                    input: batch,
                  });
                  embResponse.data.forEach(d => chunkEmbeddings.push(d.embedding));
                }
                console.log('[Drive-Sync] Generated', chunkEmbeddings.length, 'embeddings for', file.name);
              } catch (embErr: any) {
                console.warn('[Drive-Sync] Embedding generation failed for', file.name, ':', embErr.message);
                chunkEmbeddings = []; // Fall back to no embeddings
              }
            }

            for (let ci = 0; ci < chunks.length; ci++) {
              const chunk = chunks[ci];
              const chunkRef = adminDb.collection(CHUNKS_COLLECTION).doc();
              const chunkData: any = {
                documentId: file.id,
                documentName: file.name, // Used by keyword search
                title: file.name,
                content: chunk.content,
                chunkIndex: chunk.index,
                category: category,
                department: category,
                sourcePath: file.path || '',
                createdAt: FieldValue.serverTimestamp(),
              };
              // Attach embedding if available
              if (chunkEmbeddings[ci]) {
                chunkData.embedding = chunkEmbeddings[ci];
              }
              await chunkRef.set(chunkData);
            }

            console.log('[Drive-Sync] Synced:', file.name, '- chunks:', chunks.length);
            return true;
          } catch (e: any) {
            console.error('[Drive-Sync] Error processing', file.name, ':', e.message);
            errors.push(`${file.name}: ${e.message}`);
            return false;
          }
        })
      );

      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          syncedCount++;
        } else {
          errorCount++;
        }
      }
    }

    console.log('[Drive-Sync] Sync complete:', { syncedCount, errorCount });

    return NextResponse.json({
      success: true,
      syncedCount,
      errorCount,
      errors: errors.slice(0, 10), // Limit error messages
      message: `Synced ${syncedCount} documents to Knowledge Base`,
    });

  } catch (error: any) {
    console.error('[Drive-Sync] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

/**
 * List all files recursively from a Google Drive folder
 */
async function listAllFiles(
  accessToken: string,
  folderId: string,
  path: string = '',
  depth: number = 0
): Promise<Array<DriveFile & { path: string }>> {
  const files: Array<DriveFile & { path: string }> = [];
  const MAX_DEPTH = 5;
  
  if (depth > MAX_DEPTH) {
    console.log('[Drive-Sync] Max depth reached at:', path);
    return files;
  }
  
  console.log(`[Drive-Sync] Listing folder: ${folderId} (path: ${path || 'root'}, depth: ${depth})`);
  
  try {
    let pageToken: string | undefined;
    
    do {
      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
      url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, modifiedTime)');
      url.searchParams.set('pageSize', '100');
      // Support shared drives
      url.searchParams.set('supportsAllDrives', 'true');
      url.searchParams.set('includeItemsFromAllDrives', 'true');
      if (pageToken) url.searchParams.set('pageToken', pageToken);

      console.log('[Drive-Sync] Fetching:', url.toString().substring(0, 100));
      
      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        console.error('[Drive-Sync] API Error:', response.status, errorText.substring(0, 200));
        if (response.status === 401) {
          throw new Error('Google Drive token expired or invalid. Please reconnect Google Drive.');
        }
        if (response.status === 403) {
          throw new Error('Access denied to Google Drive folder. Check sharing permissions.');
        }
        throw new Error(`Drive API error: ${response.status} - ${errorText.substring(0, 100)}`);
      }

      const data = await response.json();
      console.log(`[Drive-Sync] Found ${(data.files || []).length} items in ${path || 'root'}`);

      for (const file of data.files || []) {
        const filePath = path ? `${path}/${file.name}` : file.name;

        if (file.mimeType === 'application/vnd.google-apps.folder') {
          console.log('[Drive-Sync] Found subfolder:', file.name);
          // Recursively list folder contents
          if (depth < MAX_DEPTH) {
            const subFiles = await listAllFiles(accessToken, file.id, filePath, depth + 1);
            files.push(...subFiles);
          }
        } else {
          console.log('[Drive-Sync] Found file:', file.name, file.mimeType);
          files.push({ ...file, path: filePath });
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

  } catch (error: any) {
    console.error('[Drive-Sync] Error listing files in', path || 'root', ':', error.message);
    // Re-throw the error so it's reported to the caller
    throw error;
  }

  console.log(`[Drive-Sync] Total files found in ${path || 'root'}:`, files.length);
  return files;
}

/**
 * Extract content from a Google Drive file
 */
async function extractContent(
  accessToken: string,
  fileId: string,
  mimeType: string
): Promise<string | null> {
  try {
    let url: string;

    // Google Docs/Sheets need export
    if (EXPORT_MIME_TYPES[mimeType]) {
      const exportMimeType = EXPORT_MIME_TYPES[mimeType];
      url = `${DRIVE_API}/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
    } else {
      // Direct download for other file types
      url = `${DRIVE_API}/files/${fileId}?alt=media`;
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      console.warn('[Drive-Sync] Failed to fetch content for', fileId, ':', response.status);
      return null;
    }

    const content = await response.text();
    
    // Limit content size
    return content.length > 50000 ? content.substring(0, 50000) : content;
  } catch (error: any) {
    console.error('[Drive-Sync] Error extracting content:', error.message);
    return null;
  }
}

/**
 * Detect category/department from file name and content
 */
function detectCategory(fileName: string, content: string): string {
  const text = `${fileName} ${content.substring(0, 1000)}`.toLowerCase();

  const categories: Record<string, string[]> = {
    'Products': ['tirzepatide', 'semaglutide', 'ozempic', 'wegovy', 'mounjaro', 'zepbound', 'glp-1', 'medication', 'dosage', 'vial'],
    'Billing': ['billing', 'invoice', 'payment', 'charge', 'refund', 'credit', 'price', 'cost', 'fee'],
    'Pharmacies': ['pharmacy', 'hallandale', 'perfectrx', 'revive', 'empower', 'boothwyn', 'align', 'greenwich'],
    'Disputes': ['dispute', 'chargeback', 'complaint', 'escalation', 'resolution'],
    'Shipping': ['shipping', 'delivery', 'tracking', 'shipment'],
    'Training': ['training', 'onboarding', 'guide', 'procedure', 'sop'],
    'Compliance': ['compliance', 'hipaa', 'regulation', 'policy'],
  };

  for (const [category, keywords] of Object.entries(categories)) {
    if (keywords.some(kw => text.includes(kw))) {
      return category;
    }
  }

  return 'General';
}

/**
 * Split content into searchable chunks
 */
function createChunks(
  content: string,
  documentId: string,
  title: string,
  chunkSize: number = 1000,
  overlap: number = 100
): Array<{ content: string; index: number }> {
  const chunks: Array<{ content: string; index: number }> = [];
  
  // If content is short, keep as single chunk
  if (content.length <= chunkSize) {
    return [{ content, index: 0 }];
  }

  // Split into overlapping chunks
  let index = 0;
  for (let start = 0; start < content.length; start += chunkSize - overlap) {
    const end = Math.min(start + chunkSize, content.length);
    const chunkText = content.substring(start, end);
    
    // Don't create tiny chunks at the end
    if (chunkText.length > overlap) {
      chunks.push({ content: chunkText, index });
      index++;
    }
  }

  return chunks;
}
