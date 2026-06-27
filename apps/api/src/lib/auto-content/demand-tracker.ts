/**
 * Demand tracker — records and aggregates per-node demand signals that drive
 * demand-based auto-content generation (the ExamForge analog of Padvik's
 * demand-tracker). Pure: every function takes `db` as a param.
 *
 * Score model: SUM(weight) × LN(distinct users + 1) over a 30-day window.
 * `getTopDemandNodes` excludes nodes that already have BOTH a current
 * tutorial and at least one question — those don't need generation.
 */

import { sql, inArray, or, eq, and } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { contentDemandSignals, tutorialFiles, questions } from "@examforge/shared/db/schema";

export type DemandSignalType = "search" | "view" | "ask_ai" | "exam_weak" | "doubt" | "direct";

export interface DemandScore {
  syllabusNodeId: number;
  examId: string | null;
  score: number;
  signalCount: number;
  userCount: number;
}

/** Insert one demand signal. Never throws to the caller's critical path. */
export async function trackDemandSignal(
  db: Database,
  nodeId: number,
  type: DemandSignalType,
  userId: string | null,
  weight: number,
  examId?: string | null,
  orgId?: string | null,
): Promise<void> {
  await db.insert(contentDemandSignals).values({
    syllabusNodeId: nodeId,
    signalType: type,
    userId: userId ?? null,
    weight: String(weight),
    examId: examId ?? null,
    orgId: orgId ?? null,
  });
}

/** Aggregate scores over the trailing 30 days, highest first. */
export async function calculateDemandScores(
  db: Database,
  opts?: { windowDays?: number },
): Promise<DemandScore[]> {
  const windowDays = opts?.windowDays ?? 30;
  const rows = await db
    .select({
      syllabusNodeId: contentDemandSignals.syllabusNodeId,
      examId: sql<string | null>`max(${contentDemandSignals.examId}::text)`,
      score: sql<number>`(sum(${contentDemandSignals.weight}) * ln(count(distinct ${contentDemandSignals.userId}) + 1))::float8`,
      signalCount: sql<number>`count(*)::int`,
      userCount: sql<number>`count(distinct ${contentDemandSignals.userId})::int`,
    })
    .from(contentDemandSignals)
    .where(sql`${contentDemandSignals.createdAt} > now() - (${windowDays} || ' days')::interval`)
    .groupBy(contentDemandSignals.syllabusNodeId)
    .orderBy(sql`score desc`);

  return rows.map((r) => ({
    syllabusNodeId: r.syllabusNodeId,
    examId: r.examId,
    score: Number(r.score) || 0,
    signalCount: r.signalCount,
    userCount: r.userCount,
  }));
}

/**
 * Top demand nodes that still LACK content — i.e. missing a current tutorial
 * and/or any questions. Each result flags which kind of content is missing so
 * the scheduler can enqueue the right worker.
 */
export async function getTopDemandNodes(
  db: Database,
  opts?: { limit?: number; minScore?: number; windowDays?: number },
): Promise<Array<DemandScore & { hasTutorial: boolean; hasQuestions: boolean }>> {
  const limit = opts?.limit ?? 20;
  const minScore = opts?.minScore ?? 1;
  const scores = await calculateDemandScores(db, { windowDays: opts?.windowDays });
  const candidates = scores.filter((s) => s.score >= minScore);
  if (candidates.length === 0) return [];

  const nodeIds = candidates.map((c) => c.syllabusNodeId);

  // One round-trip each: which candidate nodes have a current tutorial /
  // any questions (matched on either syllabusNodeId or mappedSyllabusNodeId).
  const [tutorialRows, questionRows] = await Promise.all([
    db
      .select({ nodeId: tutorialFiles.syllabusNodeId })
      .from(tutorialFiles)
      .where(
        and(eq(tutorialFiles.isCurrent, true), inArray(tutorialFiles.syllabusNodeId, nodeIds)),
      ),
    db
      .select({
        nodeId: questions.syllabusNodeId,
        mappedNodeId: questions.mappedSyllabusNodeId,
      })
      .from(questions)
      .where(
        or(
          inArray(questions.syllabusNodeId, nodeIds),
          inArray(questions.mappedSyllabusNodeId, nodeIds),
        ),
      ),
  ]);

  const withTutorial = new Set(tutorialRows.map((r) => r.nodeId));
  const withQuestions = new Set<number>();
  for (const r of questionRows) {
    if (r.nodeId !== null) withQuestions.add(r.nodeId);
    if (r.mappedNodeId !== null) withQuestions.add(r.mappedNodeId);
  }

  return candidates
    .map((c) => ({
      ...c,
      hasTutorial: withTutorial.has(c.syllabusNodeId),
      hasQuestions: withQuestions.has(c.syllabusNodeId),
    }))
    .filter((c) => !(c.hasTutorial && c.hasQuestions))
    .slice(0, limit);
}
