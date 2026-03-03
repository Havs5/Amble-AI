/**
 * Knowledge Route Handler
 * 
 * Handles /api/knowledge/* endpoints for RAG functionality.
 * Includes Google Drive search via service account as fallback.
 * 
 * BULLETPROOF: Lazy-loads pdf-parse, wraps every operation in try-catch,
 * always returns a JSON response (never 502).
 */

const OpenAI = require('openai');
const admin = require('firebase-admin');
// NOTE: pdf-parse is LAZY-LOADED inside functions, not at module top level,
// to prevent module initialization crashes that cause 502 errors.
const { searchDriveWithServiceAccount } = require('../services/driveSearchService');

// ============================================================================
// Ingest Document Handler
// ============================================================================

async function handleKnowledgeIngest(req, res, { adminDb, writeJson, readJsonBody }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
    }
    
    const body = await readJsonBody(req);
    const { fileBase64, filename, userId, projectId } = body;

    if (!fileBase64 || !userId) {
      return writeJson(res, 400, { error: 'fileBase64 and userId are required' });
    }

    // Parse text content
    const buffer = Buffer.from(fileBase64, 'base64');
    let textContent = '';

    if (filename?.toLowerCase().endsWith('.pdf')) {
      const pdf = require('pdf-parse');
      const pdfData = await pdf(buffer);
      textContent = pdfData.text;
    } else {
      // Assume text/md
      textContent = buffer.toString('utf-8');
    }

    if (!textContent?.trim()) {
      return writeJson(res, 400, { error: 'No text extracted from file' });
    }

    // Chunk text (overlapping window)
    const CHUNK_SIZE = 1000;
    const OVERLAP = 200;
    const chunks = [];
    
    const cleanText = textContent.replace(/\s+/g, ' ').trim();
    
    for (let i = 0; i < cleanText.length; i += (CHUNK_SIZE - OVERLAP)) {
      const chunk = cleanText.slice(i, i + CHUNK_SIZE);
      if (chunk.length < 50) continue;
      chunks.push(chunk);
    }

    console.log(`[RAG] Ingesting ${filename}: ${chunks.length} chunks`);

    // Save master document
    const docRef = adminDb.collection('documents').doc();
    await docRef.set({
      title: filename,
      content: textContent,
      projectId: projectId || null,
      userId,
      createdAt: Date.now(),
      vectorStatus: 'indexed',
      chunkCount: chunks.length
    });

    // Generate embeddings & store
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const batchSize = 10;
    let storedCount = 0;

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: batch,
      });

      const dbBatch = adminDb.batch();
      
      embeddingResponse.data.forEach((item, index) => {
        const vector = item.embedding;
        const chunkText = batch[index];
        
        const ref = adminDb.collection('knowledge_vectors').doc();
        dbBatch.set(ref, {
          userId,
          projectId: projectId || null,
          docId: docRef.id,
          filename,
          text: chunkText,
          embedding: admin.firestore.FieldValue.vector(vector),
          chunkIndex: i + index,
          totalChunks: chunks.length,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          metadata: { source: 'user_upload' }
        });
      });

      await dbBatch.commit();
      storedCount += batch.length;
    }

    return writeJson(res, 200, { success: true, chunks: storedCount, filename, docId: docRef.id });

  } catch (e) {
    console.error('Error in knowledge ingest handler:', e);
    return writeJson(res, 500, { error: e.message || 'Ingestion failed' });
  }
}

// ============================================================================
// Search Knowledge Base Handler
// ============================================================================

async function handleKnowledgeSearch(req, res, { adminDb, writeJson, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const { query, userId, projectId, limit = 5 } = body;

    if (!query || !userId) {
      return writeJson(res, 400, { error: 'query and userId are required' });
    }

    // This calls the existing searchKnowledgeBase service
    const { searchKnowledgeBase } = require('../services/knowledgeService');
    const results = await searchKnowledgeBase(adminDb, query, userId, projectId, limit);

    return writeJson(res, 200, { results });

  } catch (e) {
    console.error('Error in knowledge search handler:', e);
    return writeJson(res, 500, { error: e.message || 'Search failed' });
  }
}

