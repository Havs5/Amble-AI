/**
 * Audio Route Handler
 *
 * /api/transcribe  — speech-to-text (OpenAI Whisper; see PHI note below)
 * /api/rewrite     — Shorter/Firmer reply edits (Vertex Gemini when PHI-safe)
 * /api/audio/speech— text-to-speech (OpenAI tts-1; see PHI note below)
 *
 * ── HIPAA / PHI note ─────────────────────────────────────────────────────────
 * Audio content can carry PHI. Vertex AI is inside Google Cloud's HIPAA BAA; the
 * OpenAI API is not (without an OpenAI BAA). `PHI_SAFE_MODE` (default on) routes
 * the text **rewrite** path to Vertex Gemini. **Transcription + TTS are NOT yet
 * migrated**: Gemini multimodal does not accept the browser's webm/opus audio,
 * so a clean migration needs **Cloud Speech-to-Text** + **Cloud Text-to-Speech**,
 * which must be enabled on amble-ai first:
 *   gcloud services enable speech.googleapis.com texttospeech.googleapis.com --project=amble-ai
 * Until then these two stay on OpenAI (transcription's default is the free
 * browser Web Speech API anyway; Whisper is opt-in, and TTS has no live caller).
 * See SOT §10.2 P0 / ARCHITECTURE §16.
 */

const OpenAI = require('openai');
const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const nodePath = require('path');
const os = require('os');

// Keep all PHI-bearing AI on Vertex (in-BAA) unless explicitly disabled.
const PHI_SAFE_MODE = process.env.PHI_SAFE_MODE !== 'false';
const VERTEX_PROJECT = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'amble-ai';

// Light text edit via Vertex Gemini (stable GA model, regional). Used by the
// PHI-safe rewrite path so reply text never leaves the GCP BAA boundary.
async function geminiRewrite(instruction, replyText) {
  const ai = new GoogleGenAI({ vertexai: true, project: VERTEX_PROJECT, location: 'us-central1' });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [{ role: 'user', parts: [{ text: `${instruction}\n\nOriginal Reply:\n${replyText}\n\nOutput ONLY the rewritten reply, nothing else.` }] }],
    config: { temperature: 0.3, maxOutputTokens: 2048 },
  });
  return response.text || replyText;
}

// ============================================================================
// Main Handler
// ============================================================================

async function handleTranscribe(req, res, { writeJson, readJsonBody }) {
  const tempFilePath = nodePath.join(os.tmpdir(), `audio_${Date.now()}.webm`);
  
  try {
    if (!process.env.OPENAI_API_KEY) {
      return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
    }
    
    const body = await readJsonBody(req);
    const audioBase64 = body.audio;
    const skipCorrection = body.skipCorrection === true;
    
    if (!audioBase64) {
      return writeJson(res, 400, { error: 'Audio data is required (base64)' });
    }

    // Save base64 to temp file
    const buffer = Buffer.from(audioBase64, 'base64');
    
    // Limit size (25MB Whisper limit)
    if (buffer.length > 25 * 1024 * 1024) {
      return writeJson(res, 413, { error: 'Audio file too large (max 25MB)' });
    }

    fs.writeFileSync(tempFilePath, buffer);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });
    
    const rawText = transcription.text;
    
    if (!rawText) {
      return writeJson(res, 200, { text: "", raw: "", corrected: false });
    }

    // Skip correction if requested (cost optimization)
    if (skipCorrection) {
      return writeJson(res, 200, { text: rawText, raw: rawText, corrected: false });
    }

    // Light correction with gpt-4o-mini (90% cheaper than gpt-4o)
    const correctionResponse = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "Fix any obvious spelling or grammar errors in this transcription. Keep the original meaning. Output ONLY the corrected text, nothing else."
        },
        {
          role: "user",
          content: rawText
        }
      ],
      temperature: 0.1,
      max_tokens: 500,
    });

    const correctedText = correctionResponse.choices[0].message.content || rawText;

    return writeJson(res, 200, { text: correctedText, raw: rawText, corrected: true });

  } catch (e) {
    console.error('Error in transcribe handler:', e);
    return writeJson(res, 500, { error: 'Transcription failed', details: e.message });
  } finally {
    // Cleanup temp file
    if (fs.existsSync(tempFilePath)) {
      try { 
        fs.unlinkSync(tempFilePath); 
      } catch (e) { 
        console.warn('Temp file cleanup failed', e); 
      }
    }
  }
}

// ============================================================================
// Rewrite Handler
// ============================================================================

async function handleRewrite(req, res, { writeJson, readJsonBody }) {
  try {
    const body = await readJsonBody(req);
    const replyText = body.replyText;
    const rewriteMode = body.rewriteMode;

    if (typeof replyText !== 'string') {
      return writeJson(res, 400, { error: 'replyText is required' });
    }

    if (rewriteMode !== 'Shorter' && rewriteMode !== 'Firmer') {
      return writeJson(res, 200, { reply: replyText });
    }

    const instruction = rewriteMode === 'Shorter'
      ? 'Make the following reply shorter and more concise.'
      : 'Make the following reply firmer and more authoritative, while remaining professional.';

    // PHI-safe: reply text (potential PHI) is rewritten on Vertex Gemini, in-BAA.
    if (PHI_SAFE_MODE) {
      const newReply = await geminiRewrite(instruction, replyText);
      return writeJson(res, 200, { reply: newReply });
    }

    // Legacy path (only when PHI-safe mode is explicitly disabled).
    if (!process.env.OPENAI_API_KEY) {
      return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
    }
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful editor.' },
        { role: 'user', content: `${instruction}\n\nOriginal Reply:\n${replyText}` },
      ],
    });

    const newReply = completion.choices?.[0]?.message?.content || replyText;
    return writeJson(res, 200, { reply: newReply });

  } catch (e) {
    console.error('Error in rewrite handler:', e);
    return writeJson(res, 500, { error: e.message || 'Failed to rewrite draft' });
  }
}

// ============================================================================
// Speech Handler (TTS)
// ============================================================================

async function handleSpeech(req, res, { writeJson, readJsonBody }) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
    }
    
    const body = await readJsonBody(req);
    const { text, voice = 'alloy', speed = 1.0 } = body;

    if (!text) {
      return writeJson(res, 400, { error: 'Text is required' });
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      speed: Math.max(0.25, Math.min(4.0, speed)),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());
    const base64 = buffer.toString('base64');

    return writeJson(res, 200, { audio: `data:audio/mp3;base64,${base64}` });
    
  } catch (e) {
    console.error('Error in speech handler:', e);
    return writeJson(res, 500, { error: e.message || 'Speech generation failed' });
  }
}

module.exports = { handleTranscribe, handleRewrite, handleSpeech };
