const OpenAI = require('openai');

async function searchKnowledgeBase(adminDb, query, userId, projectId) {
  try {
      if (!process.env.OPENAI_API_KEY) return [];

      // 1. Generate query embedding
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const embeddingResponse = await openai.embeddings.create({
          model: "text-embedding-3-small",
          input: query,
      });
      const queryVector = embeddingResponse.data[0].embedding;

      // 2. Vector Search (using VectorField)
      const coll = adminDb.collection('knowledge_vectors');
      
      const vectorQuery = coll.findNearest('embedding', queryVector, {
          limit: 5,
          distanceMeasure: 'COSINE'
      });

      // Apply pre-filter if projectId is present
      let finalQuery = vectorQuery;

      const snapshot = await finalQuery.get();
      
      const results = snapshot.docs.map(doc => {
          const data = doc.data();
          // Post-filter manually if index is missing (safer for MVP rollout)
          if (projectId && data.projectId !== projectId) return null;
          if (!projectId && data.userId !== userId) return null;
          
          return {
              text: data.text,
              score: 0, // SDK doesn't always return score in v1
              filename: data.filename
          };
      }).filter(Boolean);

      return results;
  } catch (e) {
      console.warn("RAG Search failed (likely missing index):", e.message);
      return [];
  }
}

module.exports = { searchKnowledgeBase };
