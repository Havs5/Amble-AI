import { Provider } from '@/utils/modelConstants';
import { ApiError } from '@/lib/apiError';

export interface AIModel {
  id: string;
  name: string;
  provider: Provider;
  contextWindow: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  capabilities: {
    image: boolean;
    vision: boolean;
    functionCalling: boolean;
    jsonMode: boolean;
  };
}

export interface GenerateImageOptions {
  prompt: string;
  modelId?: string; // e.g. 'dall-e-3', 'imagen-3.0-generate-001'
  size?: '1024x1024' | 'other';
  quality?: 'standard' | 'hd';
  n?: number;
}

export interface GenerateImageResult {
  urls: string[];
  provider: string;
  model: string;
}

export class ModelGateway {
  
  /**
   * Generates images using the appropriate backend provider based on the model ID.
   * Auto-routes 'banana', 'gemini' keywords to Imagen if no specific model provided.
   */
  static async generateImage(options: GenerateImageOptions): Promise<GenerateImageResult> {
    const { prompt, modelId } = options;
    
    // Client-side heuristic for model selection (can be overridden by UI)
    let selectedModel = modelId || 'dall-e-3';
    
    try {

      const response = await fetch('/api/image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          model: selectedModel,
          resolution: options.size || '1024x1024',
          quality: options.quality || 'standard',
          n: options.n || 1
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown server error' }));
        throw new ApiError(
          errorData.error || `Image generation failed: ${response.statusText}`, 
          response.status, 
          errorData
        );
      }

      const data = await response.json();
      return {
        urls: data.urls || [],
        provider: selectedModel.includes('imagen') ? 'google' : 'openai',
        model: selectedModel
      };

    } catch (error: any) {
      console.error('ModelGateway.generateImage Error:', error);
      
      // Fallback Logic
      if (selectedModel !== 'imagen-3.0-generate-001') {
         console.warn("Attempting fallback to Imagen...");
         return this.generateImage({ ...options, modelId: 'imagen-3.0-generate-001' });
      }

      throw error;
    }
  }

  /**
   * Universal Text Generation (Chat) Facade
   */
  static async generateText(payload: {
    messages: { role: string; content: string }[];
    modelId: string;
    temperature?: number;
    maxTokens?: number;
    tools?: any[];
    useRAG?: boolean;
    projectId?: string;
  }) {
    const performRequest = async (modelOverride?: string) => {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: payload.messages,
                model: modelOverride || payload.modelId,
                temperature: payload.temperature,
                useRAG: payload.useRAG,
                projectId: payload.projectId,
                maxTokens: payload.maxTokens,
                tools: payload.tools,
                stream: false
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'Text generation failed' }));
            throw new ApiError(
                errorData.error || `Text generation failed: ${response.statusText}`, 
                response.status, 
                errorData
            );
        }
        return await response.json();
    };

    try {
        return await performRequest();
    } catch (error) {
        console.error(`ModelGateway: Primary model ${payload.modelId} failed.`, error);
        
        // Fallback Logic
        // If OpenAI fails, try Gemini
        if (payload.modelId.includes('gpt')) {
            const fallbackModel = 'gemini-1.5-pro-latest';
            console.warn(`Attempting fallback to ${fallbackModel}...`);
            try {
                return await performRequest(fallbackModel);
            } catch {
                console.error("Fallback failed too.");
                throw error; // Throw original error
            }
        }
        throw error;
    }
  }
} 

