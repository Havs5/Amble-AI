/**
 * DriveSearchService
 * 
 * Real-time Google Drive search for Knowledge Base queries.
 * Used as a fallback when Vector KB (indexed chunks) is empty.
 * 
 * Strategy:
 * 1. Uses Google Drive API fullText search within our KB folder
 * 2. Downloads & extracts content from matched files on-the-fly
 * 3. Supports all file types via Gemini extraction
 * 
 * This ensures the AI always has access to KB content, even without
 * pre-indexing. As the KB grows, the Vector KB (DriveSync) should
 * be the primary search path, with this as a reliable fallback.
 */

import { adminDb } from '@/lib/firebaseAdmin';
import { google } from 'googleapis';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID || '1dScQA7J2EbQw90zJnItUnJT2izPzyCL7';

export interface DriveSearchResult {
  documentId: string;
  title: string;
  content: string;
  score: number;
  filePath?: string;
  mimeType?: string;
  matchType: 'drive_search';
  metadata?: {
    department?: string;
    modifiedTime?: string;
    [key: string]: unknown;
  };
}

/**
 * Get a valid Google Drive access token for the user.
 * Checks Firestore for stored OAuth tokens from Google sign-in.
 */
export async function getDriveAccessToken(userId: string): Promise<string | null> {
  try {
    const tokenDoc = await adminDb.collection('google_drive_tokens').doc(userId).get();
    if (tokenDoc.exists) {
      const tokenData = tokenDoc.data();
      if (tokenData?.accessToken && tokenData?.expiresAt > Date.now()) {
        return tokenData.accessToken;
      }
      // Try to refresh if we have a refresh token
      if (tokenData?.refreshToken) {
        const refreshed = await refreshGoogleToken(tokenData.refreshToken);
        if (refreshed) {
          // Update stored token
          await adminDb.collection('google_drive_tokens').doc(userId).update({
            accessToken: refreshed.access_token,
            expiresAt: Date.now() + (refreshed.expires_in * 1000),
          });
          return refreshed.access_token;
        }
      }
    }
  } catch (e) {
    console.error('[DriveSearch] Failed to get access token:', e);
  }
  return null;
}

/**
 * Refresh an expired Google OAuth token
 */
async function refreshGoogleToken(refreshToken: string): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    if (response.ok) {
      return await response.json();
    }
  } catch (e) {
    console.error('[DriveSearch] Token refresh failed:', e);
  }
  return null;
}

/**
 * Search Google Drive files using fullText search within the KB folder.
 * Returns file metadata for matched files.
 */
async function searchDriveFiles(
  accessToken: string,
  query: string,
  maxResults: number = 10
): Promise<Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; parents?: string[] }>> {
  try {
    // Build search query: search for text in files within our KB root folder tree
    // Drive API fullText search finds content within documents
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    
    // Build fullText search terms
    const searchTerms = queryWords.slice(0, 5).map(w => `fullText contains '${w.replace(/'/g, "\\'")}'`).join(' or ');
    
    // Also search by name for high-relevance matches
    const nameTerms = queryWords.slice(0, 3).map(w => `name contains '${w.replace(/'/g, "\\'")}'`).join(' or ');
    
    // Search both by content and name, within the KB folder tree
    const driveQuery = `(${searchTerms} or ${nameTerms}) and trashed = false`;
    
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set('q', driveQuery);
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,parents)');
    url.searchParams.set('pageSize', String(maxResults));
    url.searchParams.set('orderBy', 'modifiedTime desc');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    url.searchParams.set('corpora', 'allDrives');
    
    console.log(`[DriveSearch] Searching Drive: "${query}" (${queryWords.length} terms)`);
    
    const response = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    
    if (!response.ok) {
      const err = await response.text();
      console.error(`[DriveSearch] Drive API error ${response.status}:`, err.substring(0, 200));
      return [];
    }
    
    const data = await response.json();
    const files = data.files || [];
    console.log(`[DriveSearch] Found ${files.length} files matching query`);
    
    return files;
  } catch (error) {
    console.error('[DriveSearch] Search failed:', error);
    return [];
  }
}

/**
 * Extract text content from a Drive file.
 * Uses Google export for Workspace files, Gemini for binary files.
 */
