import * as admin from 'firebase-admin';

// In Cloud Functions environment, firebase-admin may already be initialized
// by the main Cloud Function. Only initialize if not already done.
if (!admin.apps.length) {
  try {
    // In Cloud Run/Cloud Functions, applicationDefault() uses the
    // GOOGLE_APPLICATION_CREDENTIALS env var or Application Default Credentials
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('[Firebase Admin] Initialized successfully');
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error);
    // Try initializing without credentials (works in Cloud Functions environment)
    try {
      admin.initializeApp();
      console.log('[Firebase Admin] Initialized with default config');
    } catch (e) {
      console.error('[Firebase Admin] Fallback initialization also failed:', e);
    }
  }
}

// Get references - these will work even if the app was initialized elsewhere
const adminDb = admin.firestore();
const adminStorage = admin.storage();
const adminAuth = admin.auth();

export { adminDb, adminStorage, adminAuth };
