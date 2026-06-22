// Gemini (Vertex, primary) + GPT (OpenAI). In PHI strict mode
// (NEXT_PUBLIC_PHI_SAFE_MODE='true') the OpenAI rows are dropped so the picker
// matches the server routing (which never uses OpenAI in strict mode). See SOT §10.
const PHI_STRICT = process.env.NEXT_PUBLIC_PHI_SAFE_MODE === 'true';
const MODEL_CATEGORIES_RAW = [
  {
    label: 'Smart Auto-Routing (Recommended)',
    models: [
      { id: 'auto', name: '✨ Amble Auto (Smart)', provider: 'google' as const },
    ]
  },
  {
    label: 'Fast & Cost-Efficient',
    models: [
      { id: 'gpt-5-nano', name: 'GPT-5 Nano ⚡', provider: 'openai' as const },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini', provider: 'openai' as const },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash ⚡ NEW', provider: 'google' as const },
    ]
  },
  {
    label: 'High Intelligence (Frontier)',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2 🔥 NEW', provider: 'openai' as const },
      { id: 'gpt-5', name: 'GPT-5', provider: 'openai' as const },
      { id: 'gemini-3-pro', name: 'Gemini 3.1 Pro 🧠 NEW', provider: 'google' as const },
    ]
  },
  {
    label: 'Reasoning & Deep Thinking',
    models: [
      { id: 'o4-mini', name: 'o4 Mini (Fast Reasoning)', provider: 'openai' as const },
      { id: 'o3', name: 'o3 (Reasoning)', provider: 'openai' as const },
      { id: 'gemini-3-pro', name: 'Gemini 3.1 Pro (Deep Think)', provider: 'google' as const },
    ]
  }
];
export const MODEL_CATEGORIES = PHI_STRICT
  ? MODEL_CATEGORIES_RAW.map(c => ({ ...c, models: c.models.filter(m => m.provider !== 'openai') })).filter(c => c.models.length > 0)
  : MODEL_CATEGORIES_RAW;

// Flattened list for backward compatibility if needed
export const ALL_MODELS = MODEL_CATEGORIES.flatMap(c => c.models);

export type Provider = 'openai' | 'google';
export type ReasoningMode = 'auto' | 'instant' | 'thinking' | 'agent-planner' | 'agent-researcher' | 'agent-coder';

// LATEST MODELS - January 2026
// Display names map to actual available API models
export const MODEL_MAPPING: Record<Provider, Record<string, string>> = {
  openai: {
    auto: 'auto',
    instant: 'gpt-5-nano',
    thinking: 'o4-mini',
    'agent-planner': 'gpt-5.2',
    'agent-researcher': 'gpt-5.2',
    'agent-coder': 'o3'
  },
  // Vertex AI (global endpoint) latest Gemini: 3 Flash (fast) + 3.1 Pro.
  google: {
    auto: 'auto',
    instant: 'gemini-3-flash-preview',
    thinking: 'gemini-3.1-pro-preview',
    'agent-planner': 'gemini-3.1-pro-preview',
    'agent-researcher': 'gemini-3.1-pro-preview',
    'agent-coder': 'gemini-3.1-pro-preview'
  },
};

export function getProviderForModel(modelId: string): Provider {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1')) return 'openai';
  if (modelId.startsWith('gemini') || modelId.startsWith('imagen')) return 'google';
  return 'openai'; // Default
}