async function extractDriveFileContent(
  fileId: string,
  mimeType: string,
  accessToken: string,
  fileName?: string
): Promise<string | null> {
  try {
    // Google Workspace files — export as text
    if (mimeType === 'application/vnd.google-apps.document') {
      const url = `${DRIVE_API}/files/${fileId}/export?mimeType=text%2Fplain`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (res.ok) {
        const text = await res.text();
        return text.substring(0, 10000); // Cap at 10k chars
      }
    }
    
    if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const url = `${DRIVE_API}/files/${fileId}/export?mimeType=text%2Fcsv`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (res.ok) {
        const text = await res.text();
        return text.substring(0, 10000);
      }
    }
    
    if (mimeType === 'application/vnd.google-apps.presentation') {
      const url = `${DRIVE_API}/files/${fileId}/export?mimeType=text%2Fplain`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (res.ok) {
        const text = await res.text();
        return text.substring(0, 10000);
      }
    }
    
    // Plain text files
    if (mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'application/xml') {
      const url = `${DRIVE_API}/files/${fileId}?alt=media`;
      const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
      if (res.ok) {
        const text = await res.text();
        return text.substring(0, 10000);
      }
    }
    
    // Binary files (PDF, Office docs, images) — use Gemini extraction
    const binaryTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/msword',
      'application/vnd.ms-excel',
      'application/vnd.ms-powerpoint',
    ];
    
    if (binaryTypes.includes(mimeType) || mimeType.startsWith('image/')) {
      return await extractWithGemini(fileId, mimeType, accessToken, fileName);
    }
    
    // Google Apps folder or unsupported type
    return null;
  } catch (error) {
    console.error(`[DriveSearch] Content extraction failed for ${fileName}:`, error);
    return null;
  }
}

/**
 * Extract content from binary files using Gemini
 */
async function extractWithGemini(
  fileId: string,
  mimeType: string,
  accessToken: string,
  fileName?: string
): Promise<string | null> {
  try {
    const url = `${DRIVE_API}/files/${fileId}?alt=media`;
    const response = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
    
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    // Skip files larger than 10MB
    if (arrayBuffer.byteLength > 10 * 1024 * 1024) {
      console.log(`[DriveSearch] File too large for extraction: ${Math.round(arrayBuffer.byteLength / 1024)}KB`);
      return null;
    }
    
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!geminiApiKey) return null;
    
    const prompt = mimeType.startsWith('image/')
      ? 'Extract ALL text visible in this image. Include numbers, labels, and data. Output only the extracted text, no commentary.'
      : 'Extract ALL text content from this document including headings, paragraphs, lists, tables. Preserve structure. Output only the extracted content.';
    
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    });
    
    if (!geminiRes.ok) return null;
    
    const result = await geminiRes.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      console.log(`[DriveSearch] ✅ Gemini extracted ${text.length} chars from ${fileName || fileId}`);
      return text.substring(0, 10000);
    }
    return null;
  } catch (error) {
    console.error('[DriveSearch] Gemini extraction error:', error);
    return null;
  }
}

/**
 * Infer department from file name/path
 */
function inferDepartment(name: string, parents?: string[]): string | undefined {
  const lower = name.toLowerCase();
  if (lower.includes('billing') || lower.includes('dispute')) return 'Billing & Disputes';
  if (lower.includes('patient') || lower.includes('experience')) return 'Patient Experience';
  if (lower.includes('pharmacy') || lower.includes('rx')) return 'Pharmacies';
  if (lower.includes('product') || lower.includes('medication')) return 'Products';
  if (lower.includes('training')) return 'Training';
  if (lower.includes('resource')) return 'Resources';
  return undefined;
}

/**
 * Score a search result based on query relevance
 */
function scoreResult(fileName: string, query: string): number {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const nameLower = fileName.toLowerCase();
  let score = 0.5; // Base score for matching Drive fullText search
  
  // Bonus for name matches
  for (const word of queryWords) {
    if (nameLower.includes(word)) {
      score += 0.15;
    }
  }
  
  // Exact phrase in name
  if (nameLower.includes(query.toLowerCase())) {
    score += 0.3;
  }
  
  return Math.min(score, 1.0);
}

