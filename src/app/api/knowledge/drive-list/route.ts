/**
 * Drive List API - Lists files from Google Drive folder
 * 
 * GET /api/knowledge/drive-list?folderId=xxx
 * 
 * This endpoint lists files from a Google Drive folder for the knowledge base explorer.
 * It supports both user OAuth tokens (from Firestore) and service account tokens.
 * 
 * Uses GET to avoid request body consumption issues with Next.js SSR on Cloud Functions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

// Google Drive API base
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

// Root folder ID for knowledge base
const ROOT_FOLDER_ID = process.env.NEXT_PUBLIC_GOOGLE_DRIVE_ROOT_FOLDER_ID || '1dScQA7J2EbQw90zJnItUnJT2izPzyCL7';

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  webContentLink?: string;
  thumbnailLink?: string;
  iconLink?: string;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    // Verify Firebase authentication
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const firebaseToken = authHeader.substring(7);
    let userId: string;
    
    try {
      const decoded = await adminAuth.verifyIdToken(firebaseToken);
      userId = decoded.uid;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get folder ID from query params
    const folderId = request.nextUrl.searchParams.get('folderId');
    const targetFolderId = folderId || ROOT_FOLDER_ID;
    
    // Get Google Drive access token from Firestore (stored during Google OAuth sign-in)
    let accessToken: string | null = null;
    
    try {
      const tokenDoc = await adminDb.collection('google_drive_tokens').doc(userId).get();
      if (tokenDoc.exists) {
        const tokenData = tokenDoc.data();
        if (tokenData?.accessToken && tokenData?.expiresAt > Date.now()) {
          accessToken = tokenData.accessToken;
        }
      }
    } catch (e) {
      console.warn('[Drive-List] Failed to fetch stored token:', e);
    }
    
    if (!accessToken) {
      // Check for service account key
      const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      
      if (serviceAccountKey) {
        accessToken = await getServiceAccountToken(serviceAccountKey);
      } else {
        // Try API key for public files
        const apiKey = process.env.GOOGLE_API_KEY;
        if (apiKey) {
          return await listFilesWithApiKey(apiKey, targetFolderId);
        }
        
        return NextResponse.json(
          { error: 'No Google Drive token found. Please connect Google Drive from your profile settings.' },
          { status: 400 }
        );
      }
    }
    
    // List files from the folder
    const files = await listDriveFiles(accessToken, targetFolderId);
    
    return NextResponse.json({
      success: true,
      files,
      folderId: targetFolderId,
    });
    
  } catch (error: any) {
    console.error('[Drive-List] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list files' },
      { status: 500 }
    );
  }
}

/**
 * Get access token using service account
 */
async function getServiceAccountToken(serviceAccountKey: string): Promise<string> {
  const serviceAccount = JSON.parse(serviceAccountKey);
  
  // Create JWT
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };
  
  // Sign JWT (simplified - in production use proper JWT library)
  const { createSign } = await import('crypto');
  
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsignedToken = `${headerB64}.${payloadB64}`;
  
  const sign = createSign('RSA-SHA256');
  sign.update(unsignedToken);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  
  const jwt = `${unsignedToken}.${signature}`;
  
  // Exchange JWT for access token
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[Drive-List] Service account token error:', error);
    throw new Error('Failed to get service account token');
  }
  
  const data = await response.json();
  return data.access_token;
}

/**
 * List files using API key (for public folders)
 */
async function listFilesWithApiKey(apiKey: string, folderId: string): Promise<NextResponse> {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
  url.searchParams.set('fields', 'files(id, name, mimeType, modifiedTime, size, webViewLink, webContentLink, thumbnailLink, iconLink)');
  url.searchParams.set('pageSize', '100');
  url.searchParams.set('orderBy', 'folder,name');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('includeItemsFromAllDrives', 'true');
  
  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const error = await response.text();
    console.error('[Drive-List] API key error:', error);
    return NextResponse.json(
      { error: 'Failed to access Google Drive folder. It may not be publicly accessible.' },
      { status: 403 }
    );
  }
  
  const data = await response.json();
  
  // Sort folders first, then files
  const files = (data.files || []).sort((a: DriveFile, b: DriveFile) => {
    const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
    const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return NextResponse.json({
    success: true,
    files,
    folderId,
  });
}

/**
 * List files from Google Drive folder using OAuth token
 */
async function listDriveFiles(accessToken: string, folderId: string): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken: string | undefined;
  
  do {
    const url = new URL(`${DRIVE_API}/files`);
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, modifiedTime, size, webViewLink, webContentLink, thumbnailLink, iconLink)');
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('orderBy', 'folder,name');
    url.searchParams.set('supportsAllDrives', 'true');
    url.searchParams.set('includeItemsFromAllDrives', 'true');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[Drive-List] API Error:', response.status, errorText.substring(0, 200));
      
      if (response.status === 401) {
        throw new Error('Google Drive token expired. Please reconnect Google Drive.');
      }
      if (response.status === 403) {
        throw new Error('Access denied to folder. Check sharing permissions.');
      }
      throw new Error(`Drive API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Add files to list
    for (const file of data.files || []) {
      files.push(file);
    }
    
    pageToken = data.nextPageToken;
  } while (pageToken);
  
  // Sort folders first, then files alphabetically
  files.sort((a, b) => {
    const aIsFolder = a.mimeType === 'application/vnd.google-apps.folder';
    const bIsFolder = b.mimeType === 'application/vnd.google-apps.folder';
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;
    return a.name.localeCompare(b.name);
  });
  
  return files;
}
