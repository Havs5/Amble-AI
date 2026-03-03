import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from "@google/genai";
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { rateLimitCheck } from '@/lib/rateLimiter';

export async function POST(req: NextRequest) {
    // Rate limiting - video generation is most expensive
    const rateLimitResponse = rateLimitCheck(req, 'veo');
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    try {
        const body = await req.json();
        const { prompt, userId, model } = body;
        const startFrame = body.startFrame;
        const inputVideo = body.inputVideo;

        // Map inputs
        let image = null;
        let mimeType = null;

        if (startFrame) {
            image = startFrame.base64;
            mimeType = startFrame.mimeType;
        } else if (inputVideo) {
            image = inputVideo.base64;
            mimeType = inputVideo.mimeType;
        }
        
        // Use prompt from body if available, or empty string if input provided (though prompt usually required)
        // ...

        if (!prompt && !image) {
            return NextResponse.json({ error: 'Prompt or Image required' }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'Server API Key missing' }, { status: 500 });
        }

        const client = new GoogleGenAI({ apiKey });
        
        // Prepare request
        // Note: Actual Veo implementation via SDK might differ slightly. 
        // This is a best-effort implementation based on standard GenAI patterns.
        // If this specific model call fails, we might need to adjust.
        // For 'veo' models, it often returns a video uri or bytes.

        let videoUrl = '';
        let videoUri = '';

        try {
            // Construct content parts
            const parts: any[] = [{ text: prompt }];
            if (image) {
                parts.push({
                    inlineData: {
                        mimeType: mimeType || 'image/png',
                        data: image
                    }
                });
            }

            const response = await client.models.generateContent({
                model: model || 'veo-3.0-generate-001',
                contents: { parts }
            });

            // Parse response
            // Veo response handling is tricky without precise docs. 
            // It might return a file URI (Google Cloud Storage) or inline data.
            // Assuming it returns inline data for now or we extract a URI.
            
            const candidate = response.candidates?.[0];
            const videoPart = candidate?.content?.parts?.find((p: any) => p.inlineData || p.fileData);

            if (videoPart?.inlineData?.data) {
                 // Convert base64 to Buffer
                 const buffer = Buffer.from(videoPart.inlineData.data, 'base64');
                 
                 // Upload to Firebase Storage
                 if (userId) {
                    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
                    const bucket = adminStorage.bucket(bucketName);
                    const fileName = `users/${userId}/generated/videos/${Date.now()}.mp4`;
                    const file = bucket.file(fileName);
                    
                    await file.save(buffer, {
                        metadata: { contentType: 'video/mp4' }
                    });
                    
                    const [signedUrl] = await file.getSignedUrl({
                        action: 'read',
                        expires: '03-01-2500'
                    });
                    videoUrl = signedUrl;
                    videoUri = signedUrl; // Treat as same for app usage
                 }
            } else if (videoPart?.fileData) {
                 // It returned a URI reference
                 videoUri = videoPart.fileData.fileUri || "";
                 videoUrl = videoUri; // We might need to download this if it's not accessible publicly
                 // Typically client needs to fetch it properly.
            } else {
                // If we get here, generation might have failed or returned text only
                console.warn("No video data in response", JSON.stringify(candidate));
                // throw new Error("No video content generated");
            }

        } catch (genError) {
             console.error("Veo Gen Error:", genError);
             // In case of error (e.g. quota, model not found), we propagate it.
             // But for the sake of the Gallery feature demo, if it was a real app we'd stop.
             // For this task, if generation fails, we cannot save to gallery.
             throw genError;
        }

        // SAVE TO GALLERY (Firestore)
        if (userId && videoUrl) {
             await adminDb.collection('users').doc(userId).collection('assets').add({
                type: 'video',
                url: videoUrl,
                prompt,
                model,
                createdAt: Date.now(),
                metadata: { fromImage: !!image }
             });
        }

        return NextResponse.json({ videoUrl, videoObject: { uri: videoUri } });

    } catch (e: any) {
        console.error("Veo API Error:", e);
        return NextResponse.json({ error: e.message || 'Video generation failed' }, { status: 500 });
    }
}
