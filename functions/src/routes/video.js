/**
 * Video Route Handler
 * 
 * Handles /api/veo endpoint for AI video generation.
 * Supports Google Veo and OpenAI Sora models.
 */

const admin = require('firebase-admin');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const { GoogleGenAI, VideoGenerationReferenceType } = require('@google/genai');

// ============================================================================
// Sora Handler
// ============================================================================

async function handleSoraGeneration(req, res, { body, userId, bucket, adminDb, writeJson, toFirebaseDownloadUrl }) {
  const model = body.model;
  const prompt = body.prompt;
  
  if (!process.env.OPENAI_API_KEY) {
    return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
  }

  // Determine duration (Sora supports 4-8 seconds)
  let durationSeconds = 5;
  if (body.durationSeconds !== undefined) {
    const parsed = parseInt(body.durationSeconds, 10);
    if (!isNaN(parsed)) durationSeconds = Math.max(4, Math.min(8, parsed));
  }

  console.log(`[Sora] Model: ${model}, Duration: ${durationSeconds}s`);

  // Create video generation request
  const createResp = await fetch('https://api.openai.com/v1/videos', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      prompt,
      resolution: '1080p',
      aspect_ratio: body.aspectRatio || '16:9',
      quality: 'standard',
      durationSeconds,
    }),
  });

  if (!createResp.ok) {
    const text = await createResp.text().catch(() => '');
    return writeJson(res, createResp.status, { error: 'Sora generation failed', details: text });
  }

  const job = await createResp.json();
  const videoId = job?.id;
  if (!videoId) {
    return writeJson(res, 500, { error: 'No video ID returned from Sora' });
  }

  // Poll for completion
  const startTime = Date.now();
  const MAX_POLL_TIME = 540 * 1000; // 9 minutes
  let status = job.status;

  while (['queued', 'in_progress', 'processing', 'pending'].includes(status)) {
    if (Date.now() - startTime > MAX_POLL_TIME) {
      return writeJson(res, 504, { error: 'Video generation timed out' });
    }
    
    await new Promise(r => setTimeout(r, 5000));

    const pollResp = await fetch(`https://api.openai.com/v1/videos/${videoId}`, {
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
    });

    if (!pollResp.ok) {
      console.warn('Sora poll failed:', pollResp.status);
      continue;
    }
    
    const pollData = await pollResp.json();
    status = pollData.status;
    
    if (status === 'failed') {
      return writeJson(res, 500, { error: 'Sora generation failed', details: pollData.error });
    }
    
    if (status === 'completed' || status === 'succeeded') {
      const resultUrl = pollData.result?.url || pollData.url || pollData.data?.[0]?.url;
      if (!resultUrl) {
        return writeJson(res, 500, { error: 'Sora completed but no URL found' });
      }
      
      // Upload to Firebase Storage
      try {
        const response = await fetch(resultUrl);
        if (!response.ok) throw new Error(`Failed to fetch video: ${response.statusText}`);

        const fileName = `generated_videos/sora/${videoId}.mp4`;
        const token = crypto.randomUUID();
        const file = bucket.file(fileName);
        const writeStream = file.createWriteStream({
          metadata: {
            contentType: 'video/mp4',
            metadata: {
              generatedBy: 'Amble Studio',
              model,
              firebaseStorageDownloadTokens: token,
            },
          },
        });

        await new Promise((resolve, reject) => {
          if (response.body && typeof response.body.getReader === 'function') {
            Readable.fromWeb(response.body).pipe(writeStream)
              .on('finish', resolve)
              .on('error', reject);
          } else {
            Readable.from(response.body).pipe(writeStream)
              .on('finish', resolve)
              .on('error', reject);
          }
        });

        const downloadUrl = toFirebaseDownloadUrl(fileName, token);
        
        await adminDb.collection('generated_assets').add({
          userId,
          type: 'video',
          url: downloadUrl,
          storagePath: fileName,
          prompt,
          model,
          metadata: { provider: 'OpenAI' },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        
        return writeJson(res, 200, { videoId, videoUrl: downloadUrl, videoObject: { uri: downloadUrl } });
      } catch (e) {
        console.error('Sora upload failed:', e);
        // Fallback to direct link
        await adminDb.collection('generated_assets').add({
          userId,
          type: 'video',
          url: resultUrl,
          storagePath: null,
          prompt,
          model,
          metadata: { provider: 'OpenAI', external: true },
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
        
        return writeJson(res, 200, { videoId, videoUrl: resultUrl, warning: 'Upload failed, using direct link' });
      }
    }
  }
  
  return writeJson(res, 500, { error: `Sora ended with unexpected status: ${status}` });
}

// ============================================================================
// Veo Handler
// ============================================================================

async function handleVeoGeneration(req, res, { body, userId, bucket, adminDb, writeJson, toFirebaseDownloadUrl }) {
  const model = body.model || 'veo-2.0-generate-preview-001';
  const prompt = body.prompt;
  
  if (!process.env.GEMINI_API_KEY) {
    return writeJson(res, 500, { error: 'GEMINI_API_KEY is missing' });
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1alpha' });

  const config = {
    numberOfVideos: 1,
  };
  
  // Resolution
  if (body.resolution === '1080p' || body.resolution === '2K') {
    config.resolution = '1080p';
  } else {
    config.resolution = '720p';
  }

  if (body.mode !== 'EXTEND_VIDEO') {
    config.aspectRatio = body.aspectRatio || '16:9';
  }
  
  // Duration
  let durationSeconds = 5;
  const durationMatch = prompt.match(/(\d+)\s*seconds?/i);
  if (durationMatch) {
    durationSeconds = parseInt(durationMatch[1]);
  }
  config.durationSeconds = Math.max(5, Math.min(60, durationSeconds));

  const payload = { model, config, prompt };

  // References
  if (body.mode === 'REFERENCES_TO_VIDEO') {
    const referenceImages = [];
    if (Array.isArray(body.referenceImages)) {
      for (const img of body.referenceImages) {
        if (img?.base64 && img?.mimeType) {
          referenceImages.push({
            image: { imageBytes: img.base64, mimeType: img.mimeType },
            referenceType: VideoGenerationReferenceType.ASSET,
          });
        }
      }
    }
    if (body.styleImage?.base64 && body.styleImage?.mimeType) {
      referenceImages.push({
        image: { imageBytes: body.styleImage.base64, mimeType: body.styleImage.mimeType },
        referenceType: VideoGenerationReferenceType.STYLE,
      });
    }
    if (referenceImages.length) payload.config.referenceImages = referenceImages;
  }

  // Start generation
  let operation = await ai.models.generateVideos(payload);

  const startTime = Date.now();
  const MAX_POLL_TIME = 280 * 1000;
  
  while (!operation.done) {
    if (Date.now() - startTime > MAX_POLL_TIME) {
      return writeJson(res, 504, { error: 'Video generation timed out' });
    }
    await new Promise(r => setTimeout(r, 5000));
    try {
      operation = await ai.operations.getVideosOperation({ operation });
    } catch {
      // Keep polling
    }
  }

  if (operation.error) {
    return writeJson(res, 500, { error: 'Video generation failed', details: operation.error });
  }

  const videos = operation?.response?.generatedVideos;
  const videoObject = videos?.[0]?.video;
  if (!videoObject?.uri) {
    return writeJson(res, 500, { error: 'Generated video is missing a URI' });
  }

  const rawUrl = decodeURIComponent(videoObject.uri);
  let fetchUrl;
  try {
    fetchUrl = new URL(rawUrl);
    fetchUrl.searchParams.append('key', process.env.GEMINI_API_KEY);
  } catch {
    fetchUrl = rawUrl;
  }

  // Upload to Firebase Storage
  try {
    let contentResp = await fetch(fetchUrl.toString());
    if (!contentResp.ok) {
      await new Promise(r => setTimeout(r, 1000));
      contentResp = await fetch(fetchUrl.toString());
    }
    
    if (!contentResp.ok) {
      throw new Error(`Failed to fetch video content: ${contentResp.status}`);
    }

    const videoId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const fileName = `generated_videos/veo/${videoId}.mp4`;
    const file = bucket.file(fileName);
    const writeStream = file.createWriteStream({
      metadata: {
        contentType: 'video/mp4',
        metadata: {
          generatedBy: 'Amble Studio',
          model,
          firebaseStorageDownloadTokens: token,
        },
      },
    });

    await new Promise((resolve, reject) => {
      Readable.fromWeb(contentResp.body).pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });

    const downloadUrl = toFirebaseDownloadUrl(fileName, token);

    await adminDb.collection('generated_assets').add({
      userId,
      type: 'video',
      url: downloadUrl,
      storagePath: fileName,
      prompt,
      model,
      metadata: { provider: 'Gemini' },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return writeJson(res, 200, { videoUrl: downloadUrl, videoObject });
  } catch (e) {
    console.error('Veo upload failed:', e);
    const directUrl = fetchUrl.toString();
    await adminDb.collection('generated_assets').add({
      userId,
      type: 'video',
      url: directUrl,
      storagePath: null,
      prompt,
      model,
      metadata: { provider: 'Gemini', external: true },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }).catch(() => {});
    
    return writeJson(res, 200, { videoUrl: directUrl, videoObject, warning: 'Upload failed, using direct link' });
  }
}

// ============================================================================
// Main Handler
// ============================================================================

async function handleVideo(req, res, { adminDb, bucket, writeJson, readJsonBody, toFirebaseDownloadUrl }) {
  try {
    const body = await readJsonBody(req);
    const model = body.model || 'veo-2.0-generate-preview-001';
    const userId = body.userId || 'anonymous';
    const prompt = body.prompt;

    console.log('Video API Request:', { model, prompt: prompt ? 'present' : 'missing' });

    if (typeof prompt !== 'string' || !prompt.trim()) {
      return writeJson(res, 400, { error: 'prompt is required' });
    }

    // Route to appropriate handler
    if (String(model).includes('sora')) {
      return handleSoraGeneration(req, res, { body, userId, bucket, adminDb, writeJson, toFirebaseDownloadUrl });
    } else {
      return handleVeoGeneration(req, res, { body, userId, bucket, adminDb, writeJson, toFirebaseDownloadUrl });
    }

  } catch (e) {
    console.error('Error in video handler:', e);
    return writeJson(res, 500, { error: e.message || 'Video generation failed' });
  }
}

module.exports = { handleVideo };
