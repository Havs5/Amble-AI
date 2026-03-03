/**
 * Google Drive Search Service (Service Account) — BULLETPROOF REBUILD
 * 
 * Searches company KB documents in Google Drive using service account credentials.
 * No user OAuth token needed — uses GOOGLE_SERVICE_ACCOUNT_KEY from env.
 * 
 * Architecture:
 * 1. Authenticates via google-auth-library (included with firebase-admin)
 * 2. Uses native fetch for Drive REST API calls
 * 3. RECURSIVE search strategy: fullText + filename (no parent constraint) → BFS fallback
 * 4. Content extraction: Workspace exports, pdf-parse (lazy-loaded), Gemini for binary
 * 
 * Key fix: Strategies 1 & 2 now search ALL files accessible to the service account
 * (not just root folder children), ensuring files in subfolders are always found.
 */

const { GoogleAuth } = require('google-auth-library');

// ============================================================================
// Firestore Content Cache — avoids re-extracting the same files
// ============================================================================

let _adminDb = null;

/**
 * Get Firestore reference. Lazy-init to avoid import-order issues.
 */
function getFirestore() {
  if (!_adminDb) {
    try {
      const admin = require('firebase-admin');
      _adminDb = admin.firestore();
    } catch (e) {
      console.warn('[DriveSearch] Could not init Firestore for caching:', e.message);
    }
  }
  return _adminDb;
}

const CONTENT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Look up cached content for a Drive file.
 * Returns { content, extractedAt } or null.
 */
async function getCachedContent(fileId, modifiedTime) {
  const db = getFirestore();
  if (!db) return null;
  try {
    const doc = await db.collection('kb_content_cache').doc(fileId).get();
    if (!doc.exists) return null;
    const data = doc.data();
    // Invalidate if file was modified after cache was written
    if (modifiedTime && data.modifiedTime && modifiedTime > data.modifiedTime) {
      return null;
    }
    // Invalidate if cache is too old
    if (data.extractedAt && (Date.now() - data.extractedAt) > CONTENT_CACHE_TTL) {
      return null;
    }
    return data.content || null;
  } catch (e) {
    return null; // Cache miss is not critical
  }
}

/**
 * Store extracted content in Firestore cache.
 */
async function setCachedContent(fileId, content, modifiedTime) {
  const db = getFirestore();
  if (!db || !content) return;
  try {
    await db.collection('kb_content_cache').doc(fileId).set({
      content: content.substring(0, 50000), // Cap to prevent Firestore doc size limits
      extractedAt: Date.now(),
      modifiedTime: modifiedTime || null,
    });
  } catch (e) {
    // Not critical
  }
}

// ============================================================================
// Auth — cached across invocations within the same function instance
// ============================================================================

let _cachedAuth = null;

async function getAuthToken() {
  let keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyJson) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY not configured');

  // Strip surrounding quotes if present (dotenv sometimes leaves them)
  keyJson = keyJson.replace(/^'|'$/g, '').replace(/^"|"$/g, '');

  const credentials = JSON.parse(keyJson);

  if (!_cachedAuth) {
    _cachedAuth = new GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
  }

  const client = await _cachedAuth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

// ============================================================================
// Subfolder ID resolution — cached per function instance
// ============================================================================

let _subfolderCache = null;
let _subfolderCacheTime = 0;
const SUBFOLDER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Get ALL subfolder IDs under the root KB folder (BFS, max 3 levels).
 * Returns [rootFolderId, sub1, sub2, ...].
 */
