const OpenAI = require('openai');

async function searchKnowledgeBase(adminDb, query, userId, projectId, limit = 5) {
  try {
      if (!process.env.OPENAI_API_KEY) return [];

      // 1. Generate query embedding
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: query,
      });
      const queryVector = embeddingResponse.data[0].embedding;

      // 2. Vector Search (using VectorField).
      // NOTE: we over-fetch (limit 40) and filter by owner/project IN APP, then
      // trim to `limit`. The previous code fetched only 5 then filtered, which
      // silently dropped valid hits when the 5 nearest belonged to other users.
      const coll = adminDb.collection('knowledge_vectors');

      const vectorQuery = coll.findNearest({
          vectorField: 'embedding',
          queryVector: queryVector,
          limit: 40,
          distanceMeasure: 'COSINE',
          distanceResultField: 'vector_distance',
      });

      const snapshot = await vectorQuery.get();

      const results = snapshot.docs.map(doc => {
          const data = doc.data();
          // Owner/project scoping (post-filter; over-fetch above preserves recall).
          if (projectId && data.projectId !== projectId) return null;
          if (!projectId && data.userId !== userId) return null;

          const dist = typeof data.vector_distance === 'number' ? data.vector_distance : 1;
          return {
              text: data.text,
              score: Math.max(0, 1 - dist), // COSINE distance → similarity
              filename: data.filename || data.title,
          };
      }).filter(Boolean);

      return results.slice(0, limit || 5);
  } catch (e) {
      console.warn("RAG Search failed (likely missing index):", e.message);
      return [];
  }
}

module.exports = { searchKnowledgeBase };
