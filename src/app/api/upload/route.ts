/**
 * POST /api/upload — Upload an image to Google Cloud Storage
 *
 * Accepts multipart/form-data with a single `file` field.
 * Stores in gs://amble-ai.appspot.com/news_images/<timestamp>_<random>.<ext>
 * Returns the public URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminStorage } from '@/lib/firebaseAdmin';

const BUCKET_NAME = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'amble-ai.appspot.com';
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate type
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate size
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'Image must be under 5 MB' }, { status: 400 });
    }

    // Build a unique filename
    const ext = file.name.split('.').pop() || 'jpg';
    const filename = `news_images/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    // Upload to GCS
    const bucket = adminStorage.bucket(BUCKET_NAME);
    const blob = bucket.file(filename);
    const buffer = Buffer.from(await file.arrayBuffer());

    await blob.save(buffer, {
      contentType: file.type,
      metadata: {
        cacheControl: 'public, max-age=31536000',
      },
    });

    // Make the file publicly readable
    await blob.makePublic();

    // Build the public URL
    const publicUrl = `https://storage.googleapis.com/${BUCKET_NAME}/${filename}`;

    return NextResponse.json({ url: publicUrl });
  } catch (err: any) {
    console.error('[Upload API] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Upload failed' },
      { status: 500 },
    );
  }
}
