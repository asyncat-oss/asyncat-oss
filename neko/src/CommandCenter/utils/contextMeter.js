// The composer's context meter: how much of the model's context window this
// chat fills. One muted meter that turns amber only when it is nearly full.

export const NEARLY_FULL_PERCENT = 80;

const thousands = (tokens) => `${(tokens / 1000).toFixed(1)}k`;

/**
 * { label, percent, nearlyFull, title } for a run's token usage: the label is
 * the context in use ("~" when estimated), the title says the rest.
 */
export function contextMeter(usage = {}) {
  const contextWindow = usage.contextWindow || 128000;
  const contextTokens = usage.currentContextTokens || usage.lastInputTokens || usage.inputTokens || 0;
  const totalTokens = usage.cumulativeTotalTokens || usage.totalTokens || usage.lastTotalTokens || 0;
  const percent = Math.min((contextTokens / contextWindow) * 100, 100);
  const nearlyFull = percent >= NEARLY_FULL_PERCENT;
  const label = `${usage.estimated ? '~' : ''}${thousands(contextTokens)}`;
  const title = `${usage.estimated ? 'Estimated: ' : ''}${thousands(contextTokens)} current context · ${thousands(totalTokens)} total used · ${percent.toFixed(0)}% of ${(contextWindow / 1000).toFixed(0)}k context (${usage.contextWindowSource || 'unknown'})${
    nearlyFull ? '. Nearly full, so older messages may be summarised soon.' : ''
  }`;
  return { label, percent, nearlyFull, title };
}
