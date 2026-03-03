/**
 * Audio Route Handler
 * 
 * Handles /api/transcribe endpoint for audio transcription.
 * Uses OpenAI Whisper with optional GPT correction.
 */

const OpenAI = require('openai');
const fs = require('fs');
const nodePath = require('path');
const os = require('os');

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
    if (!process.env.OPENAI_API_KEY) {
      return writeJson(res, 500, { error: 'OPENAI_API_KEY is missing' });
    }
    
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
