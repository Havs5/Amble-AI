/**
 * Video Analysis Route Handler — Vertex AI.
 *
 * Handles /api/video/analyze. Migrated off the Gemini Developer API
 * (GoogleAIFileManager upload + gemini-1.5-pro) to Vertex `@google/genai`:
 * the Storage video is passed directly as a `gs://` URI (no upload/poll step),
 * analyzed with gemini-2.5-flash. Auth is ADC (the function's runtime SA).
 */

const { GoogleGenAI } = require('@google/genai');

const VERTEX_PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';
// Video models are regional (us-central1), not on the global endpoint.
const VERTEX_MEDIA_LOCATION = process.env.GOOGLE_CLOUD_LOCATION_MEDIA || 'us-central1';

async function handleVideoAnalyze(req, res, { bucket, writeJson, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const { videoUrl, storagePath, prompt } = body;

    if (!videoUrl && !storagePath) {
      return writeJson(res, 400, { error: 'videoUrl or storagePath is required' });
    }

    // Build the video content part. Prefer a gs:// URI (Vertex reads Storage
    // directly, same project/SA); otherwise download and inline the bytes.
    let videoPart;
    if (storagePath) {
      videoPart = { fileData: { mimeType: 'video/mp4', fileUri: `gs://${bucket.name}/${storagePath}` } };
    } else {
      const vidResponse = await fetch(videoUrl);
      if (!vidResponse.ok) throw new Error(`Failed to fetch video: ${vidResponse.statusText}`);
      const buf = Buffer.from(await vidResponse.arrayBuffer());
      videoPart = { inlineData: { mimeType: 'video/mp4', data: buf.toString('base64') } };
    }

    const ai = new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: VERTEX_MEDIA_LOCATION });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{
        role: 'user',
        parts: [
          videoPart,
          {
            text: prompt || 'Analyze this video precisely. Describe the action, setting, lighting, and any important events. Provide a structured summary.',
          },
        ],
      }],
    });

    const text = response.text || '';
    return writeJson(res, 200, { analysis: text });
  } catch (e) {
    console.error('Error in video analyze handler:', e);
    return writeJson(res, 500, { error: e.message || 'Video analysis failed' });
  }
}

module.exports = { handleVideoAnalyze };
