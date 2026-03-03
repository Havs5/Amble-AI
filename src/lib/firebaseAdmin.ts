import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    console.log('[Firebase Admin] Initialized successfully');
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error);
  }
}

// Initialize with type assertion since we know Firebase is configured
const adminDb = admin.firestore();
const adminStorage = admin.storage();
const adminAuth = admin.auth();

export { adminDb, adminStorage, adminAuth };
