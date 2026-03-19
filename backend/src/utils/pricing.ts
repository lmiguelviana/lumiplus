/**
 * Utilitário de precificação para estimativa de custos USD.
 * Valores baseados em preços médios do OpenRouter (Março 2026).
 * Preços por 1 MILHÃO de tokens (Input + Output equilibrado).
 */
export const MODEL_PRICING: Record<string, number> = {
  // OpenAI
  'openai/gpt-4o': 5.00,
  'openai/gpt-4o-mini': 0.15,
  'openai/gpt-3.5-turbo': 0.50,
  
  // Anthropic
  'anthropic/claude-3.5-sonnet': 3.00,
  'anthropic/claude-3-haiku': 0.25,
  'anthropic/claude-3-opus': 15.00,
  
  // Google
  'google/gemini-pro-1.5': 1.25,
  'google/gemini-flash-1.5': 0.10,
  'google/gemini-2.0-flash-exp': 0.05, // Promoção/Beta
  
  // Meta/Llama (via OpenRouter)
  'meta-llama/llama-3.1-405b': 3.00,
  'meta-llama/llama-3.1-70b': 0.60,
  
  // Default/Fallback
  'default': 1.00
};

/**
 * Calcula o custo estimado em USD baseado no modelo e tokens usados.
 */
export function calculateCost(model: string, tokens: number): number {
  const pricePerMillion = MODEL_PRICING[model] || MODEL_PRICING['default'];
  return (tokens / 1000000) * pricePerMillion;
}
