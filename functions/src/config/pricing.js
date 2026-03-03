const MODEL_PRICING = {
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-5': { input: 5.00, output: 15.00 },
  'gpt-5.2': { input: 6.00, output: 18.00 },
  'gpt-5-mini': { input: 0.15, output: 0.60 },
  'gpt-5-nano': { input: 0.05, output: 0.20 },
  'gemini-1.5-pro': { input: 3.50, output: 10.50 },
  'gemini-1.5-flash': { input: 0.35, output: 1.05 },
  'gemini-3-flash': { input: 0.35, output: 1.05 },
  'gemini-3-pro': { input: 5.00, output: 15.00 },
};

function calculateCost(model, inputTokens, outputTokens) {
  const price = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o']; // Default to gpt-4o pricing if unknown
  return (inputTokens / 1_000_000 * price.input) + (outputTokens / 1_000_000 * price.output);
}

module.exports = { MODEL_PRICING, calculateCost };
