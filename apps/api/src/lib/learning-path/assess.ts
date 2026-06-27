/**
 * Self-assessing learning path. Pure: takes `db` + injected `narrate`.
 *
 * The ranking and `overallScore` are 100% deterministic (SQL + code). The AI
 * is used ONLY to phrase the summary and per-item reason/action text, and the
 * whole thing falls back to templated prose if narration fails. AI must never
 * invent nodes or move the score.
 */

import { and, eq, desc, inArray } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import {
  nodeUnderstanding,
  tutorialProgress,
  userProgress,
  topicSearchHistory,
  tutorialFiles,
  syllabi,
  syllabusNodes,
} from "@examforge/shared/db/schema";

export interface LearningPathInput {
  userId: string;
  orgId: string;
  examId: string;
  subject?: string;
}

export interface StrengthItem {
  nodeId: number;
  title: string;
  reason: string;
}

export interface ImprovementItem {
  nodeId: number;
  title: string;
  reason: string;
  priority: "high" | "medium" | "low";
  suggestedAction: string;
  tutorialId?: number;
  syllabusId?: number;
}

export interface NarrationItem {
  nodeId: number;
  title: string;
  signalSummary: string;
}

export interface NarrationPayload {
  examId: string;
  subject?: string;
  improvements: NarrationItem[];
  strengthTitles: string[];
  overallScore: number;
}

export interface NarrationResult {
  summary: string;
  items: Array<{ nodeId: number; reason: string; suggestedAction: string }>;
  model: string;
  costUsd: number;
}

export interface LearningPathDeps {
  /** Phrase the prose. Return null/throw → deterministic fallback is used. */
  narrate: (payload: NarrationPayload) => Promise<NarrationResult | null>;
}

export interface LearningPathResult {
  summary: string;
  strengths: StrengthItem[];
  improvements: ImprovementItem[];
  overallScore: number;
  signals: Record<string, unknown>;
  model: string;
  costUsd: number;
  isEmpty: boolean;
}

type NodeRow = { id: number; parentId: number | null; title: string; depth: number };

const LEVEL_SCORE: Record<string, number> = { green: 100, orange: 50, red: 10 };