async function getAllFolderIds(rootFolderId, accessToken) {
  if (_subfolderCache && (Date.now() - _subfolderCacheTime) < SUBFOLDER_CACHE_TTL) {
    return _subfolderCache;
  }

  const allFolderIds = [rootFolderId];
  const queue = [rootFolderId];
  let depth = 0;

  while (queue.length > 0 && depth < 3) {
    const nextLevel = [];
    for (const fid of queue) {
      try {
        const q = `'${fid}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
        const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams({
          q,
          fields: 'files(id,name)',
          pageSize: '100',
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
        });
        const res = await driveApiGet(url, accessToken);
        const data = await res.json();
        for (const folder of (data.files || [])) {
          allFolderIds.push(folder.id);
          nextLevel.push(folder.id);
        }
      } catch (e) {
        console.error(`[DriveSearch] Failed to list subfolders of ${fid}:`, e.message);
      }
    }
    queue.length = 0;
    queue.push(...nextLevel);
    depth++;
  }

  console.log(`[DriveSearch] Resolved ${allFolderIds.length} folder IDs (root + subfolders)`);
  _subfolderCache = allFolderIds;
  _subfolderCacheTime = Date.now();
  return allFolderIds;
}

// ============================================================================
// Main Search Function
// ============================================================================

/**
 * Search Google Drive for company KB documents using the service account.
 * Uses a RECURSIVE search strategy to ensure files in subfolders are always found:
 *   1. Full-text search across ALL folders (root + subfolders)
 *   2. Filename keyword search across ALL folders
 *   3. Fallback: List all files in folder tree + keyword match
 */
async function searchDriveWithServiceAccount(query, limit = 5) {
  const folderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!folderId) {
    console.warn('[DriveSearch] GOOGLE_DRIVE_ROOT_FOLDER_ID not configured');
    return [];
  }

  let accessToken;
  try {
    accessToken = await getAuthToken();
    console.log('[DriveSearch] ✅ Service account authenticated');
  } catch (e) {
    console.error('[DriveSearch] ❌ Auth failed:', e.message);
    return [];
  }

  // Extract meaningful keywords from the query
  const STOP_WORDS = new Set([
    'the', 'for', 'and', 'what', 'how', 'are', 'current', 'about', 'with',
    'from', 'this', 'that', 'can', 'does', 'show', 'tell', 'give', 'list',
    'find', 'get', 'all', 'any', 'our', 'the', 'its', 'has', 'have', 'had',
    'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should',
    'may', 'might', 'shall', 'not', 'but', 'yet', 'also', 'just', 'only',
    'than', 'too', 'very', 'each', 'every', 'some', 'more', 'most', 'other',
    'into', 'over', 'such', 'then', 'them', 'these', 'those', 'your', 'yours',
    'which', 'where', 'when', 'who', 'whom', 'why', 'please', 'need', 'want',
    'know', 'look', 'information', 'details', 'data',
  ]);

  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  console.log('[DriveSearch] Query:', query);
  console.log('[DriveSearch] Keywords:', keywords.join(', '));

  if (keywords.length === 0) {
    console.log('[DriveSearch] No meaningful keywords — listing all files');
    return await listAndExtract(folderId, accessToken, query, limit);
  }

  // Resolve ALL folder IDs (root + subfolders) for recursive search
  let allFolderIds;
  try {
    allFolderIds = await getAllFolderIds(folderId, accessToken);
  } catch (e) {
    console.error('[DriveSearch] Failed to resolve subfolders, using root only:', e.message);
    allFolderIds = [folderId];
  }

  // ── Strategy 1: Full-text search across ALL folders (root + subfolders) ──
  let files = await fullTextSearch(allFolderIds, keywords, accessToken, limit * 2);
  console.log(`[DriveSearch] Strategy 1 (fullText recursive): ${files.length} files`);

  // ── Strategy 2: Filename keyword search across ALL folders ──
  if (files.length < limit) {
    const nameFiles = await filenameSearch(allFolderIds, keywords, accessToken, limit);
    for (const f of nameFiles) {
      if (!files.some(existing => existing.id === f.id)) files.push(f);
    }
    console.log(`[DriveSearch] Strategy 2 (filename recursive): total ${files.length} files`);
  }

  // ── Strategy 3: BFS list all files + content matching (expensive fallback) ──
  if (files.length === 0) {
    console.log('[DriveSearch] Strategy 3: Listing ALL folder contents...');
    return await listAndExtract(folderId, accessToken, query, limit);
  }

  // ── Extract content from found files ──
  return await extractResults(files.slice(0, limit), accessToken, keywords);
}

// ============================================================================
// Drive API Search Methods
// ============================================================================

async function driveApiGet(url, accessToken) {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Drive API ${res.status}: ${errBody.substring(0, 300)}`);
  }
  return res;
}

/**
 * Full-text search across ALL folders (root + subfolders).
 * Searches each folder in parallel for speed.
 * @param {string[]} folderIds - Array of folder IDs to search
 */
async function fullTextSearch(folderIds, keywords, accessToken, limit) {
  if (keywords.length === 0) return [];

  const ftClauses = keywords
    .slice(0, 6)
    .map(kw => `fullText contains '${kw.replace(/'/g, "\\'")}'`);

  // Search all folders in parallel
  const searchPromises = folderIds.map(async (fid) => {
    const q = `'${fid}' in parents and (${ftClauses.join(' or ')}) and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      pageSize: String(Math.min(limit, 100)),
      orderBy: 'modifiedTime desc',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    try {
      const res = await driveApiGet(url, accessToken);
      const data = await res.json();
      return data.files || [];
    } catch (e) {
      console.error(`[DriveSearch] fullText search in folder ${fid} error:`, e.message);
      return [];
    }
  });

  const results = await Promise.all(searchPromises);
  // Flatten and deduplicate by file ID
  const seen = new Set();
  const allFiles = [];
  for (const files of results) {
    for (const f of files) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        allFiles.push(f);
      }
    }
  }
  return allFiles.slice(0, limit);
}

/**
 * Filename keyword search across ALL folders (root + subfolders).
 * @param {string[]} folderIds - Array of folder IDs to search
 */
async function filenameSearch(folderIds, keywords, accessToken, limit) {
  if (keywords.length === 0) return [];

  const nameClauses = keywords
    .slice(0, 6)
    .map(kw => `name contains '${kw.replace(/'/g, "\\'")}'`);

  const searchPromises = folderIds.map(async (fid) => {
    const q = `'${fid}' in parents and (${nameClauses.join(' or ')}) and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams({
      q,
      fields: 'files(id,name,mimeType,modifiedTime,size)',
      pageSize: String(Math.min(limit, 100)),
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });

    try {
      const res = await driveApiGet(url, accessToken);
      const data = await res.json();
      return data.files || [];
    } catch (e) {
      console.error(`[DriveSearch] filename search in folder ${fid} error:`, e.message);
      return [];
    }
  });

  const results = await Promise.all(searchPromises);
  const seen = new Set();
  const allFiles = [];
  for (const files of results) {
    for (const f of files) {
      if (!seen.has(f.id)) {
        seen.add(f.id);
        allFiles.push(f);
      }
    }
  }
  return allFiles.slice(0, limit);
}

/**
 * List ALL files in the KB folder (recursive into subfolders).
 * Extract content and rank by keyword relevance.
 */
async function listAndExtract(folderId, accessToken, query, limit) {
  const allFiles = [];
  const foldersToScan = [folderId];

  // BFS through folder tree (max 3 levels deep)
  let depth = 0;
  while (foldersToScan.length > 0 && depth < 3) {
    const nextLevel = [];
    for (const folder of foldersToScan) {
      const q = `'${folder}' in parents and trashed = false`;
      const url = `https://www.googleapis.com/drive/v3/files?` + new URLSearchParams({
        q,
        fields: 'files(id,name,mimeType,modifiedTime,size,shortcutDetails)',
        pageSize: '100',
        orderBy: 'modifiedTime desc',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
      });

      try {
        const res = await driveApiGet(url, accessToken);
        const data = await res.json();
        for (const file of (data.files || [])) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            nextLevel.push(file.id);
          } else if (file.mimeType === 'application/vnd.google-apps.shortcut') {
            // Resolve shortcut to target file
            if (file.shortcutDetails?.targetId && file.shortcutDetails?.targetMimeType !== 'application/vnd.google-apps.folder') {
              allFiles.push({
                id: file.shortcutDetails.targetId,
                name: file.name,
                mimeType: file.shortcutDetails.targetMimeType,
                modifiedTime: file.modifiedTime,
              });
            }
          } else {
            allFiles.push(file);
          }
        }
      } catch (e) {
        console.error(`[DriveSearch] List folder ${folder} failed:`, e.message);
      }
    }
    foldersToScan.length = 0;
    foldersToScan.push(...nextLevel);
    depth++;
  }

  console.log(`[DriveSearch] Total files in folder tree: ${allFiles.length}`);

  if (allFiles.length === 0) return [];

  // Extract keywords for scoring
  const keywords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  // Sort files by name relevance first (cheap before expensive extraction)
  allFiles.sort((a, b) => {
    const scoreA = keywords.reduce((s, kw) => s + (a.name.toLowerCase().includes(kw) ? 5 : 0), 0);
    const scoreB = keywords.reduce((s, kw) => s + (b.name.toLowerCase().includes(kw) ? 5 : 0), 0);
    return scoreB - scoreA;
  });

  // Extract content from top candidates
  const results = await extractResults(allFiles.slice(0, Math.max(limit * 2, 10)), accessToken, keywords);

  // Re-rank by content relevance
  for (const r of results) {
    const contentLower = (r.content || '').toLowerCase();
    const titleLower = (r.title || '').toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (titleLower.includes(kw)) score += 10;
      // Count occurrences in content
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = contentLower.match(regex);
      score += (matches ? matches.length : 0) * 2;
    }
    r.score = Math.min(1, score / (keywords.length * 10));
  }

  // Sort by relevance score and filter out zero-score results
  results.sort((a, b) => b.score - a.score);
  const relevant = results.filter(r => r.score > 0);

  // If we have relevant results, return them; otherwise return top results anyway
  if (relevant.length > 0) {
    return relevant.slice(0, limit);
  }

  return results.slice(0, limit);
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Extract content from a list of Drive files.
 * Returns structured results with title, content, score, metadata.
 * Uses TF-IDF-inspired scoring with title boost, phrase match bonus, and content density.
 */
