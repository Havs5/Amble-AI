import { useState, useEffect } from 'react';
import { MODEL_MAPPING, Provider, ReasoningMode } from '@/utils/modelConstants';

export function useModelSelection() {
  const [selectedProvider, setSelectedProvider] = useState<Provider>('google');
  const [selectedReasoningMode, setSelectedReasoningMode] = useState<ReasoningMode>('instant');
  const [selectedModel, setSelectedModel] = useState('gemini-3-flash-preview');

  // Sync selectedModel when provider or mode changes
  useEffect(() => {
    // Map reasoning modes to model IDs that match ModelSelector
    const MODE_TO_MODEL: Record<Provider, Record<string, string>> = {
      openai: {
        auto: 'gpt-4o-mini',
        instant: 'gpt-4o-mini',
        thinking: 'gpt-4o',
        'agent-planner': 'gpt-4o',
        'agent-researcher': 'gpt-4o',
        'agent-coder': 'o1'
      },
      google: {
        auto: 'gemini-3-flash-preview',
        instant: 'gemini-3-flash-preview',
        thinking: 'gemini-3-pro-preview',
        'agent-planner': 'gemini-3-pro-preview',
        'agent-researcher': 'gemini-3-pro-preview',
        'agent-coder': 'gemini-3-pro-preview'
      }
    };
    const newModel = MODE_TO_MODEL[selectedProvider][selectedReasoningMode];
    if (newModel && newModel !== selectedModel) {
        setSelectedModel(newModel);
    }
  }, [selectedProvider, selectedReasoningMode]);

  return {
    selectedProvider,
    setSelectedProvider,
    selectedReasoningMode,
    setSelectedReasoningMode,
    selectedModel,
    setSelectedModel
  };
}
