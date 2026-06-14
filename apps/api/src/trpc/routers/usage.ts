import { and, count, eq, gte, sum } from "drizzle-orm";
import { aiUsageLogs } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";

/** Start of the current calendar month in UTC. Cheap, deterministic. */
function startOfMonthUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export const usageRouter = router({
  /** Aggregated AI usage for the calling user, this calendar month.
   *
   *  Spans every feature (rag-answer, rag-embed, chat, embed, voice,
   *  tutorial, verify, etc.) — i.e. the full ai_usage_logs surface. UI
   *  can render the total + drilldowns by feature and by provider.
   *
   *  Open to any logged-in user; everyone sees only their own rows
   *  (ai_usage_logs.user_id = ctx.userId). */
  getMonthlyUsage: protectedProcedure.query(async ({ ctx }) => {
    const since = startOfMonthUtc();
    const baseWhere = and(eq(aiUsageLogs.userId, ctx.userId), gte(aiUsageLogs.createdAt, since));

    const [totalsRow] = await ctx.db
      .select({
        calls: count(),
        inputTokens: sum(aiUsageLogs.inputTokens),
        outputTokens: sum(aiUsageLogs.outputTokens),
        totalCost: sum(aiUsageLogs.estimatedCostUsd),
      })
      .from(aiUsageLogs)
      .where(baseWhere);

    const byFeatureRows = await ctx.db
      .select({
        feature: aiUsageLogs.feature,
        calls: count(),
        inputTokens: sum(aiUsageLogs.inputTokens),
        outputTokens: sum(aiUsageLogs.outputTokens),
        totalCost: sum(aiUsageLogs.estimatedCostUsd),
      })
      .from(aiUsageLogs)
      .where(baseWhere)
      .groupBy(aiUsageLogs.feature);

    const byProviderRows = await ctx.db
      .select({
        provider: aiUsageLogs.provider,
        calls: count(),
        inputTokens: sum(aiUsageLogs.inputTokens),
        outputTokens: sum(aiUsageLogs.outputTokens),
        totalCost: sum(aiUsageLogs.estimatedCostUsd),
      })
      .from(aiUsageLogs)
      .where(baseWhere)
      .groupBy(aiUsageLogs.provider);

    const toNumber = (v: string | number | null | undefined): number =>
      typeof v === "number" ? v : Number(v ?? 0);

    return {
      windowStart: since.toISOString(),
      totals: {
        calls: Number(totalsRow?.calls ?? 0),
        inputTokens: toNumber(totalsRow?.inputTokens),
        outputTokens: toNumber(totalsRow?.outputTokens),
        totalTokens: toNumber(totalsRow?.inputTokens) + toNumber(totalsRow?.outputTokens),
        estimatedCostUsd: toNumber(totalsRow?.totalCost),
      },
      byFeature: byFeatureRows.map((r) => ({
        feature: r.feature,
        calls: Number(r.calls),
        inputTokens: toNumber(r.inputTokens),
        outputTokens: toNumber(r.outputTokens),
        totalTokens: toNumber(r.inputTokens) + toNumber(r.outputTokens),
        estimatedCostUsd: toNumber(r.totalCost),
      })),
      byProvider: byProviderRows.map((r) => ({
        provider: r.provider,
        calls: Number(r.calls),
        inputTokens: toNumber(r.inputTokens),
        outputTokens: toNumber(r.outputTokens),
        totalTokens: toNumber(r.inputTokens) + toNumber(r.outputTokens),
        estimatedCostUsd: toNumber(r.totalCost),
      })),
    };
  }),
});