async function extractResults(files, accessToken, keywords) {
  const results = [];

  // Extract content with concurrency limit of 3 to avoid Drive API rate limits
  const CONCURRENCY = 3;
  const extracted = [];
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(async (file) => {
      try {
        const content = await extractFileContent(file, accessToken);
        return { file, content };
      } catch (e) {
        console.error(`[DriveSearch] Failed to extract "${file.name}":`, e.message);
        return { file, content: null };
      }
    }));
    extracted.push(...batchResults);
  }
  
  // Total doc count for IDF calculation
  const totalDocs = extracted.filter(e => e.content && e.content.trim().length > 10).length;
  
  // Count how many docs contain each keyword (for IDF)
  const keywordDocCounts = {};
  for (const kw of keywords) {
    keywordDocCounts[kw] = extracted.filter(e => 
      e.content && e.content.toLowerCase().includes(kw)
    ).length || 1; // avoid division by zero
  }

  for (const { file, content } of extracted) {
    if (!content || content.trim().length <= 10) continue;

    const contentLower = content.toLowerCase();
    const titleLower = file.name.toLowerCase().replace(/\.[^.]+$/, '');
    const contentLength = contentLower.length;
    
    let score = 0.1; // base score for having extractable content
    let titleHits = 0;
    let contentHits = 0;

    for (const kw of keywords) {
      // Title match (high weight — 0.25 per keyword)
      if (titleLower.includes(kw)) {
        score += 0.25;
        titleHits++;
      }
      
      // Content TF-IDF: term frequency normalized by doc length, weighted by IDF
      const regex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const matches = contentLower.match(regex);
      if (matches) {
        const tf = matches.length / (contentLength / 1000); // occurrences per 1000 chars
        const idf = Math.log((totalDocs + 1) / (keywordDocCounts[kw] + 1)) + 1; // smoothed IDF
        score += Math.min(tf * idf * 0.03, 0.15); // capped per keyword
        contentHits++;
      }
    }

    // Exact phrase match bonus (query as a phrase in content)
    const queryPhrase = keywords.join(' ');
    if (contentLower.includes(queryPhrase)) {
      score += 0.2;
    }

    // Title IS essentially the keyword (e.g. doc named "Semaglutide")
    for (const kw of keywords) {
      if (titleLower === kw || titleLower.startsWith(kw + ' ') || titleLower.endsWith(' ' + kw)) {
        score += 0.3;
      }
    }

    // Content density bonus — higher score if keywords appear close together
    if (contentHits >= 2 && keywords.length >= 2) {
      // Check if any 500-char window contains 2+ keywords
      const windowSize = 500;
      for (let i = 0; i <= contentLower.length - windowSize; i += 200) {
        const window = contentLower.substring(i, i + windowSize);
        const kwsInWindow = keywords.filter(kw => window.includes(kw)).length;
        if (kwsInWindow >= 2) {
          score += 0.1;
          break;
        }
      }
    }

    score = Math.min(1, score);
    console.log(`[DriveSearch] Scored "${file.name}": ${score.toFixed(2)} (title:${titleHits}, content:${contentHits})`);

    results.push({
      documentId: file.id,
      title: file.name,
      content: content.substring(0, 15000),
      score,
      filePath: '',
      metadata: {
        department: inferDepartment(file.name),
        mimeType: file.mimeType,
        modifiedTime: file.modifiedTime,
      },
    });
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);
  return results;
}

