
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, addDoc } from 'firebase/firestore';

export interface TokenUsage {
  date: string; // YYYY-MM-DD
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface UsageLimits {
  dailyCostLimit: number;
  monthlyCostLimit: number;
  ambleAiLimit: number; // Limit for Amble AI (Chat/Text)
  cxLimit: number; // Limit for Customer Experience
  studioLimit: number; // Limit for Amble Studio (Image/Video)
  [key: string]: any; // Allow for extension
}

export interface ModelUsageBreakdown {
  modelId: string;
  displayName: string;
  category: 'text' | 'image' | 'video' | 'audio';
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cost: number;
  requests: number;
  inputRate: number;  // $ per 1M tokens or per unit
  outputRate: number;  // $ per 1M tokens
  unit?: 'token' | 'image' | 'second' | 'video' | 'minute' | 'character';  // Pricing unit
}

export interface DetailedUsageStats {
  today: { tokens: number; cost: number };
  month: { tokens: number; cost: number };
  range: { tokens: number; cost: number }; // Cost within the selected time range filter
  modelBreakdown: ModelUsageBreakdown[];
  dailyTrend: { date: string; cost: number; tokens: number }[];
  totalRequests: number;
  avgCostPerRequest: number;
}

// Model display names for better UI - January 2026
// Shows "Gemini 3" / "GPT-5" / "o3" to users
const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Display Names (what users see)
  'gpt-5': 'GPT-5',
  'gpt-5-mini': 'GPT-5 Mini',
  'o3': 'o3 (Reasoning)',
  'o3-mini': 'o3 Mini',
  'gemini-3-flash': 'Gemini 3 Flash',
  'gemini-3-pro': 'Gemini 3 Pro',
  'gemini-3-thinking': 'Gemini 3 Thinking',
  // Actual API models (for internal tracking)
  'gpt-4o': 'GPT-5',
  'gpt-4o-mini': 'GPT-5 Mini',
  'o1': 'o3 (Reasoning)',
  'o1-mini': 'o3 Mini',
  'o1-preview': 'o3 Preview',
  'gemini-2.0-flash-exp': 'Gemini 3 Flash',
  'gemini-2.0-pro-exp': 'Gemini 3 Pro',
  'gemini-2.0-flash-thinking-exp': 'Gemini 3 Thinking',
  // Gemini 3 Preview API models
  'gemini-3-flash-preview': 'Gemini 3 Flash',
  'gemini-3-pro-preview': 'Gemini 3 Pro',
  'gemini-1.5-flash': 'Gemini 1.5 Flash',
  'gemini-1.5-pro': 'Gemini 1.5 Pro',
  // Image/Video
  'dall-e-3': 'DALL-E 4',
  'imagen-3.0-generate-001': 'Imagen 3',
  'veo-2.0-generate-001': 'Veo 3',
  // Audio
  'whisper-1': 'Whisper (STT)',
  'tts-1': 'TTS Standard',
  'tts-1-hd': 'TTS HD',
};

const MODEL_PRICING: Record<string, { input: number, output: number, unit?: 'token' | 'image' | 'second' | 'video' | 'minute' | 'character' }> = {
  // GPT-5 / o3 Display Models (prices per 1M tokens)
  'gpt-5': { input: 2.50, output: 10.00 },
  'gpt-5-mini': { input: 0.15, output: 0.60 },
  'o3': { input: 15.00, output: 60.00 },
  'o3-mini': { input: 3.00, output: 12.00 },
  
  // Gemini 3 Display Models (prices per 1M tokens)
  'gemini-3-flash': { input: 0.10, output: 0.40 },
  'gemini-3-pro': { input: 2.50, output: 10.00 },
  'gemini-3-thinking': { input: 0.10, output: 0.40 },
  
  // Actual API models (same pricing, for tracking)
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o1': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  'gemini-2.0-flash-exp': { input: 0.10, output: 0.40 },
  'gemini-2.0-pro-exp': { input: 2.50, output: 10.00 },
  'gemini-2.0-flash-thinking-exp': { input: 0.10, output: 0.40 },
  
  // Gemini 3 Preview API models (January 2026)
  'gemini-3-flash-preview': { input: 0.10, output: 0.40 },
  'gemini-3-pro-preview': { input: 2.50, output: 10.00 },
  'gemini-1.5-flash': { input: 0.10, output: 0.40 },
  'gemini-1.5-pro': { input: 2.50, output: 10.00 },
  
  // Image/Video Models
  'dall-e-3': { input: 0.040, output: 0, unit: 'image' },
  'imagen-3.0-generate-001': { input: 0.04, output: 0, unit: 'image' },
  'veo-2.0-generate-001': { input: 0.20, output: 0, unit: 'second' },
  
  // Audio Models
  'whisper-1': { input: 0.006, output: 0, unit: 'minute' },
  'tts-1': { input: 15.00, output: 0, unit: 'character' },
  'tts-1-hd': { input: 30.00, output: 0, unit: 'character' },
};

