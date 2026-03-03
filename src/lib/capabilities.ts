export type CapabilityKey = 'realtimeVoice' | 'audioIn' | 'webBrowse' | 'fileSearch' | 'codeInterpreter' | 'imageGen' | 'jsonSchema' | 'videoIn';

// User-level capabilities (not model-specific)
export type UserCapabilityKey = CapabilityKey | 'dictation' | 'enableStudio';

export const CAPABILITY_LABELS: Record<CapabilityKey, string> = {
  realtimeVoice: 'Realtime Voice',
  audioIn: 'Audio Input',
  webBrowse: 'Web Browsing',
  fileSearch: 'File Search',
  codeInterpreter: 'Code Interpreter',
  imageGen: 'Image Generation',
  jsonSchema: 'Structured Output',
  videoIn: 'Video Understanding'
};

export const MODEL_CAPABILITIES: Record<string, { name: string; contextWindow: number; capabilities: Record<CapabilityKey, boolean> }> = {
  // ==========================================
  // OpenAI Models - January 2026
  // ==========================================
  'gpt-5.2': { 
      name: 'GPT-5.2 🔥', 
      contextWindow: 256000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true } 
  },
  'gpt-5': { 
      name: 'GPT-5', 
      contextWindow: 200000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true } 
  },
  'gpt-5-mini': { 
      name: 'GPT-5 Mini',
      contextWindow: 128000, 
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true } 
  },
  'gpt-5-nano': { 
      name: 'GPT-5 Nano ⚡', 
      contextWindow: 64000,
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: false, codeInterpreter: false, imageGen: false, jsonSchema: true, videoIn: false } 
  },
  
  // o-series Reasoning Models
  'o3-pro': {
      name: 'o3 Pro 🧠',
      contextWindow: 200000,
      capabilities: { realtimeVoice: false, audioIn: false, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: false, jsonSchema: true, videoIn: false }
  },
  'o3': {
      name: 'o3 (Reasoning)',
      contextWindow: 200000,
      capabilities: { realtimeVoice: false, audioIn: false, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: false, jsonSchema: true, videoIn: false }
  },
  'o4-mini': {
      name: 'o4 Mini',
      contextWindow: 128000,
      capabilities: { realtimeVoice: false, audioIn: false, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: false, jsonSchema: true, videoIn: false }
  },
  
  // ==========================================
  // Google Gemini Models - January 2026
  // ==========================================
  'gemini-3-pro': {
      name: 'Gemini 3 Pro 🧠',
      contextWindow: 2000000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true }
  },
  'gemini-3-flash': {
      name: 'Gemini 3 Flash 🔥',
      contextWindow: 1000000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true }
  },
  'gemini-2.5-pro': {
      name: 'Gemini 2.5 Pro (Deep Think)',
      contextWindow: 2000000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true }
  },
  'gemini-2.5-flash': {
      name: 'Gemini 2.5 Flash',
      contextWindow: 1000000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true }
  },
  'gemini-2.5-flash-lite': {
      name: 'Gemini 2.5 Flash-Lite ⚡',
      contextWindow: 500000,
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: false, codeInterpreter: false, imageGen: false, jsonSchema: true, videoIn: true }
  },
  
  // ==========================================
  // Legacy Models (backwards compatibility)
  // ==========================================
  'gpt-4o': { 
      name: 'GPT-4o (Legacy)', 
      contextWindow: 128000,
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true } 
  },
  'gpt-4o-mini': { 
      name: 'GPT-4o Mini (Legacy)', 
      contextWindow: 128000,
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true } 
  },
  'gemini-1.5-pro': {
      name: 'Gemini 1.5 Pro (Legacy)',
      contextWindow: 2000000,
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true }
  },
  'gemini-1.5-flash': {
      name: 'Gemini 1.5 Flash (Legacy)',
      contextWindow: 1000000,
      capabilities: { realtimeVoice: false, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: false, imageGen: false, jsonSchema: true, videoIn: true }
  },
  'gemini-2.0-flash-exp': {
      name: 'Gemini 2.0 Flash Exp (Legacy)',
      contextWindow: 1000000,
      capabilities: { realtimeVoice: true, audioIn: true, webBrowse: true, fileSearch: true, codeInterpreter: true, imageGen: true, jsonSchema: true, videoIn: true }
  },
  
  // ==========================================
  // Specialized Models
  // ==========================================
  'gpt-image-1.5': {
      name: 'GPT Image 1.5',
      contextWindow: 4000,
      capabilities: { realtimeVoice: false, audioIn: false, webBrowse: false, fileSearch: false, codeInterpreter: false, imageGen: true, jsonSchema: false, videoIn: false }
  },
  'dall-e-3': {
      name: 'DALL-E 3 (Legacy)',
      contextWindow: 4000,
      capabilities: { realtimeVoice: false, audioIn: false, webBrowse: false, fileSearch: false, codeInterpreter: false, imageGen: true, jsonSchema: false, videoIn: false }
  },
  'imagen-3.0-generate-001': {
      name: 'Imagen 3',
      contextWindow: 4000,
      capabilities: { realtimeVoice: false, audioIn: false, webBrowse: false, fileSearch: false, codeInterpreter: false, imageGen: true, jsonSchema: false, videoIn: false }
  }
};

export function findBestModelForCapabilities(caps: CapabilityKey[], currentModelId: string): string {
    const model = MODEL_CAPABILITIES[currentModelId];
    if (model) {
        // If current model supports all requested caps, keep it
        const missing = caps.some(key => !model.capabilities[key]);
        if (!missing) return currentModelId;
    }
    // Fallback logic
    if (caps.includes('imageGen') && !model?.capabilities.imageGen) return 'dall-e-3';
    // Add logic to switch to models that support audio/video if requested
    // But for now, returning currentModelId or default is safe enough to prevent crashes.
    return currentModelId; 
}
