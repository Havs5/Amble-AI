export const MODEL_CATEGORIES = [
  {
    label: 'Smart Auto-Routing (Recommended)',
    models: [
      { id: 'auto', name: '✨ Amble Auto (Smart)' },
    ]
  },
  {
    label: 'Fast & Cost-Efficient',
    models: [
      { id: 'gpt-5-nano', name: 'GPT-5 Nano ⚡' },
      { id: 'gpt-5-mini', name: 'GPT-5 Mini' },
      { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite ⚡' },
      { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    ]
  },
  {
    label: 'High Intelligence (Frontier)',
    models: [
      { id: 'gpt-5.2', name: 'GPT-5.2 🔥 NEW' },
      { id: 'gpt-5', name: 'GPT-5' },
      { id: 'gemini-3-flash', name: 'Gemini 3 Flash 🔥 NEW' },
      { id: 'gemini-3-pro', name: 'Gemini 3 Pro 🧠' },
    ]
  },
  {
    label: 'Reasoning & Deep Thinking',
    models: [
      { id: 'o4-mini', name: 'o4 Mini (Fast Reasoning)' },
      { id: 'o3', name: 'o3 (Reasoning)' },
      { id: 'o3-pro', name: 'o3 Pro 🧠' },
      { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (Deep Think)' },
    ]
  }
];

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
  google: {
    auto: 'auto',
    instant: 'gemini-2.5-flash',
    thinking: 'gemini-2.5-pro', // Uses thinking budget
    'agent-planner': 'gemini-3-pro-preview',
    'agent-researcher': 'gemini-3-pro-preview',
    'agent-coder': 'gemini-3-pro-preview'
  },
};

export function getProviderForModel(modelId: string): Provider {
  if (modelId.startsWith('gpt') || modelId.startsWith('o1')) return 'openai';
  if (modelId.startsWith('gemini') || modelId.startsWith('imagen')) return 'google';
  return 'openai'; // Default
}
