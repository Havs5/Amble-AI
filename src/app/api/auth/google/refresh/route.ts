import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    let refreshToken = body.refreshToken;
    const userId = body.userId;

    // If userId provided but no refreshToken, fetch from Firestore
    if (!refreshToken && userId) {
      try {
        const tokenDoc = await adminDb.collection('google_drive_tokens').doc(userId).get();
        if (tokenDoc.exists) {
          const data = tokenDoc.data();
          refreshToken = data?.refreshToken;
          
          // If token is still valid (not expired), return existing access token
          if (data?.accessToken && data?.expiresAt > Date.now()) {
            console.log('[Token Refresh] Existing token still valid, returning it');
            return NextResponse.json({
              accessToken: data.accessToken,
              expiresIn: Math.floor((data.expiresAt - Date.now()) / 1000),
            });
          }
        }
      } catch (dbErr) {
        console.error('[Token Refresh] Error fetching from Firestore:', dbErr);
      }
    }

    if (!refreshToken) {
      return NextResponse.json({ error: 'No refresh token available' }, { status: 400 });
    }

    // Exchange refresh token for new access token
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        grant_type: 'refresh_token',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('[Token Refresh] Google OAuth error:', tokenData);
      return NextResponse.json(
        { error: tokenData.error_description || tokenData.error },
        { status: 401 }
      );
    }

    // Save new access token to Firestore if userId provided
    if (userId && tokenData.access_token) {
      try {
        await adminDb.collection('google_drive_tokens').doc(userId).update({
          accessToken: tokenData.access_token,
          expiresAt: Date.now() + (tokenData.expires_in || 3600) * 1000,
          updatedAt: Date.now(),
        });
        console.log('[Token Refresh] New token saved to Firestore for user:', userId);
      } catch (updateErr) {
        console.error('[Token Refresh] Error updating Firestore:', updateErr);
      }
    }

    return NextResponse.json({
      accessToken: tokenData.access_token,
      expiresIn: tokenData.expires_in || 3600,
    });
  } catch (error: any) {
    console.error('Token refresh error:', error);
    return NextResponse.json({ error: 'Failed to refresh token' }, { status: 500 });
  }
}
