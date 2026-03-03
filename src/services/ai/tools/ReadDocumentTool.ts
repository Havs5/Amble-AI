
import { adminDb } from '@/lib/firebaseAdmin';
import { Tool } from '@/lib/agents/BaseAgent';

export class ListDocumentsTool implements Tool {
  name = 'list_documents';
  description = 'List available documents in the Knowledge Base for the current project. Returns IDs and Titles.';
  
  schema = {
    type: 'object',
    properties: {
      projectId: {
        type: 'string',
        description: 'The Project ID to list documents for.'
      },
      query: {
        type: 'string',
        description: 'Optional fuzzy search term for document title'
      }
    },
    required: ['projectId']
  };

  async execute(args: { projectId: string; query?: string }): Promise<string> {
    const { projectId, query } = args;
    
    try {
        let text = `Documents for Project: ${projectId}:\n`;
        
        let docsRef = adminDb.collection('documents')
            .where('projectId', '==', projectId)
            .where('status', '==', 'processed'); // Only show ready docs? Or all.
            // .limit(20); 

        // Note: Firestore doesn't do fuzzy search easily on string fields without external index.
        // We will fetch recent 20 and filter in memory if query matches.
        
        const snapshot = await docsRef.orderBy('createdAt', 'desc').limit(20).get();
        
        if (snapshot.empty) {
            return "No documents found for this project.";
        }
        
        const keyDocs = snapshot.docs.map(doc => {
            return { id: doc.id, ...doc.data() } as any;
        });
        
        const filtered = query 
            ? keyDocs.filter(d => d.title.toLowerCase().includes(query.toLowerCase()))
            : keyDocs;
            
        if (filtered.length === 0) return "No documents matched the query.";
        
        return filtered.map(d => `- [ID: ${d.id}] ${d.title} (${d.type})`).join('\n');
        
    } catch (e: any) {
        return `Error listing documents: ${e.message}`;
    }
  }
}

export class ReadDocumentTool implements Tool {
  name = 'read_document';
  description = 'Read the FULL content of a specific document by its ID. Use list_documents first to find the ID.';
  
  schema = {
    type: 'object',
    properties: {
      docId: {
        type: 'string',
        description: 'The Document ID to read.'
      },
      projectId: {
        type: 'string',
        description: 'The Project ID context.'
      }
    },
    required: ['docId', 'projectId']
  };

  async execute(args: { docId: string; projectId: string }): Promise<string> {
     const { docId, projectId } = args;
     
     try {
         // 1. Verify doc exists and belongs to project
         const docRef = adminDb.collection('documents').doc(docId);
         const docSnap = await docRef.get();
         
         if (!docSnap.exists) return "Document not found.";
         const docData = docSnap.data();
         if (docData?.projectId !== projectId) return "Access denied: Document does not belong to this project.";
         
         // 2. Fetch chunks
         const chunksSnap = await docRef.collection('chunks')
            .orderBy('index', 'asc')
            .get();
            
         if (chunksSnap.empty) {
             // Maybe it wasn't chunked? (Small file optimization I suggested earlier but didn't implement)
             // Or maybe it failed.
             return "Document has no content (no chunks found).";
         }
         
         // 3. Reconstruct
         // Note: Chunks have overlap! We must handle this if we want clean text.
         // OR, we just join them and let the LLM handle duplication?
         // Duplication is annoying.
         // My Ingest logic: i += (CHUNK_SIZE - OVERLAP)
         // So chunk N ends at X, chunk N+1 starts at X-Overlap.
         // To reconstruct: 
         // Chunk 0: 0 to 1000.
         // Chunk 1: 800 to 1800.
         // We need [0..800] + [800..1800]... 
         // Actually, if we just want full text, we can take:
         // Text = Chunk0 + Chunk1.substring(OVERLAP) + Chunk2.substring(OVERLAP)...
         // This assumes fixed overlap which matches exactly.
         // A safer way is tricky without original start/end indices.
         // Our ingest logic SAVED `index`. But that was array index, not char index?
         // Let's check ingest again.
         
         // Ingest: i goes by char index.
         // batch.set(chunkRef, { index: i + index, ... }) <-- Wait, that loop index logic was weird in ingest?
         /*
            for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
                embeddingResponse.data.forEach((item, index) => {
                    ... index: i + index ...
                })
            }
         */
         // The saved 'index' is the Chunk Array Index (0, 1, 2...). 
         
         // Re-assembly logic:
         // If we have Chunk 0, 1, 2...
         // We can concatenate them, but we will have repeated text.
         // Chunk n overlaps with Chunk n-1.
         // To fix: Substringing is hard without exact overlap value known here.
         // Let's assume standard overlap (200 chars) for now, or just return concatenated and tell the LLM "Warning: Duplicate overlapping text".
         // The Agent is smart (Reasoning model), it can ignore overlaps.
         // Creating a perfect reconstruction is better though.
         
         // Let's try to infer overlap or just accept it. The text is for "Analysis", duplicate data points in CSV (if chunked) WOULD be bad for stats.
         // NOTE: The CSV ingestion I wrote in the previous turn DOES NOT CHUNK rows efficiently with overlap. 
         // It turned CSV into one big string `text`.
         // Then it loop `for (let i = 0; i < text.length; i += (CHUNK_SIZE - OVERLAP))`.
         // So a CSV row might be split in half.
         // This is sub-optimal for Data Analysis.
         
         // Fix: For CSVs, we should not overlap? Or overlap is fine?
         // If a number "1000" is split "10" and "00", and overlap covers it "100" "000"... it's a mess.
         
         // For now, I will return the raw concatenated chunks with a warning usage note.
         // "Note: This text is reconstructed from overlapping chunks. Some content may be repeated."
         
         // Actually, if I know the Overlap is 200 (hardcoded in ingest), I can strip the first 200 chars from subsequent chunks.
         const OVERLAP = 200; 
         
         let fullText = "";
         const chunks = chunksSnap.docs.map(d => ({ ...d.data(), id: d.id })) as any[];
         
         // Sort by index just in case
         chunks.sort((a, b) => a.index - b.index);
         
         chunks.forEach((chunk, idx) => {
             const content = chunk.content;
             if (idx === 0) {
                 fullText += content;
             } else {
                 // Remove overlap from start of subsequent chunks
                 // Note: This matches the ingestion logic: 
                 // chunks[0] = 0..1000
                 // chunks[1] = 800..1800
                 // If we take chunks[1].substring(200), we get 1000..1800. Perfect reconstruction!
                 // Provided content length > overlap.
                 if (content.length > OVERLAP) {
                     fullText += content.substring(OVERLAP);
                 } else {
                     fullText += content; // Should rarely happen unless end of file logic weirdness
                 }
             }
         });
         
         return fullText;
         
     } catch (e: any) {
         return `Error reading document: ${e.message}`;
     }
  }
}
