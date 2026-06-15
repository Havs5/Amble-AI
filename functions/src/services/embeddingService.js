/**
 * Vertex Embedding Service — gemini-embedding-001 @ 1536 dims.
 *
 * Single source of truth for KB embeddings (ingest + query). Uses Vertex AI
 * via ADC (the Cloud Function runtime SA with roles/aiplatform.user) — no API
 * key, same auth path as chat.js.
 *
 * Why these choices (see SOURCE_OF_TRUTH §8.5):
 *  - gemini-embedding-001 tops MTEB English, is native to our Vertex stack,
 *    and supports MRL output dims. We use 1536 (≤ Firestore's 2048 vector cap).
 *  - Asymmetric task types (RETRIEVAL_DOCUMENT vs RETRIEVAL_QUERY) measurably
 *    improve retrieval accuracy — documents and queries embed differently.
 *  - COSINE distance downstream, so we don't need to L2-normalize reduced dims.
 */

const { GoogleGenAI } = require('@google/genai');

const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 1536;
// Text embeddings are regional on Vertex; us-central1 hosts gemini-embedding-001.
const EMBED_LOCATION = process.env.VERTEX_EMBED_LOCATION || 'us-central1';
const PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';

let _ai = null;
function client() {
  if (!_ai) _ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: EMBED_LOCATION });
  return _ai;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Embed a single text. Returns number[EMBED_DIM] or null on failure. */
async function embedOne(text, taskType) {
  const input = String(text || '').slice(0, 8000); // model input cap guard
  if (!input.trim()) return null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const resp = await client().models.embedContent({
        model: EMBED_MODEL,
        contents: input,
        config: { taskType, outputDimensionality: EMBED_DIM },
      });
      // @google/genai returns either { embeddings: [{values}] } or { embedding: {values} }
      const values = resp?.embeddings?.[0]?.values || resp?.embedding?.values || null;
      if (Array.isArray(values) && values.length) return values;
      return null;
    } catch (e) {
      const transient = /429|503|500|deadline|timeout|unavailable/i.test(e?.message || '');
      if (attempt < 2 && transient) { await sleep(400 * (attempt + 1)); continue; }
      console.warn(`[Embed] embedOne failed (attempt ${attempt + 1}):`, e?.message);
      return null;
    }
  }
  return null;
}

/**
 * Embed many texts (document side). Concurrency-limited single calls —
 * gemini-embedding-001 on Vertex accepts one instance per request, so we
 * parallelize at the request level instead of batching instances.
 * Returns an array aligned to `texts` (nulls for any that failed).
 */
async function embedDocuments(texts, concurrency = 5) {
  const out = new Array(texts.length).fill(null);
  let i = 0;
  async function worker() {
    while (i < texts.length) {
      const idx = i++;
      out[idx] = await embedOne(texts[idx], 'RETRIEVAL_DOCUMENT');
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker));
  return out;
}

/** Embed a search query (query side). Returns number[EMBED_DIM] or null. */
async function embedQuery(text) {
  return embedOne(text, 'RETRIEVAL_QUERY');
}

module.exports = { embedDocuments, embedQuery, embedOne, EMBED_MODEL, EMBED_DIM, EMBED_LOCATION };
