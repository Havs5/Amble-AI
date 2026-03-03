import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// Common medical terms to help Whisper with accuracy
const MEDICAL_PROMPT = `Medical transcription context: patient, diagnosis, treatment, prescription, symptoms, vital signs, blood pressure, heart rate, medication, dosage, mg, ml, CBC, MRI, CT scan, ECG, EKG, BMI, diabetes, hypertension, chronic, acute, bilateral, unilateral, anterior, posterior, lateral, medial, proximal, distal, prognosis, etiology, pathology, oncology, cardiology, neurology, orthopedics, pediatrics, geriatrics, immunization, vaccination, antibiotic, analgesic, anti-inflammatory, NSAID, acetaminophen, ibuprofen, aspirin, metformin, lisinopril, amlodipine, omeprazole, levothyroxine, atorvastatin, albuterol, gabapentin, losartan, hydrochlorothiazide.`;

export async function POST(request: NextRequest) {
  const openai = getOpenAI();
  try {
    const { audio, skipCorrection = false, language = 'en' } = await request.json();
    
    if (!audio) {
      return NextResponse.json(
        { error: 'No audio data provided' },
        { status: 400 }
      );
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');
    
    // Validate audio size (max 25MB for Whisper)
    if (audioBuffer.length > 25 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Audio file too large. Maximum size is 25MB.' },
        { status: 400 }
      );
    }
    
    // Minimum size check
    if (audioBuffer.length < 100) {
      return NextResponse.json(
        { error: 'Audio file too small or empty.' },
        { status: 400 }
      );
    }
    
    // Create a File object from the buffer for the OpenAI API
    const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

    // Call OpenAI Whisper API for transcription with medical context prompt
    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: 'whisper-1',
      language: language, // Use passed language or default to English
      response_format: 'text',
      prompt: MEDICAL_PROMPT, // Improves accuracy for medical terminology
      temperature: 0, // More deterministic output
    });

    // Cost optimization: Skip GPT correction if requested
    // This saves ~$0.01+ per request
    if (skipCorrection) {
      return NextResponse.json({ 
        text: transcription,
        raw: transcription,
        corrected: false,
        success: true 
      });
    }

    // Optional: Light correction with cheaper model (gpt-4o-mini)
    // This reduces correction cost by ~90% compared to gpt-4o
    try {
      const correctionResponse = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are a medical transcription editor. Your task is to:
1. Fix obvious spelling and grammar errors
2. Correct medical terminology if misspelled (e.g., "hypertention" → "hypertension")
3. Ensure proper capitalization for medical terms and drug names
4. Keep the original meaning and tone exactly
5. Preserve medical abbreviations (mg, ml, CBC, etc.)

Output ONLY the corrected text with no explanations or additional commentary.`
          },
          {
            role: 'user',
            content: transcription as string
          }
        ],
        temperature: 0.1,
        max_tokens: 1000,
      });

      const correctedText = correctionResponse.choices[0]?.message?.content || transcription;
      
      return NextResponse.json({ 
        text: correctedText,
        raw: transcription,
        corrected: true,
        success: true 
      });
    } catch (correctionError) {
      // If correction fails, return raw transcription
      console.warn('Correction failed, returning raw:', correctionError);
      return NextResponse.json({ 
        text: transcription,
        raw: transcription,
        corrected: false,
        success: true 
      });
    }
    
  } catch (error: any) {
    console.error('Transcription error:', error);
    
    // Handle specific OpenAI errors
    if (error?.status === 401) {
      return NextResponse.json(
        { error: 'Invalid API key for transcription service' },
        { status: 401 }
      );
    }
    
    if (error?.status === 429) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again in a moment.' },
        { status: 429 }
      );
    }
    
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND') {
      return NextResponse.json(
        { error: 'Network error. Please check your connection.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to transcribe audio. Please try again.' },
      { status: 500 }
    );
  }
}