export async function assessLearningPath(
  db: Database,
  input: LearningPathInput,
  deps: LearningPathDeps,
): Promise<LearningPathResult> {
  const { userId, examId, subject } = input;

  // ── Step A — gather signals (SQL only) ──

  const syllabusRows = await db
    .select({ id: syllabi.id })
    .from(syllabi)
    .where(eq(syllabi.examId, examId));
  const syllabusIds = syllabusRows.map((s) => s.id);

  // All nodes in the exam — for titles, ancestry (subject), filtering.
  const nodeRows: NodeRow[] =
    syllabusIds.length === 0
      ? []
      : await db
          .select({
            id: syllabusNodes.id,
            parentId: syllabusNodes.parentId,
            title: syllabusNodes.title,
            depth: syllabusNodes.depth,
          })
          .from(syllabusNodes)
          .where(inArray(syllabusNodes.syllabusId, syllabusIds));
  const nodeMap = new Map(nodeRows.map((n) => [n.id, n]));
  const subjectOf = (nodeId: number): string => {
    const chain: NodeRow[] = [];
    let cur = nodeMap.get(nodeId);
    let hops = 0;
    while (cur && hops < 12) {
      chain.unshift(cur);
      cur = cur.parentId ? nodeMap.get(cur.parentId) : undefined;
      hops += 1;
    }
    const visible = chain.filter((c) => c.depth > 0);
    return visible.length > 0 ? visible[0]!.title : (nodeMap.get(nodeId)?.title ?? "");
  };
  const inSubject = (nodeId: number): boolean =>
    !subject || subjectOf(nodeId).toLowerCase() === subject.toLowerCase();

  const [understandingRows, progressRows, userProg, missRows, tutorialRows] = await Promise.all([
    db
      .select({ nodeId: nodeUnderstanding.syllabusNodeId, level: nodeUnderstanding.level })
      .from(nodeUnderstanding)
      .where(and(eq(nodeUnderstanding.userId, userId), eq(nodeUnderstanding.examId, examId))),
    syllabusIds.length === 0
      ? Promise.resolve([] as Array<{ nodeId: number; completionPercent: number }>)
      : db
          .select({
            nodeId: tutorialProgress.syllabusNodeId,
            completionPercent: tutorialProgress.completionPercent,
          })
          .from(tutorialProgress)
          .where(
            and(
              eq(tutorialProgress.userId, userId),
              inArray(tutorialProgress.syllabusId, syllabusIds),
            ),
          ),
    db
      .select({
        subjectScores: userProgress.subjectScores,
        weakSubjects: userProgress.weakSubjects,
        strongSubjects: userProgress.strongSubjects,
        averageScore: userProgress.averageScore,
      })
      .from(userProgress)
      .where(and(eq(userProgress.userId, userId), eq(userProgress.examId, examId)))
      .limit(1),
    db
      .select({ nodeId: topicSearchHistory.matchedNodeId })
      .from(topicSearchHistory)
      .where(
        and(
          eq(topicSearchHistory.userId, userId),
          eq(topicSearchHistory.examId, examId),
          eq(topicSearchHistory.resultCount, 0),
        ),
      )
      .orderBy(desc(topicSearchHistory.createdAt))
      .limit(30),
    db
      .select({
        nodeId: tutorialFiles.syllabusNodeId,
        tutorialId: tutorialFiles.id,
        syllabusId: tutorialFiles.syllabusId,
      })
      .from(tutorialFiles)
      .where(and(eq(tutorialFiles.examId, examId), eq(tutorialFiles.isCurrent, true))),
  ]);

  const tutorialByNode = new Map(
    tutorialRows.map((t) => [t.nodeId, { tutorialId: t.tutorialId, syllabusId: t.syllabusId }]),
  );
  const understandingByNode = new Map(understandingRows.map((u) => [u.nodeId, u.level]));
  const completionByNode = new Map(progressRows.map((p) => [p.nodeId, p.completionPercent]));
  const missNodeSet = new Set(missRows.map((m) => m.nodeId).filter((n): n is number => n !== null));
  const up = userProg[0];
  const weakSubjects = new Set((up?.weakSubjects ?? []).map((s) => s.toLowerCase()));

  // ── Step B — rank (deterministic) ──
  // priority weight: red > exam-weak > orange > low-completion; +search-miss tiebreak.

  const candidates = new Map<
    number,
    { weight: number; reasons: string[]; priority: "high" | "medium" | "low" }
  >();
  const bump = (
    nodeId: number,
    weight: number,
    reason: string,
    priority: "high" | "medium" | "low",
  ): void => {
    if (!nodeMap.has(nodeId) || !inSubject(nodeId)) return;
    const cur = candidates.get(nodeId);
    const order = { high: 3, medium: 2, low: 1 };
    if (cur) {
      cur.weight += weight;
      cur.reasons.push(reason);
      if (order[priority] > order[cur.priority]) cur.priority = priority;
    } else {
      candidates.set(nodeId, { weight, reasons: [reason], priority });
    }
  };

  for (const [nodeId, level] of understandingByNode) {
    if (level === "red") bump(nodeId, 100, "You rated this as not understood", "high");
    else if (level === "orange") bump(nodeId, 50, "You rated this as partly understood", "medium");
  }
  // exam-weak: any node whose subject is in the user's weak subjects.
  if (weakSubjects.size > 0) {
    for (const n of nodeMap.values()) {
      if (weakSubjects.has(subjectOf(n.id).toLowerCase())) {
        bump(n.id, 60, "Part of a subject you score low on", "high");
      }
    }
  }
  for (const [nodeId, pct] of completionByNode) {
    if (pct > 0 && pct < 40) bump(nodeId, 30, "Tutorial barely started", "low");
  }
  for (const nodeId of missNodeSet) bump(nodeId, 20, "You searched this but found little", "low");

  const ranked = [...candidates.entries()]
    .map(([nodeId, v]) => {
      const tut = tutorialByNode.get(nodeId);
      return {
        nodeId,
        title: nodeMap.get(nodeId)?.title ?? `Topic ${nodeId}`,
        weight: v.weight,
        priority: v.priority,
        reason: v.reasons[0]!,
        searchMiss: missNodeSet.has(nodeId),
        tutorialId: tut?.tutorialId,
        syllabusId: tut?.syllabusId,
      };
    })
    .sort((a, b) => b.weight - a.weight || Number(b.searchMiss) - Number(a.searchMiss))
    .slice(0, 12);

  // Strengths = green-rated nodes.
  const strengthsBase = [...understandingByNode.entries()]
    .filter(([nodeId, level]) => level === "green" && inSubject(nodeId))
    .slice(0, 8)
    .map(([nodeId]) => ({
      nodeId,
      title: nodeMap.get(nodeId)?.title ?? `Topic ${nodeId}`,
      reason: "You rated this as well understood",
    }));

  // ── overallScore (deterministic) ──
  const overallScore = computeOverallScore(understandingByNode, completionByNode, up, inSubject);

  const isEmpty = ranked.length === 0 && strengthsBase.length === 0;

  const signals: Record<string, unknown> = {
    understoodCounts: countLevels(understandingByNode, inSubject),
    weakSubjects: [...weakSubjects],
    lowCompletionCount: [...completionByNode.values()].filter((p) => p > 0 && p < 40).length,
    searchMissCount: missNodeSet.size,
    rankedCount: ranked.length,
  };

  // ── Step C — AI narration (one cheap call; deterministic fallback) ──
  let summary = templateSummary(overallScore, ranked.length, strengthsBase.length, subject);
  let model = "deterministic";
  let costUsd = 0;
  const reasonByNode = new Map(ranked.map((r) => [r.nodeId, r.reason]));
  const actionByNode = new Map(ranked.map((r) => [r.nodeId, defaultAction(r.tutorialId)]));

  if (!isEmpty) {
    try {
      const narration = await deps.narrate({
        examId,
        subject,
        improvements: ranked.map((r) => ({
          nodeId: r.nodeId,
          title: r.title,
          signalSummary: r.reason,
        })),
        strengthTitles: strengthsBase.map((s) => s.title),
        overallScore,
      });
      if (narration) {
        summary = narration.summary || summary;
        model = narration.model;
        costUsd = narration.costUsd;
        for (const item of narration.items) {
          if (reasonByNode.has(item.nodeId)) {
            if (item.reason) reasonByNode.set(item.nodeId, item.reason);
            if (item.suggestedAction) actionByNode.set(item.nodeId, item.suggestedAction);
          }
        }
      }
    } catch {
      // keep deterministic prose
    }
  }

  const improvements: ImprovementItem[] = ranked.map((r) => ({
    nodeId: r.nodeId,
    title: r.title,
    reason: reasonByNode.get(r.nodeId) ?? r.reason,
    priority: r.priority,
    suggestedAction: actionByNode.get(r.nodeId) ?? defaultAction(r.tutorialId),
    tutorialId: r.tutorialId,
    syllabusId: r.syllabusId,
  }));

  return {
    summary,
    strengths: strengthsBase,
    improvements,
    overallScore,
    signals,
    model,
    costUsd,
    isEmpty,
  };
}

