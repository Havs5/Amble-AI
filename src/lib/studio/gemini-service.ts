import { GoogleGenerativeAI } from "@google/generative-ai";
import { ChatModelType } from "../../types/studio";
import { UsageManager } from "../usageManager";

// Helper to get AI instance. 
// For paid features (Veo/Pro Image), we must re-instantiate to ensure we pick up the user-selected key.
const getAI = () => {
  // Try to get key from environment variables (Next.js client-side)
  const apiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
  return new GoogleGenerativeAI(apiKey);
};

const checkLimits = (userId: string | undefined, category: 'studio' | 'ambleAi' | 'cx') => {
    UsageManager.checkLimits(userId, category);
};

export const generateText = async (
  prompt: string,
  type: ChatModelType | 'gpt-4o',
  history: { role: string; parts: { text: string }[] }[] = [],
  location?: { latitude: number; longitude: number },
  userId?: string
): Promise<{ text: string; groundingMetadata?: any }> => {
  
  if (userId) {
      checkLimits(userId, 'ambleAi');
  }
  
  // Handle OpenAI (GPT-4o)
  if (type === 'gpt-4o') {
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...history.map(h => ({ role: h.role === 'model' ? 'assistant' : h.role, content: h.parts[0].text })), { role: 'user', content: prompt }],
          model: 'gpt-4o',
          stream: false,
          userId: userId
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate text');
      }

      const data = await response.json();
      // /api/chat returns standard OpenAI format for non-streaming?
      // We need to check /api/chat implementation for non-streaming text.
      // Looking at route.ts, if stream is false, it falls through to... where?
      // Let's assume it returns standard OpenAI response or we need to fix route.ts.
      
      // Actually, looking at route.ts, if stream is false, it continues to line 450+ (Text Generation Non-Streaming).
      return {
        text: data.choices?.[0]?.message?.content || data.content || "No response",
      };
    } catch (e) {
      console.error("OpenAI Text Error:", e);
      return { text: "Error generating text with OpenAI." };
    }
  }

  const ai = getAI();
  let modelName = type === ChatModelType.THINKING ? 'gemini-1.5-pro' : type;
  
  // Specific model override logic based on prompt requirements if strict matching is needed
  if (type === ChatModelType.MAPS) modelName = 'gemini-1.5-flash';

  const config: any = {};
  
  if (type === ChatModelType.THINKING) {
    // config.thinkingConfig = { thinkingBudget: 32768 }; // Not supported in 1.5
    // Explicitly NOT setting maxOutputTokens as per requirement
  }

  if (type === ChatModelType.SEARCH) {
    config.tools = [{ googleSearch: {} }];
  }

  if (type === ChatModelType.MAPS) {
    config.tools = [{ googleMaps: {} }];
    if (location) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: location
        }
      };
    }
  }

  const modelParams: any = { model: modelName };
  if (config.tools) modelParams.tools = config.tools;
  if (config.toolConfig) modelParams.toolConfig = config.toolConfig;

  const model = ai.getGenerativeModel(modelParams);

  const chat = model.startChat({
    history: history as any
  });

  const result = await chat.sendMessage(prompt);
  const response = await result.response;
  
  return {
    text: response.text(),
    groundingMetadata: (response.candidates?.[0] as any)?.groundingMetadata 
  };
};

export const generateImage = async (
  prompt: string,
  size: '1K' | '2K' | '4K',
  aspectRatio: string,
  model: string = 'dall-e-3',
  userId?: string
): Promise<string[]> => {
  
  if (userId) {
      checkLimits(userId, 'studio');
  }

  // Map size/aspectRatio to supported sizes
  // DALL-E 3 supports 1024x1024, 1024x1792, 1792x1024
  let sizeStr = '1024x1024';
  
  if (aspectRatio === '16:9') { sizeStr = '1792x1024'; }
  if (aspectRatio === '9:16') { sizeStr = '1024x1792'; }

  try {
    // Use our backend API for all image generation
    const response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: prompt,
        model: model, 
        size: sizeStr,
        quality: 'standard',
        style: 'vivid',
        userId: userId,
        aspectRatio: aspectRatio // Pass ratio for Imagen
      })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate image');
    }
    
    const data = await response.json();
    
    if (data.images && data.images.length > 0) {
      return data.images;
    }
    return [];
  } catch (e) {
    console.error("Image Generation Error:", e);
    return [];
  }
};

export const editImage = async (
  prompt: string,
  base64Image: string, // Raw base64 data without prefix
  mimeType: string
): Promise<string[]> => {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Image,
        mimeType: mimeType
      }
    },
    prompt
  ]);

  const response = await result.response;

  const images: string[] = [];
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData && part.inlineData.data) {
        images.push(`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`);
      }
    }
  }
  return images;
};