// Get model category based on model ID
function getModelCategory(modelId: string): 'text' | 'image' | 'video' | 'audio' {
  if (modelId.includes('dall-e') || modelId.includes('imagen')) return 'image';
  if (modelId.includes('veo') || modelId.includes('sora')) return 'video';
  if (modelId.includes('whisper') || modelId.includes('tts')) return 'audio';
  return 'text';
}

export class UsageManager {
  private static STORAGE_KEY_PREFIX = 'amble_usage_history_';
  private static LIMITS_KEY_PREFIX = 'amble_usage_limits_';

  // Export pricing for external use
  static getModelPricing() {
    return MODEL_PRICING;
  }

  static getModelDisplayName(modelId: string): string {
    return MODEL_DISPLAY_NAMES[modelId] || modelId;
  }

  private static getKey(prefix: string, userId: string = 'default') {
    return `${prefix}${userId}`;
  }

  static getHistory(userId?: string): TokenUsage[] {
    if (typeof window === 'undefined') return [];
    const key = this.getKey(this.STORAGE_KEY_PREFIX, userId);
    const data = localStorage.getItem(key);
    
    // Fallback to old key if no user-specific data and userId is not provided (migration-ish)
    if (!data && !userId) {
       const oldData = localStorage.getItem('amble_usage_history');
       return oldData ? JSON.parse(oldData) : [];
    }

    return data ? JSON.parse(data) : [];
  }

  static setHistory(history: TokenUsage[], userId?: string) {
    const key = this.getKey(this.STORAGE_KEY_PREFIX, userId);
    localStorage.setItem(key, JSON.stringify(history));
  }

  static getLimits(userId?: string): UsageLimits {
    const defaultLimits: UsageLimits = { 
        dailyCostLimit: 20.0, 
        monthlyCostLimit: 200.0,
        ambleAiLimit: 10.0,
        cxLimit: 10.0,
        studioLimit: 10.0
    };

    if (typeof window === 'undefined') return defaultLimits;
    const key = this.getKey(this.LIMITS_KEY_PREFIX, userId);
    const data = localStorage.getItem(key);
    
    if (!data && !userId) {
        const oldData = localStorage.getItem('amble_usage_limits');
        return oldData ? JSON.parse(oldData) : defaultLimits;
    }

    return data ? { ...defaultLimits, ...JSON.parse(data) } : defaultLimits;
  }

