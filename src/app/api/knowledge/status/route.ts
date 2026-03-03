/**
 * Knowledge Base Status API
 * 
 * GET /api/knowledge/status - Get KB status and stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { KnowledgeBaseManager } from '@/services/knowledge';

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    try {
      await adminAuth.verifyIdToken(token);
    } catch {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    const kbManager = KnowledgeBaseManager.getInstance();

    // Get status and stats in parallel
    const [syncStatus, stats, health] = await Promise.all([
      kbManager.getSyncStatus(),
      kbManager.getStats(),
      kbManager.healthCheck(),
    ]);

    return NextResponse.json({
      success: true,
      syncStatus,
      stats,
      health,
      configuration: {
        rootFolderId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID || null,
        syncIntervalMinutes: parseInt(process.env.KB_SYNC_INTERVAL_MINUTES || '60'),
        maxDocuments: parseInt(process.env.KB_MAX_DOCUMENTS || '500'),
        embeddingModel: process.env.KB_EMBEDDING_MODEL || 'text-embedding-3-small',
        minRelevanceScore: parseFloat(process.env.KB_MIN_RELEVANCE_SCORE || '0.7'),
        webSearchFallback: process.env.KB_WEB_SEARCH_FALLBACK === 'true',
      },
    });

  } catch (error: any) {
    console.error('[KB API] Status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get status' },
      { status: 500 }
    );
  }
}
