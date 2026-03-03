/**
 * Video Analysis Route Handler
 * 
 * Handles /api/video/analyze endpoint for analyzing video content.
 * Uses Gemini 1.5 Pro with video understanding capabilities.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require('fs');
const nodePath = require('path');
const os = require('os');
const { Readable } = require('node:stream');

// ============================================================================
// Main Handler
// ============================================================================

async function handleVideoAnalyze(req, res, { bucket, writeJson, readJsonBody }) {
  const tempFilePath = nodePath.join(os.tmpdir(), `vid_analyze_${Date.now()}.mp4`);
  
  try {
    if (!process.env.GEMINI_API_KEY) {
      return writeJson(res, 500, { error: 'GEMINI_API_KEY is missing' });
    }
    
    const body = await readJsonBody(req);
    const { videoUrl, storagePath, prompt } = body;

    if (!videoUrl && !storagePath) {
      return writeJson(res, 400, { error: 'videoUrl or storagePath is required' });
    }

    // Download video to temp
    let fetchUrl = videoUrl;
    if (storagePath) {
      const [url] = await bucket.file(storagePath).getSignedUrl({ 
        action: 'read', 
        expires: Date.now() + 15 * 60 * 1000 
      });
      fetchUrl = url;
    }

    const vidResponse = await fetch(fetchUrl);
    if (!vidResponse.ok) {
      throw new Error(`Failed to fetch video: ${vidResponse.statusText}`);
    }
    
    const fileStream = fs.createWriteStream(tempFilePath);
    await new Promise((resolve, reject) => {
      if (vidResponse.body?.pipe) {
        vidResponse.body.pipe(fileStream);
      } else {
        Readable.fromWeb(vidResponse.body).pipe(fileStream);
      }
      fileStream.on('finish', resolve);
      fileStream.on('error', reject);
    });

    // Upload to Gemini File Manager
    const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: "video/mp4",
      displayName: "Amble Video Analysis"
    });
    
    const fileUri = uploadResponse.file.uri;
    let fileState = uploadResponse.file.state;
    
    // Wait for processing
    console.log(`[VideoAnalysis] Uploaded ${fileUri}, State: ${fileState}`);
    let attempts = 0;
    while (fileState === "PROCESSING" && attempts < 20) {
      await new Promise(r => setTimeout(r, 2000));
      const freshFile = await fileManager.getFile(uploadResponse.file.name);
      fileState = freshFile.state;
      console.log(`[VideoAnalysis] Processing... ${fileState}`);
      attempts++;
    }
    
    if (fileState === "FAILED") {
      throw new Error("Video processing failed by Google");
    }

    // Generate analysis
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: fileUri
        }
      },
      { 
        text: prompt || "Analyze this video precisely. Describe the action, setting, lighting, and any important events. Provide a structured summary." 
      }
    ]);

    const text = result.response.text();

    // Cleanup
    try { fs.unlinkSync(tempFilePath); } catch(e) {}
    try { await fileManager.deleteFile(uploadResponse.file.name); } catch(e) {}

    return writeJson(res, 200, { analysis: text });

  } catch (e) {
    console.error('Error in video analyze handler:', e);
    try { 
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath); 
    } catch {}
    return writeJson(res, 500, { error: e.message || 'Video analysis failed' });
  }
}

module.exports = { handleVideoAnalyze };
