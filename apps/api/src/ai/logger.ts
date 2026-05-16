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
  /** Real user UUID for user-driven calls. Pass "system" (or any non-UUID
   *  sentinel) for worker-initiated calls — the logger stores NULL in
   *  that case. The column on ai_usage_logs is nullable. */
  userId: string;
  examId?: string;
};

// Standard UUID v1–v5 shape. Workers pass `"system"` (and similar
// sentinels) for non-user-driven calls; those should land as NULL in
// the FK column rather than crashing the insert with 22P02.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function logAICall(db: Database, params: LogAICallParams): Promise<string> {
  const userIdForLog = UUID_RE.test(params.userId) ? params.userId : null;
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
      userId: userIdForLog,
      examId: params.examId,
    })
    .returning({ id: aiUsageLogs.id });

  return row!.id;
}
