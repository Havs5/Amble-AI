import { useState, useEffect } from 'react';
import { useAuth } from '@/components/auth/AuthContextRefactored';
import { AMBLE_SYSTEM_PROMPT } from '@/lib/systemPrompt';
import { QA_RULES } from '@/lib/qaCheck';
import { UserCapabilityKey } from '@/lib/capabilities';

export function useAmbleConfig() {
  const { user, updateUserConfig } = useAuth();

  // Premium Capabilities State
  const [showCapabilitiesDock, setShowCapabilitiesDock] = useState(false);
  const [activeCapabilities, setActiveCapabilities] = useState<Record<UserCapabilityKey, boolean>>({
    realtimeVoice: false,
    webBrowse: false,
    fileSearch: false,
    codeInterpreter: false,
    imageGen: false,
    jsonSchema: false,
    audioIn: false,
    videoIn: false,
    dictation: true, // Enabled by default
    enableStudio: false
  });

  // AI Configuration State
  const [billingSystemPrompt, setBillingSystemPrompt] = useState(AMBLE_SYSTEM_PROMPT);
  const [billingPolicies, setBillingPolicies] = useState<string[]>(QA_RULES.map(r => r.description));
  const [billingConfig, setBillingConfig] = useState({ temperature: 0.7, maxTokens: 8192 });
  
  const [ambleSystemPrompt, setAmbleSystemPrompt] = useState('You are Amble AI, a helpful general assistant.');
  const [amblePolicies, setAmblePolicies] = useState<string[]>([]);
  const [ambleConfig, setAmbleConfig] = useState({ temperature: 0.7, maxTokens: 8192 });

  // Sync with User Profile
  useEffect(() => {
    if (user) {
      // Sync Capabilities
      const newCaps = {
        ...activeCapabilities,
        webBrowse: user.capabilities?.webBrowse ?? false,
        imageGen: user.capabilities?.imageGen ?? false,
        codeInterpreter: user.capabilities?.codeInterpreter ?? false,
        realtimeVoice: user.capabilities?.realtimeVoice ?? false,
        videoIn: user.capabilities?.videoIn ?? false,
        dictation: user.capabilities?.aiDictation ?? true, // Default enabled
        enableStudio: user.permissions?.accessStudio ?? false,
      };
      setActiveCapabilities(prev => ({
        ...prev,
        ...newCaps
      }));

      // Sync to localStorage for ChatContext to read
      try {
        localStorage.setItem(`amble_capabilities_${user.id}`, JSON.stringify(newCaps));
      } catch (e) {
        console.error("Failed to sync capabilities to localStorage:", e);
      }

      // Sync Config
      if (user.cxConfig) {
        setBillingSystemPrompt(user.cxConfig.systemPrompt);
        setBillingPolicies(user.cxConfig.policies);
        setBillingConfig({ temperature: user.cxConfig.temperature, maxTokens: user.cxConfig.maxTokens });
      }
      if (user.ambleConfig) {
        setAmbleSystemPrompt(user.ambleConfig.systemPrompt);
        setAmblePolicies(user.ambleConfig.policies);
        setAmbleConfig({ temperature: user.ambleConfig.temperature, maxTokens: user.ambleConfig.maxTokens });
      }
    }
  }, [user]);

  // Handle Updates
  const updateAmbleConfig = async (prompt: string, policies: string[], config: { temperature: number; maxTokens: number }) => {
    setAmbleSystemPrompt(prompt);
    setAmblePolicies(policies);
    setAmbleConfig(config);
    if (user?.id) {
       await updateUserConfig(user.id, 'amble', {
           systemPrompt: prompt,
           policies: policies,
           temperature: config.temperature,
           maxTokens: config.maxTokens
       });
    }
  };

  const updateCxConfig = async (prompt: string, policies: string[], config: { temperature: number; maxTokens: number }) => {
    setBillingSystemPrompt(prompt);
    setBillingPolicies(policies);
    setBillingConfig(config);
    if (user?.id) {
       await updateUserConfig(user.id, 'cx', {
           systemPrompt: prompt,
           policies: policies,
           temperature: config.temperature,
           maxTokens: config.maxTokens
       });
    }
  };

  return {
    showCapabilitiesDock,
    setShowCapabilitiesDock,
    activeCapabilities,
    setActiveCapabilities,
    
    // Amble Config
    ambleSystemPrompt,
    setAmbleSystemPrompt,
    amblePolicies,
    setAmblePolicies,
    ambleConfig,
    setAmbleConfig,
    updateAmbleConfig,

    // Billing/CX Config
    billingSystemPrompt,
    setBillingSystemPrompt,
    billingPolicies,
    setBillingPolicies,
    billingConfig,
    setBillingConfig,
    updateCxConfig
  };
}
