/**
 * KB Vector Retrieval — the accurate, fast hot path (SOURCE_OF_TRUTH §8.5).
 *
 *   embed query (Vertex gemini-embedding-001, RETRIEVAL_QUERY)
 *     → Firestore findNearest (COSINE, top K)        [semantic recall]
 *     → lexical re-score of the same candidates       [keyword signal]
 *     → Reciprocal Rank Fusion of the two orderings    [hybrid]
 *     → Gemini-Flash cross-encoder-style rerank        [precision]
 *     → top-N self-contained chunks w/ scores          [for grounded gen]
 *
 * Pure read path. Returns [] on ANY failure so chat.js can fall back to the
 * legacy live-Drive search and never hard-fail.
 */

const { GoogleGenAI } = require('@google/genai');
const { embedQuery } = require('./embeddingService');

const COL = 'kb_vectors';   // Gemini-embedded company KB (separate from legacy OpenAI knowledge_vectors)
const CANDIDATE_K = 40;     // semantic recall pool
const RERANK_POOL = 15;     // how many candidates we send to the reranker
const RRF_K = 60;           // standard RRF constant
const MIN_SCORE = parseFloat(process.env.KB_MIN_RELEVANCE_SCORE || '0.35');

const RERANK_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const RERANK_MODEL = process.env.KB_RERANK_MODEL || 'gemini-2.5-flash';
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';

const STOP = new Set(['the','for','and','what','how','are','about','with','from','this','that','can','does','our','its','was','were','will','your','which','where','when','who','why','please','need','want','get','all','any']);
function keywords(q) {
  return (q || '').toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w));
}

let _ai = null;
function ai() {
  if (!_ai) _ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: RERANK_LOCATION });
  return _ai;
}

/** Vector KNN over knowledge_vectors. Returns candidate chunks with vectorScore. */
async function vectorCandidates(adminDb, queryVec) {
  const coll = adminDb.collection(COL);
  const vq = coll.findNearest({
    vectorField: 'embedding',
    queryVector: queryVec,
    limit: CANDIDATE_K,
    distanceMeasure: 'COSINE',
    distanceResultField: 'vector_distance',
  });
  const snap = await vq.get();
  return snap.docs.map((d) => {
    const data = d.data();
    const dist = typeof data.vector_distance === 'number' ? data.vector_distance : 1;
    return {
      id: d.id,
      fileId: data.fileId || data.docId || '',
      title: data.title || data.filename || 'Untitled',
      department: data.department || '',
      text: data.text || '',
      chunkIndex: data.chunkIndex ?? 0,
      modifiedTime: data.modifiedTime || '',
      vectorScore: Math.max(0, 1 - dist), // COSINE distance → similarity
    };
  });
}

/** Fuse semantic rank + lexical rank with Reciprocal Rank Fusion. */
function rrfFuse(candidates, query) {
  const kws = keywords(query);
  const phrase = kws.join(' ');

  // Semantic order = as returned by findNearest (already nearest-first).
  const semanticOrder = [...candidates];

  // Lexical order = re-score the same pool by keyword/title/phrase hits.
  const lexScored = candidates.map((c) => {
    const t = (c.text || '').toLowerCase();
    const title = (c.title || '').toLowerCase();
    let s = 0;
    for (const kw of kws) {
      if (title.includes(kw)) s += 3;
      const m = t.match(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'));
      if (m) s += Math.min(m.length, 5);
    }
    if (phrase && t.includes(phrase)) s += 5;
    return { c, s };
  });
  const lexicalOrder = lexScored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.c);

  const rank = new Map();
  semanticOrder.forEach((c, i) => rank.set(c.id, (rank.get(c.id) || 0) + 1 / (RRF_K + i + 1)));
  lexicalOrder.forEach((c, i) => rank.set(c.id, (rank.get(c.id) || 0) + 1 / (RRF_K + i + 1)));

  return candidates
    .map((c) => ({ ...c, fused: rank.get(c.id) || 0 }))
    .sort((a, b) => b.fused - a.fused);
}

/**
 * Gemini-Flash reranker — orders the top pool by true relevance to the query.
 * Returns chunks reordered; on any failure returns the input order unchanged.
 */
async function rerank(query, chunks) {
  if (chunks.length <= 1) return chunks;
  const pool = chunks.slice(0, RERANK_POOL);
  const list = pool.map((c, i) => `[${i}] (${c.title}) ${(c.text || '').replace(/\s+/g, ' ').slice(0, 480)}`).join('\n');
  const prompt = `You are a search reranker. Given a user QUERY and numbered passages, return the passage indices ordered from MOST to LEAST relevant for answering the query. Only include passages that are actually relevant. Respond with ONLY a JSON array of integers, e.g. [3,0,7].\n\nQUERY: ${query}\n\nPASSAGES:\n${list}`;
  try {
    const resp = await ai().models.generateContent({
      model: RERANK_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0, maxOutputTokens: 200 },
    });
    const raw = resp.text || '';
    const match = raw.match(/\[[\d,\s]*\]/);
    if (!match) return chunks;
    const order = JSON.parse(match[0]).filter((n) => Number.isInteger(n) && n >= 0 && n < pool.length);
    if (!order.length) return chunks;
    const seen = new Set();
    const reranked = [];
    for (const idx of order) { if (!seen.has(idx)) { seen.add(idx); reranked.push(pool[idx]); } }
    // Append any pool items the model dropped, then the untouched tail.
    pool.forEach((c, i) => { if (!seen.has(i)) reranked.push(c); });
    return [...reranked, ...chunks.slice(RERANK_POOL)];
  } catch (e) {
    console.warn('[KB] rerank failed, using fused order:', e?.message);
    return chunks;
  }
}

/**
 * Main entry. Returns { chunks, maxScore } where chunks are the top-N most
 * relevant, each { title, department, text, chunkIndex, score }.
 * @param {object} opts { limit=6, rerank=true }
 */
async function vectorRetrieve(adminDb, query, opts = {}) {
  const limit = opts.limit || 6;
  const useRerank = opts.rerank !== false;
  try {
    const queryVec = await embedQuery(query);
    if (!queryVec) return { chunks: [], maxScore: 0 };

    const candidates = await vectorCandidates(adminDb, queryVec);
    if (!candidates.length) return { chunks: [], maxScore: 0 };

    const fused = rrfFuse(candidates, query);
    const ordered = useRerank ? await rerank(query, fused) : fused;

    const chunks = ordered.slice(0, limit).map((c) => ({
      title: c.title,
      department: c.department,
      text: c.text,
      chunkIndex: c.chunkIndex,
      score: c.vectorScore,
    }));
    const maxScore = candidates.reduce((m, c) => Math.max(m, c.vectorScore), 0);
    return { chunks, maxScore };
  } catch (e) {
    console.warn('[KB] vectorRetrieve failed:', e?.message);
    return { chunks: [], maxScore: 0 };
  }
}

module.exports = { vectorRetrieve, MIN_SCORE };
