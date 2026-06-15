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

export class ModelGateway {

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

        // Fallback Logic: if OpenAI fails, try a Gemini model
        if (payload.modelId.includes('gpt')) {
            const fallbackModel = 'gemini-2.5-pro';
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
