/**
 * Knowledge Base Documents API
 * 
 * GET /api/knowledge/documents - List documents
 * DELETE /api/knowledge/documents - Delete a document
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import { KnowledgeBaseManager } from '@/services/knowledge';

// List documents
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

    // Parse query params
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as any;
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const kbManager = KnowledgeBaseManager.getInstance();
    const { documents, total } = await kbManager.getAllDocuments({
      category,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      documents,
      total,
      limit,
      offset,
      hasMore: offset + documents.length < total,
    });

  } catch (error: any) {
    console.error('[KB API] List documents error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list documents' },
      { status: 500 }
    );
  }
}

// Delete document
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

    // Get document ID from query params
    const searchParams = request.nextUrl.searchParams;
    const documentId = searchParams.get('id');

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    const kbManager = KnowledgeBaseManager.getInstance();
    const deleted = await kbManager.deleteDocument(documentId);

    if (deleted) {
      return NextResponse.json({
        success: true,
        message: 'Document deleted successfully',
      });
    } else {
      return NextResponse.json(
        { error: 'Failed to delete document' },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('[KB API] Delete document error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete document' },
      { status: 500 }
    );
  }
}
