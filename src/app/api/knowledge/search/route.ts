/**
 * Knowledge Base Search API
 * 
 * POST /api/knowledge/search
 * 
 * Search the knowledge base with optional filters
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth } from '@/lib/firebaseAdmin';
import { RAGPipeline, KnowledgeBaseManager } from '@/services/knowledge';
import { searchDriveWithContent, getDriveAccessToken, searchDriveWithServiceAccount } from '@/services/knowledge/DriveSearchService';

// Force dynamic to avoid caching issues
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  console.log('[KB API] POST /api/knowledge/search called');
  
  try {
    // Verify authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('[KB API] No auth header');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    let userId: string = '';
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      userId = decoded.uid;
      console.log('[KB API] Token verified, user:', userId);
    } catch (authError: any) {
      console.log('[KB API] Invalid token:', authError.message);
      return NextResponse.json(
        { error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Parse request body - clone to avoid body consumption issues
    let body;
    try {
      const text = await request.text();
      body = JSON.parse(text);
      console.log('[KB API] Body parsed:', { query: body?.query?.substring(0, 50) });
    } catch (parseError: any) {
      console.log('[KB API] Body parse error:', parseError.message);
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const { 
      query,
      limit = 5,
      category,
      department,
      pharmacy,
      product,
      useRAG = false,
      conversationHistory,
    } = body;

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    const ragPipeline = RAGPipeline.getInstance();

    if (useRAG) {
      // Full RAG pipeline with AI response
      const response = await ragPipeline.process({
        query,
        filters: {
          category,
          department,
          pharmacy,
          product,
        },
        conversationHistory,
        maxResults: limit,
      });

      return NextResponse.json({
        success: true,
        ...response,
      });
    } else {
      // Quick search - just return KB results
      console.log('[KB API] Quick search for:', query);
      let results = await ragPipeline.quickSearch(query, limit);
      console.log('[KB API] Quick search found:', results.length, 'results');
      
      // FALLBACK: If no results from chunks, try searching documents directly
      if (results.length === 0) {
        console.log('[KB API] No chunks found, trying direct document search...');
        const { adminDb } = await import('@/lib/firebaseAdmin');
        
        try {
          // Get all documents and do simple keyword matching
          const docsSnapshot = await adminDb.collection('kb_documents').limit(100).get();
          
          if (!docsSnapshot.empty) {
            const queryLower = query.toLowerCase();
            const keywords = queryLower.split(/\s+/).filter((w: string) => w.length > 2);
            
            const directResults: any[] = [];
            
            docsSnapshot.forEach((doc: any) => {
              const data = doc.data();
              const title = (data.title || '').toLowerCase();
              const content = (data.content || '').toLowerCase();
              
              // Calculate simple relevance score
              let score = 0;
              for (const keyword of keywords) {
                if (title.includes(keyword)) score += 3;
                const contentMatches = (content.match(new RegExp(keyword, 'gi')) || []).length;
                score += Math.min(contentMatches, 5); // Cap content matches
              }
              
              if (score > 0) {
                directResults.push({
                  documentId: doc.id,
                  title: data.title,
                  content: data.content?.substring(0, 2000) || '', // Limit content size
                  score: Math.min(score / (keywords.length * 3), 1.0),
                  matchType: 'document',
                  filePath: data.sourcePath,
                  metadata: {
                    category: data.category,
                    department: data.department,
                  },
                });
              }
            });
            
            // Sort by score and limit
            directResults.sort((a: any, b: any) => b.score - a.score);
            results = directResults.slice(0, limit);
            console.log('[KB API] Direct document search found:', results.length, 'results');
          }
        } catch (docError: any) {
          console.error('[KB API] Direct document search failed:', docError.message);
        }
      }
      
      // FALLBACK 2: If still no results, try Direct Google Drive Search
      // Try SERVICE ACCOUNT first (always available), then user OAuth token
      if (results.length === 0) {
        console.log('[KB API] No indexed results, trying Service Account Drive Search...');
        try {
          const saResults = await searchDriveWithServiceAccount(query, limit);
          if (saResults.length > 0) {
            console.log('[KB API] Service Account Drive Search found:', saResults.length, 'results with content');
            results = saResults.map((dr: any) => ({
              ...dr,
              matchType: 'keyword' as const,
            }));
          }
        } catch (saError: any) {
          console.error('[KB API] Service Account Drive Search failed:', saError.message);
        }
      }
      
      // FALLBACK 3: If SA search also failed, try user OAuth token
      if (results.length === 0 && userId) {
        console.log('[KB API] SA empty, trying user OAuth Drive Search...');
        try {
          const driveToken = await getDriveAccessToken(userId);
          if (driveToken) {
            const driveResults = await searchDriveWithContent(driveToken, query, limit);
            if (driveResults.length > 0) {
              console.log('[KB API] User OAuth Drive Search found:', driveResults.length, 'results with content');
              results = driveResults.map((dr: any) => ({
                ...dr,
                matchType: 'keyword' as const,
              }));
            }
          }
        } catch (driveError: any) {
          console.error('[KB API] User OAuth Drive Search failed:', driveError.message);
        }
      }

      return NextResponse.json({
        success: true,
        results,
        count: results.length,
        ...(results.length === 0 ? await (async () => {
          try {
            const kbManager = KnowledgeBaseManager.getInstance();
            const health = await kbManager.healthCheck();
            if (!health.healthy) {
              return { warning: 'Knowledge Base may need attention', issues: health.issues };
            }
          } catch { /* ignore */ }
          return {};
        })() : {}),
      });
    }

  } catch (error: any) {
    console.error('[KB API] Search error:', error);
    console.error('[KB API] Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Search failed', stack: error.stack },
      { status: 500 }
    );
  }
}

// GET endpoint for simple searches
export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get('q');
  const limit = parseInt(searchParams.get('limit') || '5');

  if (!query) {
    return NextResponse.json(
      { error: 'Query parameter "q" is required' },
      { status: 400 }
    );
  }

  try {
    const ragPipeline = RAGPipeline.getInstance();
    const results = await ragPipeline.quickSearch(query, limit);

    return NextResponse.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error: any) {
    console.error('[KB API] Search error:', error);
    return NextResponse.json(
      { error: error.message || 'Search failed' },
      { status: 500 }
    );
  }
}