function countLevels(
  byNode: Map<number, string>,
  inSubject: (n: number) => boolean,
): { red: number; orange: number; green: number } {
  const out = { red: 0, orange: 0, green: 0 };
  for (const [nodeId, level] of byNode) {
    if (!inSubject(nodeId)) continue;
    if (level === "red") out.red += 1;
    else if (level === "orange") out.orange += 1;
    else if (level === "green") out.green += 1;
  }
  return out;
}

function computeOverallScore(
  understandingByNode: Map<number, string>,
  completionByNode: Map<number, number>,
  up: { averageScore: number | null } | undefined,
  inSubject: (n: number) => boolean,
): number {
  const parts: Array<{ value: number; weight: number }> = [];

  const levels = [...understandingByNode.entries()].filter(([n]) => inSubject(n));
  if (levels.length > 0) {
    const avg = levels.reduce((s, [, l]) => s + (LEVEL_SCORE[l] ?? 50), 0) / levels.length;
    parts.push({ value: avg, weight: 0.5 });
  }
  if (up?.averageScore != null) {
    parts.push({ value: Math.max(0, Math.min(100, up.averageScore)), weight: 0.3 });
  }
  const completions = [...completionByNode.values()];
  if (completions.length > 0) {
    const avg = completions.reduce((s, p) => s + p, 0) / completions.length;
    parts.push({ value: avg, weight: 0.2 });
  }
  if (parts.length === 0) return 0;
  const totalWeight = parts.reduce((s, p) => s + p.weight, 0);
  const score = parts.reduce((s, p) => s + p.value * p.weight, 0) / totalWeight;
  return Math.round(score * 100) / 100;
}

function templateSummary(
  score: number,
  improveCount: number,
  strengthCount: number,
  subject?: string,
): string {
  const scope = subject ? ` in ${subject}` : "";
  if (improveCount === 0 && strengthCount === 0) {
    return `We don't have enough signals yet${scope}. Rate a few topics and take a practice exam to build your learning path.`;
  }
  return `Your readiness${scope} is about ${Math.round(score)}%. Focus on ${improveCount} topic${improveCount === 1 ? "" : "s"} that need work${strengthCount > 0 ? `, and keep up your ${strengthCount} strong area${strengthCount === 1 ? "" : "s"}` : ""}.`;
}

function defaultAction(tutorialId?: number): string {
  return tutorialId
    ? "Read the tutorial, then practice questions."
    : "Practice questions on this topic.";
}
