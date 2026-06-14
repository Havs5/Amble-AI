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
const SMTP_APP_PASSWORD = defineSecret('SMTP_APP_PASSWORD');

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
  if (SMTP_APP_PASSWORD.value()) process.env.SMTP_APP_PASSWORD = SMTP_APP_PASSWORD.value();
  
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
    secrets: [OPENAI_API_KEY, GEMINI_API_KEY, TAVILY_API_KEY, GOOGLE_SEARCH_API_KEY, GOOGLE_SEARCH_CX, SMTP_APP_PASSWORD]
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

      // Special: Admin - Reset User Password
      if (method === 'POST' && (path === '/api/admin/reset-password' || path === '/admin/reset-password')) {
        return handleAdminResetPassword(req, res, context);
      }

      // Special: Admin - Create User
      if (method === 'POST' && (path === '/api/admin/create-user' || path === '/admin/create-user')) {
        return handleAdminCreateUser(req, res, context);
      }

      // Special: Admin - Delete User
      if (method === 'POST' && (path === '/api/admin/delete-user' || path === '/admin/delete-user')) {
        return handleAdminDeleteUser(req, res, context);
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

// ============================================================================
// Admin: Delete User
// ============================================================================

async function handleAdminDeleteUser(req, res, { adminDb, writeJson }) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { userId } = body;

    // Verify authorization
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return writeJson(res, 401, { success: false, error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    let callerUid;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      callerUid = decodedToken.uid;
    } catch (err) {
      return writeJson(res, 401, { success: false, error: 'Invalid token' });
    }

    // Check if caller is an admin
    const callerSnapshot = await adminDb.collection('users')
      .where('uid', '==', callerUid)
      .limit(1)
      .get();

    if (callerSnapshot.empty) {
      return writeJson(res, 404, { success: false, error: 'Caller user not found' });
    }

    const callerData = callerSnapshot.docs[0].data();
    if (callerData.role !== 'admin' && callerData.role !== 'superadmin') {
      return writeJson(res, 403, { success: false, error: 'Admin access required' });
    }

    if (!userId) {
      return writeJson(res, 400, { success: false, error: 'userId is required' });
    }

    // Get the user document
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return writeJson(res, 404, { success: false, error: 'User not found' });
    }

    const userData = userDoc.data();
    const firebaseUid = userData.uid;

    // Prevent self-deletion
    if (firebaseUid === callerUid) {
      return writeJson(res, 400, { success: false, error: 'You cannot delete your own account' });
    }

    // Delete Firebase Auth user
    if (firebaseUid) {
      try {
        await admin.auth().deleteUser(firebaseUid);
      } catch (authError) {
        if (authError.code !== 'auth/user-not-found') {
          throw authError;
        }
      }

      // Delete UID mapping
      try {
        await adminDb.collection('users_by_uid').doc(firebaseUid).delete();
      } catch (e) {
        // Non-critical
      }
    }

    // Delete Firestore user document
    await adminDb.collection('users').doc(userId).delete();

    console.log(`[Admin] Deleted user ${userData.email} (doc: ${userId}, uid: ${firebaseUid})`);

    return writeJson(res, 200, {
      success: true,
      message: `User ${userData.email} deleted successfully`,
    });
  } catch (e) {
    console.error('[Admin] Error deleting user:', e);
    return writeJson(res, 500, { success: false, error: e.message || 'Failed to delete user' });
  }
}

// ============================================================================
// Admin: Reset User Password & Send Email
// ============================================================================

