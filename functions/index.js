/**
 * Amble AI - Cloud Functions Entry Point (Refactored)
 * Last deployed: 2026-02-16 - KB search threshold fixes, preview header cleanup
 * 
 * This is the refactored, modular version of the Cloud Functions.
 * Routes are split into separate files in src/routes/
 * 
 * Structure:
 * - src/routes/     - Route handlers (chat, image, video, etc.)
 * - src/services/   - Business logic services
 * - src/config/     - Configuration (pricing, etc.)
 * - src/utils/      - Shared utilities
 * 
 * Deploy timestamp: 2025-06-16T06:00:00Z - Vector KB integration
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const next = require('next');
const admin = require('firebase-admin');
require('dotenv').config();

// Route handlers
const {
  handleChat,
  handleImage,
  handleVideo,
  handleTranscribe,
  handleRewrite,
  handleSpeech,
  handleSearch,
  handleExtract,
  handleGallery,
  handleKnowledgeIngest,
  handleKnowledgeSearch,
  handleVectorKBSearch,
  handleVideoAnalyze,
  handleDriveSync,
} = require('./src/routes');

// Utilities
const {
  writeJson,
  jsonError,
  readJsonBody,
  getQueryParam,
  getHttpStatusFromError,
  getErrorMessage,
  createFirebaseDownloadUrl,
  getStorageBucketName,
} = require('./src/utils/helpers');

// ============================================================================
// Secrets
// ============================================================================

const OPENAI_API_KEY = defineSecret('OPENAI_API_KEY');
const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const TAVILY_API_KEY = defineSecret('TAVILY_API_KEY');
const GOOGLE_SEARCH_API_KEY = defineSecret('GOOGLE_SEARCH_API_KEY');
const GOOGLE_SEARCH_CX = defineSecret('GOOGLE_SEARCH_CX');

// ============================================================================
// Next.js App
// ============================================================================

const dev = false;
const app = next({ 
  dev, 
  dir: __dirname,
  conf: { distDir: '.next' } 
});
const handle = app.getRequestHandler();

// ============================================================================
// Initialization Helpers
// ============================================================================

function ensureAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp();
  }
}

function setSecretsToEnv() {
  if (OPENAI_API_KEY.value()) process.env.OPENAI_API_KEY = OPENAI_API_KEY.value();
  if (GEMINI_API_KEY.value()) process.env.GEMINI_API_KEY = GEMINI_API_KEY.value();
  if (TAVILY_API_KEY.value()) process.env.TAVILY_API_KEY = TAVILY_API_KEY.value();
  if (GOOGLE_SEARCH_API_KEY.value()) process.env.GOOGLE_SEARCH_API_KEY = GOOGLE_SEARCH_API_KEY.value();
  if (GOOGLE_SEARCH_CX.value()) process.env.GOOGLE_SEARCH_CX = GOOGLE_SEARCH_CX.value();
  
  console.log('[Secrets] Keys loaded:', {
    OPENAI: !!process.env.OPENAI_API_KEY,
    GEMINI: !!process.env.GEMINI_API_KEY,
    TAVILY: !!process.env.TAVILY_API_KEY,
    GOOGLE_SEARCH: !!process.env.GOOGLE_SEARCH_API_KEY,
    GOOGLE_CX: !!process.env.GOOGLE_SEARCH_CX
  });
}

// ============================================================================
// Route Definitions
// ============================================================================

const ROUTES = [
  // Chat
  { method: 'POST', paths: ['/api/chat', '/chat'], handler: handleChat },
  
  // Image
  { method: 'POST', paths: ['/api/image', '/image'], handler: handleImage },
  
  // Video
  { method: 'POST', paths: ['/api/veo', '/veo'], handler: handleVideo },
  
  // Audio
  { method: 'POST', paths: ['/api/transcribe', '/transcribe'], handler: handleTranscribe },
  { method: 'POST', paths: ['/api/rewrite', '/rewrite'], handler: handleRewrite },
  { method: 'POST', paths: ['/api/audio/speech', '/audio/speech'], handler: handleSpeech },
  
  // Tools
  { method: 'POST', paths: ['/api/tools/search', '/tools/search'], handler: handleSearch },
  { method: 'POST', paths: ['/api/tools/extract', '/tools/extract'], handler: handleExtract },
  
  // Gallery (GET + DELETE)
  { method: ['GET', 'DELETE'], paths: ['/api/gallery', '/gallery'], handler: handleGallery },
  
  // Knowledge
  { method: 'POST', paths: ['/api/knowledge/ingest', '/knowledge/ingest'], handler: handleKnowledgeIngest },
  { method: 'POST', paths: ['/api/kb/search', '/kb/search'], handler: handleKnowledgeSearch },
  { method: 'POST', paths: ['/api/knowledge/search', '/knowledge/search'], handler: handleVectorKBSearch },
  { method: 'POST', paths: ['/api/knowledge/drive-sync', '/knowledge/drive-sync'], handler: handleDriveSync },
  
  // Video Analysis
  { method: 'POST', paths: ['/api/video/analyze', '/video/analyze'], handler: handleVideoAnalyze },
];

// ============================================================================
// Main Cloud Function
// ============================================================================

exports.ssrambleai = onRequest(
  {
    region: 'us-central1',
    memory: '2GiB',
    timeoutSeconds: 540,
    secrets: [OPENAI_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY, GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_CX]
  },
  async (req, res) => {
    let adminDb;
    let bucket;
    let toFirebaseDownloadUrl;

    try {
      // Initialize
      setSecretsToEnv();
      ensureAdmin();
      adminDb = admin.firestore();
      
      const bucketName = getStorageBucketName();
      if (!bucketName) {
        throw new Error('Storage bucket name not available');
      }
      bucket = admin.storage().bucket(bucketName);
      toFirebaseDownloadUrl = createFirebaseDownloadUrl(bucketName);
    } catch (e) {
      console.error('Fatal init error:', e);
      return writeJson(res, 500, { error: 'Server initialization error', details: e?.message });
    }

    // Request context
    const path = req.path || '/';
    const method = (req.method || 'GET').toUpperCase();
    
    console.log(`[Request] ${method} ${path}`);

    // Set COOP header on ALL responses from this function (API + SSR)
    res.set('Cross-Origin-Opener-Policy', 'unsafe-none');

    // Shared context for handlers
    const context = {
      adminDb,
      bucket,
      writeJson,
      jsonError,
      readJsonBody,
      getQueryParam,
      toFirebaseDownloadUrl,
    };

    try {
      // Route matching
      for (const route of ROUTES) {
        const methods = Array.isArray(route.method) ? route.method : [route.method];
        
        if (!methods.includes(method)) continue;
        if (!route.paths.includes(path)) continue;
        
        // Found matching route
        return route.handler(req, res, context);
      }

      // Special: Admin - Fix Duplicate Users
      if (method === 'POST' && (path === '/api/admin/fix-duplicates' || path === '/admin/fix-duplicates')) {
        return handleFixDuplicateUsers(req, res, context);
      }

      // Special: Admin - Restore Users
      if (method === 'POST' && (path === '/api/admin/restore-users' || path === '/admin/restore-users')) {
        return handleRestoreUsers(req, res, context);
      }

      // Special: Video content proxy (dynamic path)
      const videoContentMatch = path.match(/^\/(?:api\/)?videos\/([^/]+)\/content$/);
      if (method === 'GET' && videoContentMatch) {
        const videoId = decodeURIComponent(videoContentMatch[1]);
        return handleVideoContentProxy(req, res, videoId);
      }

      // Fall through to Next.js
      await app.prepare();
      return handle(req, res);
      
    } catch (e) {
      console.error('Unhandled error:', e);
      if (!res.headersSent) {
        return writeJson(res, 500, { error: 'Internal Server Error', details: e?.message });
      }
      try {
        return res.end();
      } catch {
        return;
      }
    }
  }
);

// ============================================================================
// Admin: Fix Duplicate Users
// ============================================================================

async function handleFixDuplicateUsers(req, res, { adminDb, writeJson }) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const adminSecret = body.adminSecret;
    
    // Simple admin check - require secret
    if (adminSecret !== 'amble-admin-2026') {
      return writeJson(res, 401, { error: 'Unauthorized' });
    }
    
    console.log('[Admin] Starting duplicate user cleanup...');
    
    // Get all Auth users
    const authUsersMap = {};
    let nextPageToken;
    do {
      const listResult = await admin.auth().listUsers(1000, nextPageToken);
      listResult.users.forEach(user => {
        if (user.email) {
          authUsersMap[user.email.toLowerCase()] = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName
          };
        }
      });
      nextPageToken = listResult.pageToken;
    } while (nextPageToken);
    
    console.log(`[Admin] Found ${Object.keys(authUsersMap).length} Auth users`);
    
    // Get all Firestore users
    const usersSnapshot = await adminDb.collection('users').get();
    const firestoreUsers = [];
    
    usersSnapshot.forEach(doc => {
      firestoreUsers.push({
        docId: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`[Admin] Found ${firestoreUsers.length} Firestore user documents`);
    
    // Group by email (case-insensitive)
    const usersByEmail = {};
    firestoreUsers.forEach(user => {
      const email = (user.email || '').toLowerCase().trim();
      if (!email) return;
      
      if (!usersByEmail[email]) {
        usersByEmail[email] = [];
      }
      usersByEmail[email].push(user);
    });
    
    // Find duplicates and clean up
    const results = {
      processed: 0,
      deleted: 0,
      kept: 0,
      details: []
    };
    
    for (const [email, users] of Object.entries(usersByEmail)) {
      if (users.length <= 1) continue;
      
      results.processed++;
      const authUser = authUsersMap[email];
      
      // Sort: prioritize matching Auth UID, then by having a proper name
      const sorted = users.sort((a, b) => {
        // 1. Match Auth UID
        if (authUser) {
          if (a.docId === authUser.uid) return -1;
          if (b.docId === authUser.uid) return 1;
        }
        
        // 2. Has a real name (not "User")
        const aHasName = a.name && a.name !== 'User' && a.displayName && a.displayName !== 'User';
        const bHasName = b.name && b.name !== 'User' && b.displayName && b.displayName !== 'User';
        if (aHasName && !bHasName) return -1;
        if (bHasName && !aHasName) return 1;
        
        // 3. More recent updatedAt
        const aTime = a.updatedAt?.toMillis?.() || a.updatedAt || 0;
        const bTime = b.updatedAt?.toMillis?.() || b.updatedAt || 0;
        return bTime - aTime;
      });
      
      const keepUser = sorted[0];
      const deleteUsers = sorted.slice(1);
      
      results.kept++;
      results.details.push({
        email,
        kept: { docId: keepUser.docId, name: keepUser.name || keepUser.displayName },
        deleted: deleteUsers.map(u => ({ docId: u.docId, name: u.name || u.displayName }))
      });
      
      // Delete duplicates
      for (const user of deleteUsers) {
        console.log(`[Admin] Deleting duplicate: ${user.docId} (${email})`);
        await adminDb.collection('users').doc(user.docId).delete();
        results.deleted++;
      }
    }
    
    console.log(`[Admin] Cleanup complete: ${results.deleted} deleted, ${results.kept} kept`);
    
    return writeJson(res, 200, {
      success: true,
      message: `Cleaned up ${results.deleted} duplicate users`,
      results
    });
    
  } catch (e) {
    console.error('[Admin] Error fixing duplicates:', e);
    return writeJson(res, 500, { error: e.message });
  }
}

// ============================================================================
// Admin: Restore Users with Correct Data
// ============================================================================

async function handleRestoreUsers(req, res, { adminDb, writeJson }) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const adminSecret = body.adminSecret;
    
    if (adminSecret !== 'amble-admin-2026') {
      return writeJson(res, 401, { error: 'Unauthorized' });
    }
    
    console.log('[Admin] Restoring users with correct data...');
    
    // Correct user data based on screenshots
    const correctUserData = [
      { 
        email: 'kimberly@joinamble.com',
        name: 'Kimmi Russ',
        displayName: 'Kimmi Russ',
        role: 'user'
      },
      { 
        email: 'hectorv@joinamble.com',
        name: 'Hector',
        displayName: 'Héctor Vásquez',
        role: 'admin'
      },
      { 
        email: 'aoubaidie@supportyourapp.com',
        name: 'El Mehdi Aoubaidi',
        displayName: 'El Mehdi Aoubaidi',
        role: 'user'
      },
      { 
        email: '7148397@gmail.com',
        name: 'Christina',
        displayName: 'Christina',
        role: 'user'
      },
      { 
        email: 'kyle@joinamble.com',
        name: 'Kyle Carter',
        displayName: 'Kyle Carter',
        role: 'user'
      },
      { 
        email: 'catalina@joinamble.com',
        name: 'Catalina Vasquez',
        displayName: 'Catalina Vasquez',
        role: 'user'
      },
      { 
        email: 'alaynamysliwski@gmail.com',
        name: 'Alayna Mysliwski',
        displayName: 'Alayna Mysliwski',
        role: 'admin'
      },
    ];
    
    const results = { updated: 0, notFound: 0, details: [] };
    
    // Get all current users
    const usersSnapshot = await adminDb.collection('users').get();
    const usersByEmail = {};
    usersSnapshot.forEach(doc => {
      const data = doc.data();
      const email = (data.email || '').toLowerCase();
      usersByEmail[email] = { docId: doc.id, ...data };
    });
    
    for (const correctData of correctUserData) {
      const email = correctData.email.toLowerCase();
      const existingUser = usersByEmail[email];
      
      if (existingUser) {
        // Update the user with correct data
        await adminDb.collection('users').doc(existingUser.docId).update({
          name: correctData.name,
          displayName: correctData.displayName,
          role: correctData.role,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        results.updated++;
        results.details.push({
          email,
          docId: existingUser.docId,
          name: correctData.name,
          role: correctData.role,
          status: 'updated'
        });
        
        console.log(`[Admin] Updated: ${email} -> ${correctData.name} (${correctData.role})`);
      } else {
        results.notFound++;
        results.details.push({
          email,
          status: 'not_found'
        });
        console.log(`[Admin] Not found: ${email}`);
      }
    }
    
    console.log(`[Admin] Restore complete: ${results.updated} updated, ${results.notFound} not found`);
    
    return writeJson(res, 200, {
      success: true,
      message: `Restored ${results.updated} users`,
      results
    });
    
  } catch (e) {
    console.error('[Admin] Error restoring users:', e);
    return writeJson(res, 500, { error: e.message });
  }
}

// ============================================================================
// Video Content Proxy (Special Handler)
// ============================================================================

async function handleVideoContentProxy(req, res, videoId) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return jsonError(res, 500, 'OPENAI_API_KEY is missing');
    }

    const upstream = await fetch(
      `https://api.openai.com/v1/videos/${encodeURIComponent(videoId)}/content`,
      { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    );

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      return jsonError(res, upstream.status, 'Failed to fetch video content', text);
    }

    const contentType = upstream.headers.get('content-type') || 'video/mp4';
    res.status(200);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.end(buf);
  } catch (e) {
    console.error('Error in video content proxy:', e);
    return jsonError(res, getHttpStatusFromError(e) || 500, getErrorMessage(e));
  }
}
