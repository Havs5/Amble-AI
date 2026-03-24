import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';
import crypto from 'crypto';

// Default permissions for new users
const DEFAULT_PERMISSIONS = {
  accessAmble: true,
  accessBilling: true,
  accessStudio: false,
  accessKnowledge: false,
  accessPharmacy: false,
};

// Default capabilities for new users
const DEFAULT_CAPABILITIES = {
  webBrowse: true,
  imageGen: true,
  codeInterpreter: false,
  realtimeVoice: false,
  vision: true,
  videoIn: false,
  longContext: false,
  aiDictation: false,
  dictationMode: 'auto' as const,
  skipCorrection: false,
};

// Default AI config
const DEFAULT_AI_CONFIG = {
  systemPrompt: 'You are Amble AI, a helpful general assistant.',
  policies: [],
  temperature: 0.7,
  maxTokens: 8192,
};

export async function POST(req: NextRequest) {
  try {
    // Get the authorization header to verify the caller is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const idToken = authHeader.split('Bearer ')[1];
    
    // Verify the caller's token and check if they're an admin
    let callerUid: string;
    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      callerUid = decodedToken.uid;
    } catch (error) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Check if caller is an admin
    const callerSnapshot = await adminDb.collection('users')
      .where('uid', '==', callerUid)
      .limit(1)
      .get();
    
    if (callerSnapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const callerData = callerSnapshot.docs[0].data();
    if (callerData.role !== 'admin' && callerData.role !== 'superadmin') {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    // Parse request body
    const body = await req.json();
    const { email, password, name, role, permissions, capabilities, department } = body;

    if (!email || !name) {
      return NextResponse.json(
        { success: false, error: 'Email and name are required' },
        { status: 400 }
      );
    }

    // Generate a random password (required by Firebase Auth, but users sign in via Google)
    const generatedPassword = password || crypto.randomBytes(24).toString('base64url');

    // Check if user already exists in Firestore
    const existingUserSnapshot = await adminDb.collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!existingUserSnapshot.empty) {
      return NextResponse.json(
        { success: false, error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Create Firebase Auth user using Admin SDK
    let firebaseUser;
    try {
      firebaseUser = await adminAuth.createUser({
        email,
        password: generatedPassword,
        displayName: name,
        emailVerified: false,
      });
    } catch (authError: any) {
      // Handle specific Firebase Auth errors
      if (authError.code === 'auth/email-already-exists') {
        return NextResponse.json(
          { success: false, error: 'An account with this email already exists in Firebase Auth' },
          { status: 409 }
        );
      }
      if (authError.code === 'auth/invalid-email') {
        return NextResponse.json(
          { success: false, error: 'Invalid email address' },
          { status: 400 }
        );
      }
      if (authError.code === 'auth/weak-password') {
        return NextResponse.json(
          { success: false, error: 'Password should be at least 6 characters' },
          { status: 400 }
        );
      }
      throw authError;
    }

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
      userId: userRef.id 
    });

    // Return the created user
    return NextResponse.json({
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
  } catch (error: any) {
    console.error('[Admin Create User] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create user' },
      { status: 500 }
    );
  }
}