/**
 * Orchestrates a Style Transfer by:
 * 1. Analyzing the content image (and style image if provided) using Gemini Vision.
 * 2. Generating a new prompt combining content description + style.
 * 3. Generating a new image using DALL-E 3 / Imagen.
 */
export const transferStyle = async (
  contentImage: { data: string, mime: string },
  stylePrompt: string,
  styleImage?: { data: string, mime: string },
  userId?: string
): Promise<string[]> => {
    const ai = getAI();
    const visionModel = ai.getGenerativeModel({ model: 'gemini-1.5-flash-latest' });
    
    // Step 1: Analyze Content
    const contentAnalyzeResult = await visionModel.generateContent([
        { inlineData: { data: contentImage.data, mimeType: contentImage.mime } },
        "Describe the main subject, composition, and layout of this image in detail. Focus on the physical objects and their arrangement."
    ]);
    const contentDesc = contentAnalyzeResult.response.text();
    
    let finalStyle = stylePrompt;
    
    // Step 2: Analyze Style Image (if provided)
    if (styleImage) {
        const styleAnalyzeResult = await visionModel.generateContent([
            { inlineData: { data: styleImage.data, mimeType: styleImage.mime } },
            "Describe the art style, artistic technique, brushstrokes, color palette, and mood of this image. Do not describe the subject matter, only the style."
        ]);
        const styleDesc = styleAnalyzeResult.response.text();
        finalStyle = `${stylePrompt}. The style should resemble: ${styleDesc}`;
    }
    
    // Step 3: Construct Prompt
    const finalPrompt = `Create an image with the following composition: ${contentDesc}. \n\nApply this art style: ${finalStyle}. \n\nEnsure high fidelity to the original composition.`;
    
    console.log("Style Transfer Prompt:", finalPrompt);
    
    // Step 4: Generate
    return generateImage(finalPrompt, '1K', '1:1', 'dall-e-3', userId);
};

export const generateVideo = async (
  prompt: string | undefined,
  base64Image: string | undefined, // Raw base64
  mimeType: string | undefined,
  aspectRatio: '16:9' | '9:16',
  model: string = 'veo-3.1-generate-preview',
  userId?: string
): Promise<string | null> => {
  
  if (userId) {
      checkLimits(userId, 'studio');
  }

  // Ensure Key Selection for Veo if using client-side, but we use API route now
  
  try {
    const response = await fetch('/api/veo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            image: base64Image, // API expects 'image' or 'imageBytes'? Check route.ts
            mimeType,
            aspectRatio,
            resolution: '1080p',
            model: model,
            userId // Pass userId to backend for tracking
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate video');
    }

    const data = await response.json();
    return data.videoUrl || data.videoObject?.uri || null;

  } catch (e) {
      console.error("Video Generation Error:", e);
      return null;
  }
};

export const analyzeMedia = async (
  prompt: string,
  mimeType: string,
  data: string, // base64
  isVideo: boolean
): Promise<string> => {
  const ai = getAI();
  const modelName = isVideo ? 'gemini-1.5-pro' : 'gemini-1.5-pro';
  const model = ai.getGenerativeModel({ model: modelName });
  
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data
      }
    },
    prompt || (isVideo ? "Describe this video in detail." : "Analyze this image.")
  ]);

  return result.response.text() || "Could not analyze content.";
};

export const transcribeAudio = async (base64Audio: string, mimeType: string): Promise<string> => {
  const ai = getAI();
  const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType,
        data: base64Audio
      }
    },
    "Transcribe this audio."
  ]);
  return result.response.text() || "No transcription available.";
};

export const generateSpeech = async (text: string): Promise<AudioBuffer | null> => {
    const ai = getAI();
    try {
        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash-preview-tts" });
        
        // Using any to bypass typing for experimental features
        const generationConfig: any = {
            responseModalities: ["AUDIO"],
            speechConfig: {
                voiceConfig: {
                    prebuiltVoiceConfig: { voiceName: 'Kore' },
                },
            },
        };

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig
        });

        const response = result.response;
        const base64Audio = (response.candidates?.[0]?.content?.parts?.[0] as any)?.inlineData?.data;
        
        if (!base64Audio) return null;

        const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const audioBuffer = await decodeAudioData(
            decode(base64Audio),
            outputAudioContext,
            24000,
            1
        );
        return audioBuffer;

    } catch (e) {
        console.error("TTS Error", e);
        return null;
    }
}

// --- Audio Helpers ---

function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}
