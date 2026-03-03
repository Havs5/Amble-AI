import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import { getAuth, Auth, GoogleAuthProvider } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

// Initialize Firebase - only on client side
let app: FirebaseApp | null = null;
let db: Firestore = null as unknown as Firestore;
let storage: FirebaseStorage | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;
let initialized = false;

// Only initialize if we're in a browser environment
if (typeof window !== 'undefined' && firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    
    // Add scopes for Google Drive access (shared with knowledge base)
    googleProvider.addScope('https://www.googleapis.com/auth/drive.readonly');
    googleProvider.addScope('https://www.googleapis.com/auth/drive.file');
    
    // Force account selection every time (don't auto-select)
    googleProvider.setCustomParameters({
      prompt: 'select_account'
    });
    
    initialized = true;
    
    // Storage is optional
    if (firebaseConfig.storageBucket) {
      try {
        storage = getStorage(app);
      } catch {
        // Storage not available
      }
    }
  } catch (error) {
    console.error("Firebase Initialization Error:", error);
  }
}

export function isFirebaseInitialized(): boolean {
  return initialized;
}

export function getStorageInstance(): FirebaseStorage | null {
  return storage;
}

export function getGoogleProvider(): GoogleAuthProvider | null {
  return googleProvider;
}

export { app, db, auth, storage, googleProvider };