async function handleAdminCreateUser(req, res, { adminDb, writeJson }) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { email, password, name, role, permissions, capabilities, department } = body;

    // Get the authorization header to verify the caller is an admin
    const authHeader = req.headers.authorization || req.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return writeJson(res, 401, { success: false, error: 'Unauthorized' });
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the caller's token
    let callerUid;
    try {
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      callerUid = decodedToken.uid;
    } catch (err) {
      return writeJson(res, 401, { success: false, error: 'Invalid token' });
    }

    // Check if caller is an admin
    const callerSnapshot = await adminDb.collection('users')
      .where('uid', '==', callerUid)
      .limit(1)
      .get();

    if (callerSnapshot.empty) {
      return writeJson(res, 404, { success: false, error: 'Caller user not found' });
    }

    const callerData = callerSnapshot.docs[0].data();
    if (callerData.role !== 'admin' && callerData.role !== 'superadmin') {
      return writeJson(res, 403, { success: false, error: 'Admin access required' });
    }

    if (!email || !name) {
      return writeJson(res, 400, { success: false, error: 'Email and name are required' });
    }

    // Generate a random password (required by Firebase Auth, but users sign in via Google)
    const crypto = require('crypto');
    const generatedPassword = password || crypto.randomBytes(24).toString('base64url');

    // Check if user already exists in Firestore
    const existingUserSnapshot = await adminDb.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existingUserSnapshot.empty) {
      return writeJson(res, 409, { success: false, error: 'A user with this email already exists' });
    }

    // Create Firebase Auth user using Admin SDK
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().createUser({
        email,
        password: generatedPassword,
        displayName: name,
        emailVerified: false,
      });
    } catch (authError) {
      if (authError.code === 'auth/email-already-exists') {
        return writeJson(res, 409, { success: false, error: 'An account with this email already exists in Firebase Auth' });
      }
      if (authError.code === 'auth/invalid-email') {
        return writeJson(res, 400, { success: false, error: 'Invalid email address' });
      }
      if (authError.code === 'auth/weak-password') {
        return writeJson(res, 400, { success: false, error: 'Password should be at least 6 characters' });
      }
      throw authError;
    }

    // Default permissions and capabilities
    const DEFAULT_PERMISSIONS = {
      accessAmble: true,
      accessBilling: true,
      accessStudio: false,
      accessKnowledge: false,
      accessPharmacy: false,
    };
    const DEFAULT_CAPABILITIES = {
      webBrowse: true,
      imageGen: true,
      codeInterpreter: false,
      realtimeVoice: false,
      vision: true,
      videoIn: false,
      longContext: false,
      aiDictation: false,
      dictationMode: 'auto',
      skipCorrection: false,
    };
    const DEFAULT_AI_CONFIG = {
      systemPrompt: 'You are Amble AI, a helpful general assistant.',
      policies: [],
      temperature: 0.7,
      maxTokens: 8192,
    };

    // Create Firestore user document
    const now = new Date();
    const userRef = adminDb.collection('users').doc();
    const userData = {
      uid: firebaseUser.uid,
      email,
      name,
      role: role || 'user',
      permissions: { ...DEFAULT_PERMISSIONS, ...permissions },
      capabilities: { ...DEFAULT_CAPABILITIES, ...capabilities },
      ambleConfig: DEFAULT_AI_CONFIG,
      cxConfig: { ...DEFAULT_AI_CONFIG, systemPrompt: 'You are an expert billing and dispute specialist assistant.' },
      department: department || '',
      authProvider: 'google',
      emailVerified: false,
      createdAt: now,
      lastLoginAt: now,
    };

    await userRef.set(userData);

    // Create UID mapping for fast lookups
    await adminDb.collection('users_by_uid').doc(firebaseUser.uid).set({
      userId: userRef.id,
    });

    console.log(`[Admin] Created user ${email} (uid: ${firebaseUser.uid}, doc: ${userRef.id})`);

    return writeJson(res, 200, {
      success: true,
      user: {
        id: userRef.id,
        uid: firebaseUser.uid,
        email,
        name,
        role: role || 'user',
        permissions: userData.permissions,
        capabilities: userData.capabilities,
        department: userData.department,
        authProvider: 'google',
        emailVerified: false,
        createdAt: now.toISOString(),
        lastLoginAt: now.toISOString(),
      },
    });
  } catch (e) {
    console.error('[Admin] Error creating user:', e);
    return writeJson(res, 500, { success: false, error: e.message || 'Failed to create user' });
  }
}

