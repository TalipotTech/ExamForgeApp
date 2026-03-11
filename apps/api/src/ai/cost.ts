import { AI_COST_PER_1K_TOKENS } from "@examforge/shared/constants";

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = AI_COST_PER_1K_TOKENS[model as keyof typeof AI_COST_PER_1K_TOKENS];
  if (!costs) {
    console.warn(`No cost data for model: ${model}`);
    return 0;
  }
  return (inputTokens / 1000) * costs.input + (outputTokens / 1000) * costs.output;
}
