/**
 * Image Route Handler
 * 
 * Handles /api/image endpoint for AI image generation.
 * Supports OpenAI DALL-E and Google Imagen models.
 */

const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const admin = require('firebase-admin');
const crypto = require('node:crypto');

// Vertex AI (ADC). Imagen/Veo are regional — served from us-central1, not the
// global endpoint that Gemini chat uses.
const VERTEX_PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';
const VERTEX_MEDIA_LOCATION = process.env.GOOGLE_CLOUD_LOCATION_MEDIA || 'us-central1';

// ============================================================================
// Main Handler
// ============================================================================

async function handleImage(req, res, { adminDb, bucket, writeJson, readJsonBody, toFirebaseDownloadUrl }) {
  try {
    const body = await readJsonBody(req);
    const prompt = body.prompt;
    const model = body.model || 'dall-e-3';
    const userId = body.userId || 'anonymous';
    
    if (typeof prompt !== 'string' || !prompt.trim()) {
      return writeJson(res, 400, { error: 'prompt is required' });
    }

    let base64Image = '';
    let mimeType = 'image/png';
    let provider = 'OpenAI';

    // Imagen on Vertex AI (latest: imagen-4.0-generate-001, us-central1)
    if (model.startsWith('imagen') || model.includes('gemini')) {
      provider = 'Vertex/Imagen';

      const ai = new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: VERTEX_MEDIA_LOCATION });

      try {
        const response = await ai.models.generateImages({
          model: 'imagen-4.0-generate-001',
          prompt: prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: body.aspectRatio || '16:9',
            outputMimeType: 'image/jpeg'
          }
        });

        // SDK shape varies by version: prefer response.generatedImages, fall back to response.response.*
        const image = (response.generatedImages || response.response?.generatedImages)?.[0]?.image;
        if (!image?.imageBytes) {
          return writeJson(res, 500, { error: 'No image data returned from Imagen (Vertex)' });
        }

        base64Image = image.imageBytes;
        mimeType = image.mimeType || 'image/jpeg';
      } catch (vertexError) {
        console.error('Imagen (Vertex) image gen error:', vertexError);
        throw vertexError;
      }
    } else {
      // OpenAI (DALL-E 3)
      if (!process.env.OPENAI_API_KEY) {
        return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
      }
      
      const size = body.size || '1024x1024';
      const quality = body.quality || 'standard';
      const style = body.style || 'vivid';

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.images.generate({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size,
        quality,
        style,
        response_format: 'b64_json',
      });

      const image = response.data?.[0];
      if (!image?.b64_json) {
        return writeJson(res, 500, { error: 'No image data returned from OpenAI' });
      }
      
      base64Image = image.b64_json;
      mimeType = 'image/png';
    }

    // Save to Storage and Firestore
    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');
      const imageId = crypto.randomUUID();
      const token = crypto.randomUUID();
      const fileName = `generated_images/${imageId}.${mimeType.split('/')[1]}`;
      
      await bucket.file(fileName).save(imageBuffer, {
        metadata: {
          contentType: mimeType,
          metadata: {
            generatedBy: 'Amble Studio',
            model,
            firebaseStorageDownloadTokens: token,
          },
        },
      });

      const downloadUrl = toFirebaseDownloadUrl(fileName, token);

      await adminDb.collection('generated_assets').add({
        userId,
        type: 'image',
        url: downloadUrl,
        storagePath: fileName,
        prompt,
        model,
        metadata: { provider },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      const fullBase64 = `data:${mimeType};base64,${base64Image}`;
      return writeJson(res, 200, { images: [fullBase64] });

    } catch (saveError) {
      console.error('Failed to save image to gallery:', saveError);
      const fullBase64 = `data:${mimeType};base64,${base64Image}`;
      return writeJson(res, 200, { images: [fullBase64], warning: 'Failed to save to gallery' });
    }

  } catch (e) {
    console.error('Error in image handler:', e);
    return writeJson(res, 500, { error: e.message || 'Failed to generate image' });
  }
}

module.exports = { handleImage };
