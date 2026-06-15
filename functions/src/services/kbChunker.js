/**
 * Structure-aware chunker for KB ingest.
 *
 * Splits on natural boundaries (paragraphs → lines → sentences) and packs them
 * into ~target-sized chunks with overlap, so an answer tends to live inside one
 * self-contained chunk (see SOURCE_OF_TRUTH §8.5, layer 3). Char-based as a
 * cheap proxy for tokens (~4 chars/token): 2800 chars ≈ 700 tokens.
 */

const TARGET = 2800;   // ~700 tokens
const MAX = 3600;      // hard cap per chunk
const OVERLAP = 400;   // ~100 tokens of carry-over for context continuity
const MIN = 60;        // drop noise fragments

function splitOversized(block) {
  // Break a too-large block on sentence boundaries, falling back to hard slices.
  const parts = block.split(/(?<=[.!?])\s+(?=[A-Z0-9])/);
  const out = [];
  let buf = '';
  for (const p of parts) {
    if ((buf + ' ' + p).length > MAX && buf) { out.push(buf.trim()); buf = ''; }
    if (p.length > MAX) {
      for (let i = 0; i < p.length; i += MAX) out.push(p.slice(i, i + MAX).trim());
    } else {
      buf = buf ? `${buf} ${p}` : p;
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

/**
 * @param {string} text  raw extracted document text
 * @returns {string[]}   ordered chunks
 */
function chunkText(text) {
  const clean = String(text || '').replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];

  // Primary split on blank-line paragraph boundaries; very long paragraphs
  // (e.g. CSV/table dumps) get sentence-split so no single block blows the cap.
  const blocks = [];
  for (const para of clean.split(/\n\s*\n/)) {
    const p = para.trim();
    if (!p) continue;
    if (p.length > MAX) blocks.push(...splitOversized(p));
    else blocks.push(p);
  }

  const chunks = [];
  let buf = '';
  for (const b of blocks) {
    if (buf && (buf.length + 2 + b.length) > TARGET) {
      chunks.push(buf.trim());
      // Start the next chunk with a tail-overlap of the previous one.
      const tail = buf.slice(-OVERLAP);
      const cut = tail.indexOf(' ');
      buf = (cut > 0 ? tail.slice(cut + 1) : tail) + '\n\n' + b;
    } else {
      buf = buf ? `${buf}\n\n${b}` : b;
    }
  }
  if (buf.trim()) chunks.push(buf.trim());

  return chunks.filter((c) => c.length >= MIN);
}

module.exports = { chunkText, TARGET, OVERLAP };