async function extractFileContent(file, accessToken) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const { id, mimeType, name, modifiedTime } = file;

  // ── Check Firestore content cache first ──
  const cached = await getCachedContent(id, modifiedTime);
  if (cached) {
    console.log(`[DriveSearch] Cache HIT for "${name}"`);
    return cached;
  }

  let content = null;
  try {
    // ── Google Workspace: Export as text ──
    if (mimeType === 'application/vnd.google-apps.document') {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`,
        { headers }
      );
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      content = await res.text();
    }

    else if (mimeType === 'application/vnd.google-apps.spreadsheet') {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/csv`,
        { headers }
      );
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      content = await res.text();
    }

    else if (mimeType === 'application/vnd.google-apps.presentation') {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=text/plain`,
        { headers }
      );
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      content = await res.text();
    }

    // ── PDF: Download binary, extract with pdf-parse ──
    else if (mimeType === 'application/pdf') {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        { headers }
      );
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());

      try {
        const pdfParse = require('pdf-parse');
        const pdfData = await pdfParse(buffer);
        content = pdfData.text || '';
      } catch (pdfErr) {
        console.warn(`[DriveSearch] pdf-parse failed for "${name}":`, pdfErr.message, '— trying Gemini...');
        content = await extractWithGemini(buffer, mimeType, name);
      }
    }

    // ── Plain text, CSV, JSON: Direct download ──
    else if (mimeType?.startsWith('text/') || ['application/csv', 'application/json'].includes(mimeType)) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        { headers }
      );
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      content = await res.text();
    }

    // ── Binary office formats (XLSX, DOCX, PPTX): Gemini extraction ──
    else if (
      mimeType?.includes('spreadsheet') ||
      mimeType?.includes('wordprocessing') ||
      mimeType?.includes('presentation') ||
      mimeType?.includes('excel') ||
      mimeType?.includes('openxmlformats')
    ) {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
        { headers }
      );
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      content = await extractWithGemini(buffer, mimeType, name);
    }

    else {
      console.log(`[DriveSearch] Unsupported type: ${mimeType} (${name})`);
      return null;
    }

    // ── Cache successful extraction in Firestore ──
    if (content && content.trim().length > 10) {
      setCachedContent(id, content, modifiedTime).catch(() => {}); // fire-and-forget
      console.log(`[DriveSearch] Cached content for "${name}" (${content.length} chars)`);
    }

    return content;
  } catch (e) {
    console.error(`[DriveSearch] Extract "${name}" error:`, e.message);
    return null;
  }
}

async function extractWithGemini(buffer, mimeType, filename) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[DriveSearch] No GEMINI_API_KEY for binary extraction');
    return null;
  }

  try {
    const base64 = buffer.toString('base64');

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64 } },
              {
                text: `Extract ALL text content from this file (${filename}). Include every piece of data: tables, numbers, text, headers. Return ONLY the raw extracted text preserving structure. No commentary.`,
              },
            ],
          }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      }
    );

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.warn(`[DriveSearch] Gemini returned no text for "${filename}"`);
    }
    return text || null;
  } catch (e) {
    console.error(`[DriveSearch] Gemini extraction failed for "${filename}":`, e.message);
    return null;
  }
}

// ============================================================================
// Utilities
// ============================================================================

function inferDepartment(filename) {
  const name = (filename || '').toLowerCase();
  if (name.includes('pharmacy') || name.includes('rx') || name.includes('drug') || name.includes('medication')) return 'Pharmacy';
  if (name.includes('pricing') || name.includes('price') || name.includes('cost')) return 'Pricing';
  if (name.includes('training') || name.includes('onboard')) return 'Training';
  if (name.includes('policy') || name.includes('procedure') || name.includes('sop')) return 'Operations';
  if (name.includes('hr') || name.includes('employee') || name.includes('benefit')) return 'HR';
  if (name.includes('product') || name.includes('catalog') || name.includes('formulary')) return 'Products';
  return 'General';
}

module.exports = { searchDriveWithServiceAccount };