/**
 * Main search function: Search Google Drive and extract content from matching files.
 * 
 * This is the key fallback when Vector KB is empty. It:
 * 1. Searches Drive files by content/name using the fullText API
 * 2. Downloads and extracts text from top matches
 * 3. Returns results in the same format as Vector KB search
 */
export async function searchDriveWithContent(
  accessToken: string,
  query: string,
  limit: number = 5
): Promise<DriveSearchResult[]> {
  const startTime = Date.now();
  console.log(`[DriveSearch] ====== DRIVE SEARCH ======`);
  console.log(`[DriveSearch] Query: "${query}", limit: ${limit}`);
  
  // 1. Search Drive for matching files
  const files = await searchDriveFiles(accessToken, query, limit * 2); // Fetch extra to account for extraction failures
  
  if (files.length === 0) {
    console.log('[DriveSearch] No files found');
    return [];
  }
  
  // 2. Filter out folders and unsupported types
  const processableFiles = files.filter(f => 
    f.mimeType !== 'application/vnd.google-apps.folder' &&
    f.mimeType !== 'application/vnd.google-apps.shortcut'
  );
  
  console.log(`[DriveSearch] Processing ${processableFiles.length} files...`);
  
  // 3. Extract content from top files in parallel (limit concurrency)
  const topFiles = processableFiles.slice(0, limit);
  const extractionResults = await Promise.allSettled(
    topFiles.map(async (file) => {
      const content = await extractDriveFileContent(file.id, file.mimeType, accessToken, file.name);
      return { file, content };
    })
  );
  
  // 4. Build results
  const results: DriveSearchResult[] = [];
  
  for (const result of extractionResults) {
    if (result.status === 'fulfilled' && result.value.content) {
      const { file, content } = result.value;
      results.push({
        documentId: file.id,
        title: file.name,
        content: content,
        score: scoreResult(file.name, query),
        mimeType: file.mimeType,
        matchType: 'drive_search',
        metadata: {
          department: inferDepartment(file.name),
          modifiedTime: file.modifiedTime,
        },
      });
    }
  }
  
  // Sort by score
  results.sort((a, b) => b.score - a.score);
  
  console.log(`[DriveSearch] ✅ ${results.length} results with content (${Date.now() - startTime}ms)`);
  return results.slice(0, limit);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SERVICE ACCOUNT DRIVE SEARCH (No user OAuth needed)
// ═══════════════════════════════════════════════════════════════════════════════

let serviceAccountDrive: any = null;

/**
 * Initialize the Google Drive client using the service account key.
 * This doesn't require user OAuth tokens — the service account has its own access.
 */
function getServiceAccountDrive(): any {
  if (serviceAccountDrive) return serviceAccountDrive;
  
  const credentials = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!credentials) {
    console.log('[DriveSearch] No GOOGLE_SERVICE_ACCOUNT_KEY — service account search unavailable');
    return null;
  }
  
  try {
    const serviceAccount = JSON.parse(credentials);
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    
    serviceAccountDrive = google.drive({ version: 'v3', auth });
    console.log('[DriveSearch] Service account Drive client initialized');
    return serviceAccountDrive;
  } catch (e) {
    console.error('[DriveSearch] Failed to init service account:', e);
    return null;
  }
}

/**
 * Search Google Drive using the SERVICE ACCOUNT (no user token needed).
 * The service account must have been shared on the KB folder.
 * 
 * This is the PRIMARY fallback for KB search when Vector KB is empty.
 */
