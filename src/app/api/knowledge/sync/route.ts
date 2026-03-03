/**
 * Knowledge Base Sync API
 * 
 * POST /api/knowledge/sync - Trigger sync
 * DELETE /api/knowledge/sync - Clear and rebuild
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { KnowledgeBaseManager } from '@/services/knowledge';

// Trigger sync
export async function POST(request: NextRequest): Promise<NextResponse> {
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
    let userId: string;
    
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;

      // Check if user is admin
      const userDoc = await adminDb.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (userData?.role !== 'admin') {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json().catch(() => ({}));
    const { force = false } = body;

    console.log(`[KB Sync] Sync triggered by user ${userId}, force=${force}`);

    const kbManager = KnowledgeBaseManager.getInstance();

    // Check if sync is already in progress
    const status = await kbManager.getSyncStatus();
    if (status.status === 'syncing') {
      return NextResponse.json({
        success: false,
        message: 'Sync already in progress',
        status,
      });
    }

    // Trigger async sync (don't wait for completion)
    kbManager.triggerSync({ force }).then(result => {
      console.log('[KB Sync] Sync completed:', result);
    }).catch(error => {
      console.error('[KB Sync] Sync failed:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Sync started',
      status: await kbManager.getSyncStatus(),
    });

  } catch (error: any) {
    console.error('[KB API] Sync error:', error);
    return NextResponse.json(
      { error: error.message || 'Sync failed' },
      { status: 500 }
    );
  }
}

// Clear and rebuild KB
export async function DELETE(request: NextRequest): Promise<NextResponse> {
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
    let userId: string;
    
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;

      // Check if user is admin
      const userDoc = await adminDb.collection('users').doc(userId).get();
      const userData = userDoc.data();
      
      if (userData?.role !== 'admin') {
        return NextResponse.json(
          { error: 'Admin access required' },
          { status: 403 }
        );
      }
    } catch {
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    console.log(`[KB Sync] Rebuild triggered by user ${userId}`);

    const kbManager = KnowledgeBaseManager.getInstance();

    // Trigger async rebuild
    kbManager.rebuildKnowledgeBase().then(result => {
      console.log('[KB Sync] Rebuild completed:', result);
    }).catch(error => {
      console.error('[KB Sync] Rebuild failed:', error);
    });

    return NextResponse.json({
      success: true,
      message: 'Knowledge base rebuild started',
    });

  } catch (error: any) {
    console.error('[KB API] Rebuild error:', error);
    return NextResponse.json(
      { error: error.message || 'Rebuild failed' },
      { status: 500 }
    );
  }
}
