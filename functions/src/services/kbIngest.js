/**
 * KB Vector Ingest — Drive → chunk → embed → knowledge_vectors.
 *
 * Incremental: per-file state in `kb_index_state/{fileId}` (last modifiedTime).
 * A run only re-embeds files whose Drive modifiedTime changed (or all, with
 * { full:true }). Time-budgeted so it stops cleanly before the 540s function
 * timeout and reports `incomplete` — re-running resumes where it left off.
 *
 * Storage schema (knowledge_vectors/{auto}):
 *   { fileId, title, department, text, chunkIndex, totalChunks, modifiedTime,
 *     source:'drive', embedding: Vector(1536), createdAt }
 */

const admin = require('firebase-admin');
const { getAuthToken, listAllKbFiles, extractFileContent, inferDepartment } = require('./driveSearchService');
const { chunkText } = require('./kbChunker');
const { embedDocuments } = require('./embeddingService');

const COL = 'kb_vectors';   // Gemini-embedded company KB (separate from legacy OpenAI knowledge_vectors)
const STATE = 'kb_index_state';
const SOFT_DEADLINE_MS = 480 * 1000; // stop starting new files after 8 min

async function deleteFileChunks(adminDb, fileId) {
  const snap = await adminDb.collection(COL).where('fileId', '==', fileId).get();
  if (snap.empty) return;
  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += 400) {
    const batch = adminDb.batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

async function writeChunks(adminDb, file, chunks, vectors) {
  const dept = inferDepartment(file.name);
  const valid = [];
  chunks.forEach((text, i) => {
    const vec = vectors[i];
    if (vec) valid.push({ text, vec, i });
  });

  for (let i = 0; i < valid.length; i += 400) {
    const batch = adminDb.batch();
    for (const { text, vec, i: idx } of valid.slice(i, i + 400)) {
      const ref = adminDb.collection(COL).doc();
      batch.set(ref, {
        fileId: file.id,
        title: file.name,
        department: dept,
        text,
        chunkIndex: idx,
        totalChunks: chunks.length,
        modifiedTime: file.modifiedTime || '',
        source: 'drive',
        embedding: admin.firestore.FieldValue.vector(vec),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return valid.length;
}

/**
 * @param {object} opts { full=false, maxFiles=300 }
 * @returns summary { filesScanned, filesIndexed, filesSkipped, chunks, incomplete, errors }
 */
async function reindexKb(adminDb, opts = {}) {
  const full = !!opts.full;
  const maxFiles = opts.maxFiles || 300;
  const startedAt = Date.now();

  let token;
  try {
    token = await getAuthToken();
  } catch (e) {
    return { error: `Drive auth failed: ${e.message}` };
  }

  const files = await listAllKbFiles(token);
  console.log(`[KBIngest] ${files.length} files in KB folder tree (full=${full})`);

  let filesIndexed = 0, filesSkipped = 0, totalChunks = 0, errors = 0, processed = 0;
  let incomplete = false;

  for (const file of files) {
    if (processed >= maxFiles) { incomplete = true; break; }
    if (Date.now() - startedAt > SOFT_DEADLINE_MS) { incomplete = true; break; }

    try {
      const stateRef = adminDb.collection(STATE).doc(file.id);
      if (!full) {
        const state = await stateRef.get();
        if (state.exists && state.data().modifiedTime && state.data().modifiedTime === file.modifiedTime) {
          filesSkipped++;
          continue;
        }
      }

      const content = await extractFileContent(file, token);
      if (!content || content.trim().length < 20) { filesSkipped++; continue; }

      const chunks = chunkText(content);
      if (!chunks.length) { filesSkipped++; continue; }

      const vectors = await embedDocuments(chunks);
      await deleteFileChunks(adminDb, file.id); // replace old chunks for this file
      const stored = await writeChunks(adminDb, file, chunks, vectors);

      await stateRef.set({
        fileId: file.id,
        title: file.name,
        modifiedTime: file.modifiedTime || '',
        chunkCount: stored,
        indexedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      filesIndexed++;
      totalChunks += stored;
      processed++;
      console.log(`[KBIngest] ✓ "${file.name}" → ${stored} chunks`);
    } catch (e) {
      errors++;
      processed++;
      console.error(`[KBIngest] ✗ "${file.name}":`, e.message);
    }
  }

  const summary = {
    filesScanned: files.length,
    filesIndexed,
    filesSkipped,
    chunks: totalChunks,
    errors,
    incomplete,
    elapsedMs: Date.now() - startedAt,
  };
  console.log('[KBIngest] Done:', JSON.stringify(summary));
  return summary;
}

module.exports = { reindexKb };
