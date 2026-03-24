import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebaseAdmin';

export async function POST(req: NextRequest) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const idToken = authHeader.split('Bearer ')[1];

    let callerUid: string;
    try {
      const decodedToken = await adminAuth.verifyIdToken(idToken);
      callerUid = decodedToken.uid;
    } catch {
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
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId is required' },
        { status: 400 }
      );
    }

    // Get the user document to find the Firebase Auth UID
    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data()!;
    const firebaseUid = userData.uid;

    // Prevent self-deletion
    if (firebaseUid === callerUid) {
      return NextResponse.json(
        { success: false, error: 'You cannot delete your own account' },
        { status: 400 }
      );
    }

    // Delete Firebase Auth user (if UID exists)
    if (firebaseUid) {
      try {
        await adminAuth.deleteUser(firebaseUid);
      } catch (authError: any) {
        // If user doesn't exist in Auth, that's fine — continue with Firestore cleanup
        if (authError.code !== 'auth/user-not-found') {
          throw authError;
        }
      }

      // Delete the UID mapping document
      try {
        await adminDb.collection('users_by_uid').doc(firebaseUid).delete();
      } catch {
        // Non-critical — mapping may not exist
      }
    }

    // Delete the Firestore user document
    await adminDb.collection('users').doc(userId).delete();

    console.log(`[Admin] Deleted user ${userData.email} (doc: ${userId}, uid: ${firebaseUid})`);

    return NextResponse.json({
      success: true,
      message: `User ${userData.email} deleted successfully`,
    });
  } catch (error: any) {
    console.error('[Admin Delete User] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to delete user' },
      { status: 500 }
    );
  }
}