async function handleAdminResetPassword(req, res, { adminDb, writeJson }) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { userId, callerUid, sendEmail } = body;

    if (!userId || !callerUid) {
      return writeJson(res, 400, { error: 'Missing userId or callerUid' });
    }

    // Verify caller is admin
    const callerMapping = await adminDb.collection('users_by_uid').doc(callerUid).get();
    if (!callerMapping.exists) {
      return writeJson(res, 403, { error: 'Caller not found' });
    }
    const callerDoc = await adminDb.collection('users').doc(callerMapping.data().userId).get();
    if (!callerDoc.exists || !['admin', 'superadmin'].includes(callerDoc.data().role)) {
      return writeJson(res, 403, { error: 'Insufficient permissions' });
    }

    // Get target user document
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return writeJson(res, 404, { error: 'User not found' });
    }
    const userData = userDoc.data();
    const firebaseUid = userData.uid;
    const userEmail = userData.email;
    const userName = userData.name || 'User';

    if (!firebaseUid) {
      return writeJson(res, 400, { error: 'User has no Firebase Auth UID' });
    }

    // Generate random password: 12 chars, mix of upper/lower/numbers/symbols
    const crypto = require('crypto');
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
    let newPassword = '';
    const randomBytes = crypto.randomBytes(12);
    for (let i = 0; i < 12; i++) {
      newPassword += chars[randomBytes[i] % chars.length];
    }

    // Update Firebase Auth password
    await admin.auth().updateUser(firebaseUid, { password: newPassword });
    console.log(`[Admin] Password reset for ${userEmail} (uid: ${firebaseUid})`);

    // Send email notification if requested and SMTP credentials are available
    let emailSent = false;
    if (sendEmail && process.env.SMTP_APP_PASSWORD) {
      try {
        const nodemailer = require('nodemailer');
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: 'hectorv@joinamble.com',
            pass: process.env.SMTP_APP_PASSWORD,
          },
        });

        await transporter.sendMail({
          from: '"Amble AI" <hectorv@joinamble.com>',
          to: userEmail,
          subject: 'Your Amble AI Password Has Been Reset',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 540px; margin: 0 auto; padding: 32px 24px; background: #f8fafc; border-radius: 12px;">
              <div style="text-align: center; margin-bottom: 24px;">
                <div style="display: inline-block; width: 48px; height: 48px; background: linear-gradient(135deg, #6366f1, #a855f7); border-radius: 12px; line-height: 48px; color: white; font-weight: bold; font-size: 20px;">A</div>
              </div>
              <h2 style="color: #1e293b; text-align: center; margin-bottom: 8px; font-size: 22px;">Password Reset</h2>
              <p style="color: #64748b; text-align: center; margin-bottom: 24px; font-size: 14px;">Hi ${userName}, your Amble AI account password has been reset by an administrator.</p>
              <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="color: #475569; font-size: 13px; margin: 0 0 4px 0;">Your new temporary password:</p>
                <p style="color: #1e293b; font-size: 18px; font-weight: 600; font-family: monospace; letter-spacing: 1px; margin: 0; background: #f1f5f9; padding: 12px; border-radius: 6px; text-align: center;">${newPassword}</p>
              </div>
              <p style="color: #94a3b8; font-size: 12px; text-align: center;">Please sign in at <a href="https://amble-ai.web.app" style="color: #6366f1;">amble-ai.web.app</a> and change your password at your earliest convenience.</p>
              <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
              <p style="color: #cbd5e1; font-size: 11px; text-align: center;">Amble AI &bull; Healthcare Intelligence Platform</p>
            </div>
          `,
        });
        emailSent = true;
        console.log(`[Admin] Password reset email sent to ${userEmail}`);
      } catch (emailErr) {
        console.error('[Admin] Failed to send reset email:', emailErr);
        // Don't fail the request — password was still reset
      }
    }

    return writeJson(res, 200, {
      success: true,
      newPassword,
      emailSent,
      message: `Password reset for ${userEmail}${emailSent ? ' — email sent' : ''}`,
    });
  } catch (e) {
    console.error('[Admin] Error resetting password:', e);
    return writeJson(res, 500, { error: e.message });
  }
}
