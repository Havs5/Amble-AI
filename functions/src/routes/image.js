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

    // Gemini (Imagen)
    if (model.startsWith('imagen') || model.includes('gemini')) {
      provider = 'Gemini';
      if (!process.env.GEMINI_API_KEY) {
        return writeJson(res, 500, { error: 'GEMINI_API_KEY is missing' });
      }
      
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1beta' });
      
      try {
        const response = await ai.models.generateImages({
          model: 'imagen-2.0-generate-001',
          prompt: prompt,
          config: {
            numberOfImages: 1,
            aspectRatio: body.aspectRatio || '16:9',
            outputMimeType: 'image/jpeg'
          }
        });
        
        const image = response.response?.generatedImages?.[0]?.image;
        if (!image?.imageBytes) {
          return writeJson(res, 500, { error: 'No image data returned from Gemini' });
        }
        
        base64Image = image.imageBytes;
        mimeType = image.mimeType || 'image/jpeg';
      } catch (geminiError) {
        console.error('Gemini image gen error:', geminiError);
        throw geminiError;
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
