import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { toFile } from 'openai/uploads';
import { adminDb, adminStorage } from '@/lib/firebaseAdmin';
import { rateLimitCheck } from '@/lib/rateLimiter';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function POST(req: NextRequest) {
    // Rate limiting - image generation is expensive
    const rateLimitResponse = rateLimitCheck(req, 'image');
    if (rateLimitResponse) {
        return rateLimitResponse;
    }

    const openai = getOpenAI();
    try {
        const body = await req.json();
        const { prompt, model, size, quality, style, userId, aspectRatio, edit, image, mask } = body;

        if (!prompt) {
            return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
        }

        const savedUrls: string[] = [];
        let tempImageUrls: string[] = [];

        // --- EDIT MODE ---
        if (edit === true && image && mask) {
             try {
                // Convert Base64Str to file-like objects for OpenAI
                // Expects "data:image/png;base64,..."
                const imageBuffer = Buffer.from(image.split(',')[1], 'base64');
                const maskBuffer = Buffer.from(mask.split(',')[1], 'base64');

                // DALL-E 2 is the standard for edits currently
                const response = await openai.images.edit({
                    image: await toFile(imageBuffer, 'image.png'),
                    mask: await toFile(maskBuffer, 'mask.png'),
                    prompt: prompt,
                    n: 1,
                    size: size || "1024x1024",
                });
                
                tempImageUrls = (response.data || []).map(d => d.url || '').filter(u => u);

             } catch (editError: any) {
                 console.error("OpenAI Edit Error:", editError);
                 return NextResponse.json({ error: `Edit failed: ${editError.message}` }, { status: 500 });
             }
        }
        // --- GENERATION MODE ---
        else if (model.includes('dall-e')) {
             const response = await openai.images.generate({
                model: "dall-e-3",
                prompt: prompt,
                n: 1,
                size: size || "1024x1024",
                quality: quality || "standard",
                style: style || "vivid",
            });
            tempImageUrls = (response.data || []).map(d => d.url || '').filter(u => u);
        } 
        else if (model.includes('imagen') || model.includes('gemini')) {
            // Google Imagen 3 Integration
            const apiKey = process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY;
            
            // Default to imagen-3.0-generate-001 if general "imagen" requested
            const targetModel = model.includes('3') ? 'imagen-3.0-generate-001' : 'imagen-3.0-generate-001'; 
            
            // Construct the REST API URL for Google Generative Language API
            // Note: As of late 2025, Imagen 3 is available via this endpoint for AI Studio keys
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:predict?key=${apiKey}`;

            const requestBody = {
                instances: [
                    { prompt: prompt }
                ],
                parameters: {
                    sampleCount: 1,
                    aspectRatio: aspectRatio || "1:1",
                    personGeneration: "allow_adult" // Configurable based on safety settings
                }
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Google Imagen Error: ${errText}`);
            }

            const data = await response.json();
            
            // Extract Base64 images and upload them
            // Google returns { predictions: [ { bytesBase64Encoded: "..." } ] }
            if (data.predictions && data.predictions.length > 0) {
                 // Convert base64 to something we can store (or just treat effectively as temp URL)
                 // For consistency with the storage logic below which expects URLs to fetch:
                 // We will bypass the "fetch(url)" step for base64 and handle it directly.
                 
                 // Special handling for base64 data to reuse storage logic
                const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
                const bucket = adminStorage.bucket(bucketName); 

                for (const pred of data.predictions) {
                     const b64 = pred.bytesBase64Encoded || pred; // depends on exact response shape
                     const buffer = Buffer.from(b64, 'base64');
                     
                     if (userId) {
                        const fileName = `users/${userId}/generated/images/${Date.now()}_imagen.png`;
                        const file = bucket.file(fileName);
                        await file.save(buffer, { metadata: { contentType: 'image/png' } });
                        const [signedUrl] = await file.getSignedUrl({ action: 'read', expires: '03-01-2500' });
                        savedUrls.push(signedUrl);
                        
                        await adminDb.collection('users').doc(userId).collection('assets').add({
                            type: 'image',
                            url: signedUrl,
                            prompt,
                            model: targetModel,
                            createdAt: Date.now(),
                            storagePath: fileName,
                            metadata: { size, aspectRatio, quality, style }
                        });
                     } else {
                         // If no user, we can't easily return a public URL without storage
                         // Return data URI
                         savedUrls.push(`data:image/png;base64,${b64}`);
                     }
                }
                
                // Return immediately as we handled storage/urls manually for base64
                return NextResponse.json({ images: savedUrls });
            }
        }
        else {
             // Fallback
             return NextResponse.json({ error: "Unsupported model. Please use 'dall-e-3' or 'imagen-3.0'." }, { status: 400 });
        }

        // Save to Storage and Firestore
        if (userId && tempImageUrls.length > 0) {
            const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
            const bucket = adminStorage.bucket(bucketName); 

            for (const url of tempImageUrls) {
                try {
                    // Fetch image data
                    const imgRes = await fetch(url);
                    const buffer = await imgRes.arrayBuffer();
                    const bufferData = Buffer.from(buffer);
                    
                    const fileName = `users/${userId}/generated/images/${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
                    const file = bucket.file(fileName);
                    
                    await file.save(bufferData, {
                        metadata: { contentType: 'image/png' }
                    });

                    // Get a long-lived signed URL
                    const [signedUrl] = await file.getSignedUrl({
                        action: 'read',
                        expires: '03-01-2500'
                    });
                    
                    savedUrls.push(signedUrl);

                    // Save Metadata
                    await adminDb.collection('users').doc(userId).collection('assets').add({
                        type: 'image',
                        url: signedUrl,
                        prompt,
                        model,
                        createdAt: Date.now(),
                        storagePath: fileName,
                        metadata: { size, aspectRatio, quality, style }
                    });
                } catch (saveError) {
                    console.error("Failed to save image to storage:", saveError);
                    // Fallback to temp URL if storage fails, but warn
                    savedUrls.push(url);
                }
            }
        } else {
            savedUrls.push(...tempImageUrls);
        }

        return NextResponse.json({ images: savedUrls });

    } catch(e: any) {
        console.error("Image Gen Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
