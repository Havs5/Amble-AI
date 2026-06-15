const { calculateCost } = require('../config/pricing');

async function logUsageToFirestore(adminDb, userId, model, usage) {
  if (!userId) {
    console.warn('[Usage] Skipping log: Missing userId');
    return;
  }
  if (!usage) {
     console.warn('[Usage] Skipping log: Missing usage object');
     return;
  }

  try {
    // Accept BOTH usage shapes: OpenAI (prompt_tokens/completion_tokens) and
    // Gemini/Vertex (input_tokens/output_tokens). Previously only the OpenAI
    // names were read, so every Gemini call logged 0 tokens → $0 cost.
    const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
    const cost = calculateCost(model, inputTokens, outputTokens);
    
    await adminDb.collection('usage_logs').add({
      userId: String(userId),
      modelId: String(model),
      inputTokens: Number(inputTokens),
      outputTokens: Number(outputTokens),
      totalTokens: usage.total_tokens || (inputTokens + outputTokens),
      cost: Number(cost),
      timestamp: Date.now(),
      date: new Date().toISOString().split('T')[0]
    });
    console.log(`[Usage] Logged for ${userId}: $${cost.toFixed(6)} (${inputTokens}/${outputTokens})`);
  } catch (e) {
    console.error('[Usage] Failed to log usage:', e);
  }
}

module.exports = { logUsageToFirestore };
