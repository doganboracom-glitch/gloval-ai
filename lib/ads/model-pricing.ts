/**
 * Estimated list price per one million tokens, in USD, used only to fill
 * `ads_usage_events.est_cost_micro_usd`. These are internal estimates for cost
 * monitoring (not shown to users and not billed); update them when the gateway
 * prices change. A model that is not listed gets a null estimate.
 */
export const MODEL_PRICE_USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number }> = {
  'anthropic/claude-opus-5.5': { input: 15, output: 75 },
  'anthropic/claude-sonnet-5.5': { input: 3, output: 15 },
}

/** Cost in micro-USD (one USD per million tokens is exactly one micro-USD per token). */
export function estimateCostMicroUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number },
): number | null {
  const price = MODEL_PRICE_USD_PER_MILLION_TOKENS[model]
  if (!price) return null
  return Math.round(usage.inputTokens * price.input + usage.outputTokens * price.output)
}
