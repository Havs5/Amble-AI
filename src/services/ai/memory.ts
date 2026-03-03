import { adminDb } from '@/lib/firebaseAdmin';
import OpenAI from 'openai';

// Initialize OpenAI client (singleton for performance)
let openaiInstance: OpenAI | null = null;
const getOpenAI = () => {
  if (!openaiInstance) {
    openaiInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || 'dummy',
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return openaiInstance;
};

// Simple in-memory cache for user memories (TTL: 5 minutes)
const memoriesCache = new Map<string, { memories: string[]; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export class MemoryService {
  
  /**
   * Retrieves specific user memories/facts to personalize the AI.
   * Uses caching and semantic search to find relevant memories for the current query.
   */
  static async retrieveRelevantMemories(userId: string, query: string): Promise<string> {
    if (!userId) return '';

    try {
      // Check cache first
      const cached = memoriesCache.get(userId);
      let allMemories: string[];
      
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        console.log('[Memory] Using cached memories');
        allMemories = cached.memories;
      } else {
        // Fetch from Firestore
        const memSnapshot = await adminDb.collection('users').doc(userId).collection('memories')
          .orderBy('createdAt', 'desc')
          .limit(50)
          .get();

        if (memSnapshot.empty) return '';

        allMemories = memSnapshot.docs.map(doc => doc.data().content as string);
        
        // Cache the result
        memoriesCache.set(userId, { memories: allMemories, timestamp: Date.now() });
        
        // Clean old cache entries
        if (memoriesCache.size > 100) {
          const now = Date.now();
          for (const [key, value] of memoriesCache.entries()) {
            if (now - value.timestamp > CACHE_TTL) {
              memoriesCache.delete(key);
            }
          }
        }
      }
      
      // If we have few memories, just return all of them
      if (allMemories.length <= 10) {
        return allMemories.map(m => `- ${m}`).join('\n');
      }

      // Simple Keyword/Semantic Filter (Client-side for now)
      const queryLower = query.toLowerCase();
      const relevant = allMemories.filter(mem => {
          const memLower = mem.toLowerCase();
          // Basic keyword matching overlap
          const keywords = queryLower.split(' ').filter(w => w.length > 4);
          return keywords.some(k => memLower.includes(k));
      });

      // If no keyword match, return most recent 5
      if (relevant.length === 0) {
        return allMemories.slice(0, 5).map(m => `- ${m}`).join('\n');
      }

      return relevant.slice(0, 10).map(m => `- ${m}`).join('\n');

    } catch (error) {
      console.error("[Memory] Failed to retrieve memories:", error);
      return '';
    }
  }
  
  /**
   * Invalidates the cache for a specific user (call after saving new memories)
   */
  static invalidateCache(userId: string) {
    memoriesCache.delete(userId);
  }

  /**
   * Extracts and saves new facts from a conversation turn.
   * This should be called asynchronously after a chat turn.
   */
  static async extractAndSaveMemories(userId: string, userMessage: string, aiReply: string) {
       if (!userId) return;

       // Heuristic: Only run extraction if user says meaningful things about themselves
       const triggerPhrases = ["i am", "i have", "my name", "i prefer", "i like", "remember", "don't forget"];
       const lowerMsg = userMessage.toLowerCase();
       if (!triggerPhrases.some(p => lowerMsg.includes(p))) return;

       try {
           const openai = getOpenAI();
           const extraction = await openai.chat.completions.create({
               model: 'gpt-4o-mini',
               messages: [
                   { role: 'system', content: "Extract permanent user facts/preferences from the message. Output JSON array of strings. If none, output []. Example: [\"User prefers Python\", \"User's name is John\"]" },
                   { role: 'user', content: userMessage }
               ],
               temperature: 0
           });

           const content = extraction.choices[0].message.content;
           const facts = JSON.parse(content || '[]');

           if (Array.isArray(facts) && facts.length > 0) {
               const batch = adminDb.batch();
               const memCol = adminDb.collection('users').doc(userId).collection('memories');
               
               facts.forEach(fact => {
                   const docRef = memCol.doc();
                   batch.set(docRef, {
                       content: fact,
                       createdAt: new Date(),
                       source: 'chat_extraction'
                   });
               });
               
               await batch.commit();
               console.log(`[Memory] Saved ${facts.length} new facts for user ${userId}`);
               
               // Invalidate cache so next retrieval fetches fresh data
               this.invalidateCache(userId);
           }

       } catch (e) {
           console.error("[Memory] Extraction failed:", e);
       }
  }
}
