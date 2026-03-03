import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'UserId required' }, { status: 400 });
    }

    const snapshot = await adminDb
      .collection('users')
      .doc(userId)
      .collection('assets')
      .orderBy('createdAt', 'desc')
      .get();

    const assets = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ assets });
  } catch (error: any) {
    console.error('Gallery Fetch Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { userId, type, url, prompt, model, metadata } = body;

        if (!userId || !url || !type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const newAsset = {
            type,
            url,
            prompt: prompt || '',
            model: model || 'unknown',
            createdAt: Date.now(),
            metadata: metadata || {}
        };

        const docRef = await adminDb
            .collection('users')
            .doc(userId)
            .collection('assets')
            .add(newAsset);

        return NextResponse.json({ id: docRef.id, ...newAsset });

    } catch (error: any) {
        console.error('Gallery Save Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get('assetId');
    const userId = searchParams.get('userId');

    if (!assetId || !userId) {
      return NextResponse.json({ error: 'AssetId and UserId required' }, { status: 400 });
    }

    await adminDb
      .collection('users')
      .doc(userId)
      .collection('assets')
      .doc(assetId)
      .delete();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Gallery Delete Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
