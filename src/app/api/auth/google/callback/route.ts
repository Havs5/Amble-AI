import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const state = searchParams.get('state'); // User ID
  const error = searchParams.get('error');

  // Handle error from Google
  if (error) {
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '${error}' }, '*');
            window.close();
          </script>
          <p>Authentication failed. You can close this window.</p>
        </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }

  if (!code) {
    return NextResponse.json({ error: 'No authorization code provided' }, { status: 400 });
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL || 'https://amble-ai.web.app'}/api/auth/google/callback`,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head><title>Authentication Error</title></head>
          <body>
            <script>
              window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: '${tokenData.error_description || tokenData.error}' }, '*');
              window.close();
            </script>
            <p>Authentication failed. You can close this window.</p>
          </body>
        </html>`,
        {
          headers: { 'Content-Type': 'text/html' },
        }
      );
    }

    // Return success HTML that posts message to opener
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head><title>Authentication Successful</title></head>
        <body>
          <script>
            window.opener.postMessage({
              type: 'GOOGLE_OAUTH_SUCCESS',
              accessToken: '${tokenData.access_token}',
              refreshToken: '${tokenData.refresh_token || ''}',
              expiresIn: ${tokenData.expires_in || 3600}
            }, '*');
            window.close();
          </script>
          <p>Authentication successful! You can close this window.</p>
        </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  } catch (error: any) {
    console.error('OAuth callback error:', error);
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body>
          <script>
            window.opener.postMessage({ type: 'GOOGLE_OAUTH_ERROR', error: 'Server error during authentication' }, '*');
            window.close();
          </script>
          <p>Authentication failed. You can close this window.</p>
        </body>
      </html>`,
      {
        headers: { 'Content-Type': 'text/html' },
      }
    );
  }
}
