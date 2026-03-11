import { aiUsageLogs } from "@examforge/shared/db/schema";
import type { AiProvider } from "@examforge/shared";
import type { Database } from "@examforge/shared/db";

export type LogAICallParams = {
  provider: AiProvider;
  model: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  userId: string;
  examId?: string;
};

export async function logAICall(db: Database, params: LogAICallParams): Promise<string> {
  const [row] = await db
    .insert(aiUsageLogs)
    .values({
      provider: params.provider,
      model: params.model,
      feature: params.feature,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      latencyMs: params.latencyMs,
      estimatedCostUsd: params.estimatedCostUsd,
      userId: params.userId,
      examId: params.examId,
    })
    .returning({ id: aiUsageLogs.id });

  return row!.id;
}