// ============================================================================
// Firestore KB Search Helper
// ============================================================================

async function searchFirestore(adminDb, query, limit = 5) {
  const results = [];

  try {
    let docsSnapshot = await adminDb.collection('kb_documents').limit(500).get();
    if (docsSnapshot.empty) {
      docsSnapshot = await adminDb.collection('kb_chunks').limit(500).get();
    }

    if (docsSnapshot.empty) {
      console.log('[KB Search] No Firestore KB collections found');
      return [];
    }

    console.log('[KB Search] Found', docsSnapshot.size, 'docs in Firestore');

    // Try embedding-based search first
    let queryEmbedding = null;
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 10000,
          maxRetries: 1,
        });
        const embeddingResponse = await openai.embeddings.create({
          model: 'text-embedding-3-small',
          input: query,
        });
        queryEmbedding = embeddingResponse.data[0].embedding;
      } catch (embeddingError) {
        console.log('[KB Search] Embedding failed:', embeddingError.message);
      }
    }

    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    docsSnapshot.forEach(doc => {
      const data = doc.data();
      let score = 0;

      if (queryEmbedding && data.embedding && Array.isArray(data.embedding)) {
        let dotProduct = 0, normA = 0, normB = 0;
        for (let i = 0; i < queryEmbedding.length; i++) {
          dotProduct += queryEmbedding[i] * data.embedding[i];
          normA += queryEmbedding[i] * queryEmbedding[i];
          normB += data.embedding[i] * data.embedding[i];
        }
        score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      } else {
        const content = (data.content || '').toLowerCase();
        const title = (data.documentName || data.title || '').toLowerCase();
        const titleNoExt = title.replace(/\.[^.]+$/, ''); // strip extension
        let matches = 0;
        for (const word of queryWords) {
          if (content.includes(word)) matches += 1;
          if (title.includes(word)) matches += 3; // Strong title bonus
        }
        // Bonus: title essentially IS the search term (e.g. doc "Semaglutide" for query "semaglutide")
        const queryLower = query.toLowerCase().trim();
        if (titleNoExt === queryLower || titleNoExt.startsWith(queryLower + ' ') || titleNoExt.endsWith(' ' + queryLower)) {
          matches += queryWords.length * 4; // Major exact-title bonus
        }
        score = Math.min(1, matches / (queryWords.length * 2));
      }

      if (score >= 0.3) {
        results.push({
          documentId: data.documentId || doc.id,
          title: data.documentName || data.title || 'Untitled',
          content: data.content || '',
          score,
          filePath: data.sourcePath || '',
          metadata: { department: data.department, category: data.category },
        });
      }
    });

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  } catch (err) {
    console.error('[KB Search] Firestore search error:', err.message);
    return [];
  }
}

// ============================================================================
// Vector KB Search Handler (for RAG pipeline) — BULLETPROOF
// ============================================================================

