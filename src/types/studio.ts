export enum FeatureMode {
  CHAT = 'CHAT',
  LIVE = 'LIVE',
  MEDIA = 'MEDIA',
  ANALYZE = 'ANALYZE'
}

export enum ChatModelType {
  STANDARD = 'gemini-1.5-pro',
  FAST = 'gemini-1.5-flash',
  THINKING = 'gemini-1.5-pro', // Internal ID to map to config
  SEARCH = 'gemini-1.5-flash',
  MAPS = 'gemini-1.5-flash'
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  thinkingProcess?: string;
  groundingMetadata?: any;
  images?: string[];
  timestamp: number;
}

export interface VeoConfig {
  prompt: string;
  image?: string; // base64
  aspectRatio: '16:9' | '9:16';
  model: 'veo-3.1-fast-generate-preview';
}

export interface ImagenConfig {
  prompt: string;
  size?: '1K' | '2K' | '4K';
  aspectRatio?: string;
  base64Image?: string; // For editing
}

// Window interface extension for AI Studio key selection
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    aistudio: AIStudio;
    webkitAudioContext: typeof AudioContext;
  }
}