export async function searchDriveWithServiceAccount(
  query: string,
  limit: number = 5
): Promise<DriveSearchResult[]> {
  const startTime = Date.now();
  const drive = getServiceAccountDrive();
  
  if (!drive) {
    console.log('[DriveSearch] Service account not available');
    return [];
  }
  
  console.log(`[DriveSearch] ====== SA DRIVE SEARCH ======`);
  console.log(`[DriveSearch] Query: "${query}", root: ${ROOT_FOLDER_ID}`);
  
  try {
    // Build search query
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (queryWords.length === 0) return [];
    
    const searchTerms = queryWords.slice(0, 5).map(w => `fullText contains '${w.replace(/'/g, "\\'")}' or name contains '${w.replace(/'/g, "\\'")}'`).join(' or ');
    
    // Search within the KB folder tree
    const driveQuery = `(${searchTerms}) and trashed = false`;
    
    console.log(`[DriveSearch] SA query: ${driveQuery.substring(0, 200)}`);
    
    const response = await drive.files.list({
      q: driveQuery,
      fields: 'files(id,name,mimeType,modifiedTime,parents)',
      pageSize: limit * 3,
      orderBy: 'modifiedTime desc',
    });
    
    const files = (response.data.files || []).filter((f: any) => 
      f.mimeType !== 'application/vnd.google-apps.folder' &&
      f.mimeType !== 'application/vnd.google-apps.shortcut'
    );
    
    console.log(`[DriveSearch] SA found ${files.length} files`);
    
    if (files.length === 0) return [];
    
    // Extract content from top files using the service account
    const topFiles = files.slice(0, limit);
    const results: DriveSearchResult[] = [];
    
    for (const file of topFiles) {
      try {
        let content: string | null = null;
        
        // Google Workspace files — export as text
        if (file.mimeType?.startsWith('application/vnd.google-apps.')) {
          const exportMimeType = file.mimeType === 'application/vnd.google-apps.spreadsheet' 
            ? 'text/csv' : 'text/plain';
          
          const exportRes = await drive.files.export({
            fileId: file.id,
            mimeType: exportMimeType,
          }, { responseType: 'text' });
          
          content = typeof exportRes.data === 'string' 
            ? exportRes.data.substring(0, 10000) : null;
          
        } else if (file.mimeType?.startsWith('text/') || file.mimeType === 'application/json') {
          // Plain text files
          const getRes = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'text' }
          );
          content = typeof getRes.data === 'string' 
            ? getRes.data.substring(0, 10000) : null;
          
        } else {
          // Binary files — download and use Gemini for extraction
          const getRes = await drive.files.get(
            { fileId: file.id, alt: 'media' },
            { responseType: 'arraybuffer' }
          );
          
          if (getRes.data) {
            const buffer = Buffer.from(getRes.data as ArrayBuffer);
            if (buffer.length <= 10 * 1024 * 1024) { // 10MB limit
              content = await extractBinaryWithGemini(buffer, file.mimeType!, file.name);
            }
          }
        }
        
        if (content && content.length > 50) {
          results.push({
            documentId: file.id!,
            title: file.name!,
            content,
            score: scoreResult(file.name!, query),
            mimeType: file.mimeType!,
            matchType: 'drive_search',
            metadata: {
              department: inferDepartment(file.name!),
              modifiedTime: file.modifiedTime!,
            },
          });
        }
      } catch (fileError: any) {
        console.error(`[DriveSearch] SA extraction failed for ${file.name}:`, fileError.message);
      }
    }
    
    results.sort((a, b) => b.score - a.score);
    console.log(`[DriveSearch] SA ✅ ${results.length} results with content (${Date.now() - startTime}ms)`);
    return results.slice(0, limit);
    
  } catch (error: any) {
    console.error('[DriveSearch] SA search failed:', error.message);
    return [];
  }
}

/**
 * Extract content from binary Buffer using Gemini (no Drive token needed)
 */
async function extractBinaryWithGemini(
  buffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<string | null> {
  try {
    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    if (!geminiApiKey) return null;
    
    const base64Data = buffer.toString('base64');
    
    const prompt = mimeType.startsWith('image/')
      ? 'Extract ALL text visible in this image. Include numbers, labels, and data. Output only the extracted text, no commentary.'
      : 'Extract ALL text content from this document including headings, paragraphs, lists, tables. Preserve structure. Output only the extracted content.';
    
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Data } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 }
      })
    });
    
    if (!geminiRes.ok) return null;
    
    const result = await geminiRes.json();
    const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      console.log(`[DriveSearch] ✅ Gemini extracted ${text.length} chars from ${fileName || 'unknown'}`);
      return text.substring(0, 10000);
    }
    return null;
  } catch (error) {
    console.error('[DriveSearch] Gemini extraction error:', error);
    return null;
  }
}