async function handleVectorKBSearch(req, res, { adminDb, writeJson, readJsonBody }) {
  console.log('[KB Search] ═══════════════════════════════════════════');
  console.log('[KB Search] POST /api/knowledge/search called');
  console.log('[KB Search] Time:', new Date().toISOString());
  
  // Safety: always respond within 30 seconds
  let responded = false;
  const safetyTimer = setTimeout(() => {
    if (!responded) {
      responded = true;
      console.error('[KB Search] ⏰ Safety timeout reached (30s) — returning empty results');
      try {
        return writeJson(res, 200, {
          success: true,
          results: [],
          count: 0,
          source: 'timeout',
          error: 'Search timed out — try a more specific query',
        });
      } catch (e) {
        // Headers may already be sent
      }
    }
  }, 30000);

  try {
    // ── Auth ──
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      responded = true;
      clearTimeout(safetyTimer);
      console.log('[KB Search] No auth header');
      return writeJson(res, 401, { error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    try {
      await admin.auth().verifyIdToken(token);
      console.log('[KB Search] ✅ Token verified');
    } catch (authError) {
      responded = true;
      clearTimeout(safetyTimer);
      console.log('[KB Search] ❌ Invalid token:', authError.message);
      return writeJson(res, 401, { error: 'Invalid token' });
    }

    // ── Parse body ──
    let body;
    try {
      body = await readJsonBody(req);
    } catch (bodyError) {
      responded = true;
      clearTimeout(safetyTimer);
      console.error('[KB Search] ❌ Body parse failed:', bodyError.message);
      return writeJson(res, 400, { error: 'Invalid request body' });
    }

    const { query, limit = 5 } = body;

    if (!query || typeof query !== 'string') {
      responded = true;
      clearTimeout(safetyTimer);
      return writeJson(res, 400, { error: 'Query is required' });
    }

    console.log('[KB Search] Query:', query.substring(0, 100));
    console.log('[KB Search] Limit:', limit);

    // ══════════════════════════════════════════════════════════════
    // PARALLEL SEARCH: Firestore KB + Google Drive (for best coverage)
    // Each wrapped in its own try-catch to prevent one failure from
    // killing the entire search.
    // ══════════════════════════════════════════════════════════════

    const t0 = Date.now();

    const firestorePromise = searchFirestore(adminDb, query, limit).catch(err => {
      console.error('[KB Search] ❌ Firestore search failed:', err.message);
      return [];
    });

    const drivePromise = searchDriveWithServiceAccount(query, limit).catch(err => {
      console.error('[KB Search] ❌ Drive search failed:', err.message);
      return [];
    });

    const [firestoreResults, driveResults] = await Promise.all([firestorePromise, drivePromise]);
    
    const elapsed = Date.now() - t0;
    console.log(`[KB Search] Firestore: ${firestoreResults.length} results, Drive: ${driveResults.length} results (${elapsed}ms)`);

    // ── Merge and deduplicate ──
    const normalizeTitle = (t) => (t || '').toLowerCase().replace(/\.[^.]+$/, '').replace(/\s+/g, '');
    const seenTitles = new Set();
    const allResults = [];

    // Drive results first (most current, real-time from docs)
    for (const r of driveResults) {
      const key = normalizeTitle(r.title);
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        allResults.push(r);
      }
    }

    // Then Firestore results (cached/indexed)
    for (const r of firestoreResults) {
      const key = normalizeTitle(r.title);
      if (!seenTitles.has(key)) {
        seenTitles.add(key);
        allResults.push(r);
      }
    }

    // Sort by score and limit
    allResults.sort((a, b) => b.score - a.score);
    const finalResults = allResults.slice(0, limit);
    const source = driveResults.length > 0 ? 'google_drive' : (firestoreResults.length > 0 ? 'firestore' : 'none');
    
    console.log(`[KB Search] ✅ Returning ${finalResults.length} merged results (source: ${source}, ${elapsed}ms)`);
    if (finalResults.length > 0) {
      console.log('[KB Search] Top results:', finalResults.map(r => `"${r.title}" (${r.score?.toFixed(2)})`).join(', '));
    }

    if (!responded) {
      responded = true;
      clearTimeout(safetyTimer);
      return writeJson(res, 200, {
        success: true,
        results: finalResults,
        count: finalResults.length,
        source,
      });
    }

  } catch (e) {
    console.error('[KB Search] ❌ UNHANDLED ERROR:', e);
    console.error('[KB Search] Stack:', e?.stack);
    if (!responded) {
      responded = true;
      clearTimeout(safetyTimer);
      return writeJson(res, 200, {
        success: true,
        results: [],
        count: 0,
        source: 'error',
        error: e?.message || 'Search failed',
      });
    }
  }
}

module.exports = { handleKnowledgeIngest, handleKnowledgeSearch, handleVectorKBSearch };
