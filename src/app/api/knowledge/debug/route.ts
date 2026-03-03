/**
 * Knowledge Base Debug API
 * 
 * GET /api/knowledge/debug
 * 
 * Returns diagnostic information about the Knowledge Base status
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest): Promise<NextResponse> {
  console.log('[KB Debug] Checking Knowledge Base status...');
  
  try {
    // Check kb_documents collection
    const docsSnapshot = await adminDb.collection('kb_documents').limit(20).get();
    const documents = docsSnapshot.docs.map(doc => ({
      id: doc.id,
      title: doc.data().title,
      sourcePath: doc.data().sourcePath,
      category: doc.data().category,
      syncedAt: doc.data().syncedAt,
    }));
    
    // Check kb_chunks collection
    const chunksSnapshot = await adminDb.collection('kb_chunks').limit(20).get();
    const chunks = chunksSnapshot.docs.map(doc => ({
      id: doc.id,
      documentName: doc.data().documentName,
      chunkIndex: doc.data().chunkIndex,
      contentPreview: doc.data().content?.substring(0, 100) + '...',
      hasEmbedding: !!doc.data().embedding,
    }));
    
    // Check kb_sync_state
    const syncStateDoc = await adminDb.collection('kb_sync_state').doc('latest').get();
    const syncState = syncStateDoc.exists ? syncStateDoc.data() : null;
    
    // Get counts
    const docCount = await adminDb.collection('kb_documents').count().get();
    const chunkCount = await adminDb.collection('kb_chunks').count().get();
    
    const status = {
      timestamp: new Date().toISOString(),
      summary: {
        totalDocuments: docCount.data().count,
        totalChunks: chunkCount.data().count,
        hasData: docCount.data().count > 0,
      },
      syncState,
      sampleDocuments: documents,
      sampleChunks: chunks,
      environment: {
        rootFolderId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID?.substring(0, 10) + '...',
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasGeminiKey: !!process.env.GOOGLE_API_KEY,
      },
    };
    
    console.log('[KB Debug] Status:', JSON.stringify(status.summary));
    
    return NextResponse.json(status);
    
  } catch (error: any) {
    console.error('[KB Debug] Error:', error.message);
    return NextResponse.json(
      { 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