  static async loadLimits(userId: string): Promise<UsageLimits> {
    const defaultLimits: UsageLimits = { 
        dailyCostLimit: 20.0, 
        monthlyCostLimit: 200.0,
        ambleAiLimit: 10.0,
        cxLimit: 10.0,
        studioLimit: 10.0
    };

    try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
            const data = userSnap.data();
            if (data.usageLimits) {
                const limits = { ...defaultLimits, ...data.usageLimits };
                // Update Local Cache
                this.setLimits(limits, userId);
                return limits;
            }
        }
    } catch (e) {
        console.error("Failed to load limits from Firestore:", e);
    }
    
    // Fallback to local storage if Firestore fails or no data
    return this.getLimits(userId);
  }

  static async saveLimits(limits: UsageLimits, userId: string) {
    try {
        const userRef = doc(db, 'users', userId);
        // We use setDoc with merge to ensure we don't overwrite other fields, 
        // or create the doc if it missing (though it should exist for a valid user)
        await setDoc(userRef, { usageLimits: limits }, { merge: true });
        
        // Update Local Cache
        this.setLimits(limits, userId);
    } catch (e) {
        console.error("Failed to save limits to Firestore:", e);
        throw e;
    }
  }

  static setLimits(limits: UsageLimits, userId?: string) {
    const key = this.getKey(this.LIMITS_KEY_PREFIX, userId);
    localStorage.setItem(key, JSON.stringify(limits));
  }

  static calculateCost(modelId: string, inputTokens: number, outputTokens: number, isImage = false, isVideo = false, durationSeconds = 0): number {
    const pricing = MODEL_PRICING[modelId] || { input: 0, output: 0 };
    
    if (isImage || pricing.unit === 'image') {
      return pricing.input > 0 ? pricing.input : 0.04;
    } else if (isVideo || pricing.unit === 'video' || pricing.unit === 'second') {
      if (pricing.unit === 'second') {
         // Default to 5 seconds if duration is 0 or not provided, to avoid 0 cost
         const duration = durationSeconds > 0 ? durationSeconds : 5;
         return pricing.input * duration;
      }
      // Per video/generation pricing
      return pricing.input > 0 ? pricing.input : 0.10;
    } else if (pricing.unit === 'minute') {
      // Default to 1 second minimum if duration is 0
      const duration = durationSeconds > 0 ? durationSeconds : 1;
      return pricing.input * (duration / 60);
    } else {
      return (inputTokens / 1000000) * pricing.input + (outputTokens / 1000000) * pricing.output;
    }
  }

  static async trackUsage(modelId: string, inputTokens: number, outputTokens: number, isImage = false, isVideo = false, userId?: string, durationSeconds = 0) {
    // Ensure tokens are valid numbers
    const safeInputTokens = inputTokens ?? 0;
    const safeOutputTokens = outputTokens ?? 0;
    
    const history = this.getHistory(userId);
    const today = new Date().toISOString().split('T')[0];
    
    const cost = this.calculateCost(modelId, safeInputTokens, safeOutputTokens, isImage, isVideo, durationSeconds);

    // For audio models, store duration in inputTokens field for stats
    const isAudio = modelId.includes('whisper') || modelId.includes('tts');
    const tokensOrDuration = isAudio ? durationSeconds : safeInputTokens;

    const entry: TokenUsage = {
      date: today,
      modelId,
      inputTokens: tokensOrDuration,
      outputTokens: isAudio ? 0 : safeOutputTokens,
      cost
    };

    history.push(entry);
    const key = this.getKey(this.STORAGE_KEY_PREFIX, userId);
    localStorage.setItem(key, JSON.stringify(history));

    // Sync to Firestore for Admin Reporting
    if (userId) {
        try {
            const logData: Record<string, unknown> = {
                userId,
                modelId,
                inputTokens: tokensOrDuration,
                outputTokens: isAudio ? 0 : safeOutputTokens,
                cost,
                timestamp: Date.now(),
                date: today
            };
            // Only add durationSeconds if it's audio (Firestore doesn't allow undefined values)
            if (isAudio && durationSeconds) {
                logData.durationSeconds = durationSeconds;
            }
            await addDoc(collection(db, 'usage_logs'), logData);
        } catch (e) {
            console.error("Failed to sync usage to Firestore:", e);
        }
    }
  }

  static checkLimits(userId: string | undefined, category: 'studio' | 'ambleAi' | 'cx') {
    const limits = this.getLimits(userId);
    const history = this.getHistory(userId);
    // const today = new Date().toISOString().split('T')[0];

    // Filter usage by category
    const categoryUsage = history.filter(entry => {
        // Simple heuristic for category mapping based on model ID or other flags if available
        // Ideally, TokenUsage should have a category field.
        // For now, let's assume all cost counts towards global limits or infer from model.
        
        const isImageOrVideo = entry.modelId === 'dall-e-3' || entry.modelId.includes('imagen') || entry.modelId.includes('sora') || entry.modelId.includes('veo');
        const isStudio = isImageOrVideo; 
        
        // This is imperfect without storing category in usage history. 
        // For strict enforcement, we should store category in history.
        // Assuming:
        // Studio = Image/Video models
        // AmbleAi = Text models (default)
        // CX = Special context? (Not easily distinguishable by model alone usually)

        // Let's refine based on the requested category check
        if (category === 'studio') return isStudio;
        if (category === 'ambleAi') return !isStudio; 
        // CX is tricky without more data. Let's assume it shares AmbleAi budget or is distinct
        if (category === 'cx') return false; // Placeholder
        return false;
    });

    const categoryCost = categoryUsage.reduce((sum, entry) => sum + entry.cost, 0);
    
    // Check Limits
    if (category === 'studio' && limits.studioLimit && categoryCost >= limits.studioLimit) {
        throw new Error(`Studio limit ($${limits.studioLimit}) exceeded.`);
    }
    if (category === 'ambleAi' && limits.ambleAiLimit && categoryCost >= limits.ambleAiLimit) {
         throw new Error(`Amble AI limit ($${limits.ambleAiLimit}) exceeded.`);
    }
    if (category === 'cx' && limits.cxLimit && categoryCost >= limits.cxLimit) {
         throw new Error(`CX limit ($${limits.cxLimit}) exceeded.`);
    }

    if (limits.monthlyCostLimit) {
         const totalCost = history.reduce((sum, e) => sum + e.cost, 0);
         if (totalCost >= limits.monthlyCostLimit) {
             throw new Error(`Monthly cost limit ($${limits.monthlyCostLimit}) exceeded.`);
         }
    }
  }

  static getStats(userId?: string) {
    const history = this.getHistory(userId);
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7);

    const daily = history.filter(h => h.date === todayStr);
    const monthly = history.filter(h => h.date.startsWith(currentMonth));

    const sum = (items: TokenUsage[]) => ({
      cost: items.reduce((acc, curr) => acc + curr.cost, 0),
      tokens: items.reduce((acc, curr) => acc + curr.inputTokens + curr.outputTokens, 0)
    });

    return {
      today: sum(daily),
      month: sum(monthly),
      history
    };
  }

  static async loadDetailedStats(userId: string, timeRange: { start?: number, end?: number } = {}): Promise<DetailedUsageStats> {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonth = todayStr.substring(0, 7);
    
    // Default to last 30 days if no range provided
    const rangeStart = timeRange.start || (Date.now() - 30 * 24 * 60 * 60 * 1000);
    const rangeEnd = timeRange.end || Date.now();

    // Initialize result structures
    const modelMap = new Map<string, ModelUsageBreakdown>();
    const dailyMap = new Map<string, { cost: number; tokens: number }>();
    let todayCost = 0;
    let todayTokens = 0;
    let monthCost = 0;
    let monthTokens = 0;
    let totalRequests = 0;
    let rangeCost = 0; // Cost within the filtered range
    let rangeTokens = 0; // Tokens within the filtered range
    
    try {
      const { query, where, getDocs, orderBy } = await import('firebase/firestore');
      const usageRef = collection(db, 'usage_logs');
      // For efficiency we should use compound queries, but requires index.
      // We'll fetch by user and filter in memory for now to be safe, 
      // or we can try adding timestamp filter if index exists.
      // UsageReport uses: query(usageRef, orderBy('timestamp', 'desc')) then filters.
      // Here we filter by userId first.
      const q = query(usageRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        const modelId = data.modelId || 'unknown';
        const inputTokens = data.inputTokens || 0;
        const outputTokens = data.outputTokens || 0;
        const isImage = data.isImage || false;
        const isVideo = data.isVideo || false;
        const timestamp = data.timestamp || 0;
        // Derive date from timestamp if date field is missing
        const date = data.date || (timestamp ? new Date(timestamp).toISOString().split('T')[0] : '');
        
        // Recalculate cost from tokens to ensure accuracy
        const cost = Number(data.cost) || this.calculateCost(modelId, inputTokens, outputTokens, isImage, isVideo);

        // KPI Calculations (Today/Month) - Always based on current date
        if (date === todayStr) {
          todayCost += cost;
          todayTokens += inputTokens + outputTokens;
        }
        if (date?.startsWith(currentMonth)) {
          monthCost += cost;
          monthTokens += inputTokens + outputTokens;
        }

        // Filtering for Breakdown & Charts
        // Check if log is within requested range
        if (timestamp < rangeStart || timestamp > rangeEnd) return;

        totalRequests++;
        rangeCost += cost;
        rangeTokens += inputTokens + outputTokens;
        
        // Aggregate by model
        if (!modelMap.has(modelId)) {
          const pricing = MODEL_PRICING[modelId] || { input: 0, output: 0 };
          modelMap.set(modelId, {
            modelId,
            displayName: this.getModelDisplayName(modelId),
            category: getModelCategory(modelId),
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            cost: 0,
            requests: 0,
            inputRate: pricing.input,
            outputRate: pricing.output,
            unit: pricing.unit || 'token'
          });
        }
        
        const modelStats = modelMap.get(modelId)!;
        modelStats.inputTokens += inputTokens;
        modelStats.outputTokens += outputTokens;
        modelStats.totalTokens += inputTokens + outputTokens;
        modelStats.cost += cost;
        modelStats.requests++;
        
        // Aggregate by day (for trend)
        // We use the date string for grouping
        if (date) {
          if (!dailyMap.has(date)) {
            dailyMap.set(date, { cost: 0, tokens: 0 });
          }
          const dayStats = dailyMap.get(date)!;
          dayStats.cost += cost;
          dayStats.tokens += inputTokens + outputTokens;
        }
      });
      
      // Convert maps to arrays and sort
      const modelBreakdown = Array.from(modelMap.values())
        .sort((a, b) => b.cost - a.cost); // Sort by cost descending
      
      // Generate complete date range for the trend (fill in missing days with 0)
      const dailyTrend: { date: string; cost: number; tokens: number }[] = [];
      const msPerDay = 24 * 60 * 60 * 1000;
      
      // Limit to last 14 days for readability
      const trendStart = Math.max(rangeStart, rangeEnd - 14 * msPerDay);
      
      for (let ts = trendStart; ts <= rangeEnd; ts += msPerDay) {
        const dateStr = new Date(ts).toISOString().split('T')[0];
        const existing = dailyMap.get(dateStr);
        dailyTrend.push({
          date: dateStr,
          cost: existing?.cost || 0,
          tokens: existing?.tokens || 0
        });
      }
      
      return {
        today: { tokens: todayTokens, cost: todayCost },
        month: { tokens: monthTokens, cost: monthCost },
        range: { tokens: rangeTokens, cost: rangeCost },
        modelBreakdown,
        dailyTrend,
        totalRequests,
        avgCostPerRequest: totalRequests > 0 ? rangeCost / totalRequests : 0
      };
    } catch (e) {
      console.error("Failed to load detailed stats from Firestore:", e);
      // Fallback with basic stats
      const localStats = this.getStats(userId);
      return {
        today: localStats.today,
        month: localStats.month,
        range: { tokens: 0, cost: 0 },
        modelBreakdown: [],
        dailyTrend: [],
        totalRequests: 0,
        avgCostPerRequest: 0
      };
    }
  }

  // Legacy function for backwards compatibility
  static async loadStats(userId: string): Promise<{ today: { tokens: number; cost: number }; month: { tokens: number; cost: number } }> {
    const detailed = await this.loadDetailedStats(userId);
    return {
      today: detailed.today,
      month: detailed.month
    };
  }
}
