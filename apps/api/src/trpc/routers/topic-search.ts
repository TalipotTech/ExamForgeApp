import { z } from "zod";
import { and, eq, desc, inArray, ne } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { router, protectedProcedure } from "../trpc.js";
import {
  topicSearchHistory,
  nodeUnderstanding,
  syllabusNodes,
  syllabi,
  exams,
  userExams,
  tutorialFiles,
  questions,
} from "@examforge/shared/db/schema";
import { routeTextRequest } from "../../ai/ai-router.js";
import { checkSearchScope } from "../../lib/search/scope-guard.js";
import { searchNodes, searchTutorialContent } from "../../lib/search/node-search.js";
import { trackDemandSignal } from "../../lib/auto-content/demand-tracker.js";

const SCOPE_AI_ENABLED = process.env.SEARCH_SCOPE_AI_ENABLED !== "false";

// Resolve the user's active exam (falls back to highest-priority selected exam,
// the same source `learn.getDashboardData` uses).
async function resolveExam(
  db: Database,
  userId: string,
  examIdInput?: string,
): Promise<{ examId: string | undefined; examName: string | undefined }> {
  if (examIdInput) {
    const [e] = await db
      .select({ name: exams.name })
      .from(exams)
      .where(eq(exams.id, examIdInput))
      .limit(1);
    return { examId: examIdInput, examName: e?.name };
  }
  const [sel] = await db
    .select({ examId: userExams.examId, name: exams.name })
    .from(userExams)
    .innerJoin(exams, eq(exams.id, userExams.examId))
    .where(and(eq(userExams.userId, userId), eq(userExams.isActive, true)))
    .orderBy(userExams.priority)
    .limit(1);
  return { examId: sel?.examId, examName: sel?.name };
}

// Walk a node's ancestry within its syllabus → subject + "A › B › C" path.
async function resolveNodeContext(
  db: Database,
  nodeId: number,
): Promise<{
  title: string;
  subject: string;
  path: string;
  syllabusId: number | null;
  examId: string | null;
  examName: string | null;
} | null> {
  const [node] = await db
    .select({
      id: syllabusNodes.id,
      title: syllabusNodes.title,
      syllabusId: syllabusNodes.syllabusId,
    })
    .from(syllabusNodes)
    .where(eq(syllabusNodes.id, nodeId))
    .limit(1);
  if (!node) return null;

  const all = await db
    .select({
      id: syllabusNodes.id,
      parentId: syllabusNodes.parentId,
      title: syllabusNodes.title,
      depth: syllabusNodes.depth,
    })
    .from(syllabusNodes)
    .where(eq(syllabusNodes.syllabusId, node.syllabusId));
  const map = new Map(all.map((n) => [n.id, n]));
  const chain: typeof all = [];
  let cur = map.get(nodeId);
  let hops = 0;
  while (cur && hops < 12) {
    chain.unshift(cur);
    cur = cur.parentId ? map.get(cur.parentId) : undefined;
    hops += 1;
  }
  const visible = chain.filter((c) => c.depth > 0);
  const path = visible.map((c) => c.title).join(" › ");
  const subject = visible.length > 0 ? visible[0]!.title : node.title;

  const [syl] = await db
    .select({ examId: syllabi.examId })
    .from(syllabi)
    .where(eq(syllabi.id, node.syllabusId))
    .limit(1);
  let examName: string | null = null;
  if (syl?.examId) {
    const [e] = await db
      .select({ name: exams.name })
      .from(exams)
      .where(eq(exams.id, syl.examId))
      .limit(1);
    examName = e?.name ?? null;
  }

  return {
    title: node.title,
    subject,
    path,
    syllabusId: node.syllabusId,
    examId: syl?.examId ?? null,
    examName,
  };
}

export const topicSearchRouter = router({
  // ── suggest — side-effect-free, safe on every keystroke ──
  suggest: protectedProcedure
    .input(z.object({ q: z.string(), examId: z.string().uuid().optional() }))
    .query(async ({ ctx, input }) => {
      if (input.q.trim().length < 2) return [];
      const { examId } = await resolveExam(ctx.db, ctx.userId, input.examId);
      const hits = await searchNodes(ctx.db, input.q, { examId, orgId: ctx.orgId, limit: 8 });
      return hits.map((h) => ({
        nodeId: h.nodeId,
        title: h.title,
        subject: h.subject,
        path: h.path,
      }));
    }),

  // ── search — runs scope guard, logs history, tracks demand ──
  search: protectedProcedure
    .input(z.object({ q: z.string().min(2).max(500), examId: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { examId, examName } = await resolveExam(ctx.db, ctx.userId, input.examId);

      // 1. Scope guard (AI only for the ambiguous middle; fails open).
      const scope = await checkSearchScope(
        input.q,
        { examName },
        {
          aiEnabled: SCOPE_AI_ENABLED,
          classify: async (q, sys) => {
            const r = await routeTextRequest(
              {
                task: "classify_search_scope",
                prompt: q,
                systemPrompt: sys,
                userId: ctx.userId,
                examId,
                temperature: 0,
                maxTokens: 40,
              },
              ctx.db,
            );
            return r.data;
          },
        },
      );

      if (!scope.allowed) {
        await ctx.db.insert(topicSearchHistory).values({
          userId: ctx.userId,
          orgId: ctx.orgId,
          examId: examId ?? null,
          query: scope.normalizedQuery,
          resultCount: 0,
          wasRejected: true,
        });
        return {
          rejected: true as const,
          reason: scope.reason ?? "That doesn't look like a syllabus topic.",
          landingNodeId: null,
          nodes: [],
        };
      }

      // 2. Search nodes + content in parallel.
      const [nodeHits, contentHits] = await Promise.all([
        searchNodes(ctx.db, scope.normalizedQuery, { examId, orgId: ctx.orgId, limit: 8 }),
        searchTutorialContent(ctx.db, scope.normalizedQuery, {
          examId,
          orgId: ctx.orgId,
          limit: 8,
        }),
      ]);

      const landingNodeId = nodeHits[0]?.nodeId ?? contentHits[0]?.nodeId ?? null;

      // 3. Log history.
      await ctx.db.insert(topicSearchHistory).values({
        userId: ctx.userId,
        orgId: ctx.orgId,
        examId: examId ?? null,
        query: scope.normalizedQuery,
        matchedNodeId: landingNodeId,
        resultCount: nodeHits.length,
        wasRejected: false,
      });

      // 4. Track demand (thin topics — no content — weigh higher). Never throws.
      if (landingNodeId !== null) {
        try {
          await trackDemandSignal(
            ctx.db,
            landingNodeId,
            "search",
            ctx.userId,
            contentHits.length === 0 ? 2.0 : 1.0,
            examId,
            ctx.orgId,
          );
        } catch {
          // demand tracking is best-effort
        }
      }

      return {
        rejected: false as const,
        reason: undefined,
        landingNodeId,
        nodes: nodeHits.map((h) => ({
          nodeId: h.nodeId,
          title: h.title,
          subject: h.subject,
          path: h.path,
        })),
      };
    }),

  // ── history — recent-first, de-duped, skips rejected ──
  history: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          query: topicSearchHistory.query,
          matchedNodeId: topicSearchHistory.matchedNodeId,
          createdAt: topicSearchHistory.createdAt,
        })
        .from(topicSearchHistory)
        .where(
          and(eq(topicSearchHistory.userId, ctx.userId), eq(topicSearchHistory.wasRejected, false)),
        )
        .orderBy(desc(topicSearchHistory.createdAt))
        .limit(60);

      // De-dupe on matchedNodeId ?? query, preserving recent-first order.
      const seen = new Set<string>();
      const deduped: typeof rows = [];
      for (const r of rows) {
        const key =
          r.matchedNodeId !== null ? `n:${r.matchedNodeId}` : `q:${r.query.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(r);
        if (deduped.length >= input.limit) break;
      }

      const nodeIds = deduped.map((d) => d.matchedNodeId).filter((n): n is number => n !== null);
      const titles =
        nodeIds.length > 0
          ? await ctx.db
              .select({ id: syllabusNodes.id, title: syllabusNodes.title })
              .from(syllabusNodes)
              .where(inArray(syllabusNodes.id, nodeIds))
          : [];
      const titleMap = new Map(titles.map((t) => [t.id, t.title]));

      return deduped.map((d) => ({
        query: d.query,
        nodeId: d.matchedNodeId,
        nodeTitle: d.matchedNodeId !== null ? (titleMap.get(d.matchedNodeId) ?? null) : null,
        createdAt: d.createdAt,
      }));
    }),

  clearHistory: protectedProcedure
    .input(z.object({ id: z.string().uuid().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        await ctx.db
          .delete(topicSearchHistory)
          .where(
            and(eq(topicSearchHistory.id, input.id), eq(topicSearchHistory.userId, ctx.userId)),
          );
      } else {
        await ctx.db.delete(topicSearchHistory).where(eq(topicSearchHistory.userId, ctx.userId));
      }
      return { success: true };
    }),

  // ── bundle — unified content for one landing node ──
  bundle: protectedProcedure
    .input(z.object({ nodeId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const nodeCtx = await resolveNodeContext(ctx.db, input.nodeId);
      if (!nodeCtx) return null;

      const [tutorial] = await ctx.db
        .select({
          id: tutorialFiles.id,
          syllabusId: tutorialFiles.syllabusId,
          title: tutorialFiles.title,
          sections: tutorialFiles.sections,
          estimatedReadMinutes: tutorialFiles.estimatedReadMinutes,
        })
        .from(tutorialFiles)
        .where(
          and(eq(tutorialFiles.syllabusNodeId, input.nodeId), eq(tutorialFiles.isCurrent, true)),
        )
        .limit(1);

      // Questions for this node (direct or mapped), approved only.
      const APPROVED = ["auto_approved", "admin_approved"];
      const questionRows = await ctx.db
        .select({
          id: questions.id,
          type: questions.type,
          difficulty: questions.difficulty,
          content: questions.content,
          sourceType: questions.sourceType,
          verificationStatus: questions.verificationStatus,
          syllabusNodeId: questions.syllabusNodeId,
          mappedSyllabusNodeId: questions.mappedSyllabusNodeId,
        })
        .from(questions)
        .where(eq(questions.examId, nodeCtx.examId ?? ""))
        .limit(200);

      const nodeQuestions = questionRows
        .filter(
          (q) =>
            (q.syllabusNodeId === input.nodeId || q.mappedSyllabusNodeId === input.nodeId) &&
            (q.verificationStatus === null || APPROVED.includes(q.verificationStatus)),
        )
        .slice(0, 20)
        .map((q) => {
          const c = (q.content ?? {}) as Record<string, unknown>;
          const stem =
            (typeof c.question === "string" && c.question) ||
            (typeof c.stem === "string" && c.stem) ||
            (typeof c.text === "string" && c.text) ||
            "";
          return {
            id: q.id,
            type: q.type,
            difficulty: q.difficulty,
            stem,
            trustTier: q.sourceType ?? null,
          };
        });

      // Related = same-parent siblings.
      const [self] = await ctx.db
        .select({ parentId: syllabusNodes.parentId })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, input.nodeId))
        .limit(1);
      const related =
        self?.parentId != null
          ? await ctx.db
              .select({ nodeId: syllabusNodes.id, title: syllabusNodes.title })
              .from(syllabusNodes)
              .where(
                and(eq(syllabusNodes.parentId, self.parentId), ne(syllabusNodes.id, input.nodeId)),
              )
              .orderBy(syllabusNodes.sortOrder)
              .limit(8)
          : [];

      const [imgNode] = await ctx.db
        .select({ imageUrl: syllabusNodes.imageUrl, imageStatus: syllabusNodes.imageStatus })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.id, input.nodeId))
        .limit(1);

      // User's current understanding rating for this node.
      const [ur] = await ctx.db
        .select({ level: nodeUnderstanding.level })
        .from(nodeUnderstanding)
        .where(
          and(
            eq(nodeUnderstanding.userId, ctx.userId),
            eq(nodeUnderstanding.syllabusNodeId, input.nodeId),
          ),
        )
        .limit(1);

      return {
        node: {
          id: input.nodeId,
          title: nodeCtx.title,
          subject: nodeCtx.subject,
          path: nodeCtx.path,
          syllabusId: nodeCtx.syllabusId,
          examId: nodeCtx.examId,
          examName: nodeCtx.examName,
        },
        tutorial: tutorial
          ? {
              id: tutorial.id,
              syllabusId: tutorial.syllabusId,
              title: tutorial.title,
              sections: tutorial.sections ?? [],
              estimatedReadMinutes: tutorial.estimatedReadMinutes,
            }
          : null,
        questions: nodeQuestions,
        related,
        images: imgNode?.imageUrl
          ? [{ url: imgNode.imageUrl, status: imgNode.imageStatus ?? "ready" }]
          : [],
        understanding: ur?.level ?? null,
      };
    }),

  // ── node understanding (red/orange/green) — set from the reader ──
  getUnderstanding: protectedProcedure
    .input(z.object({ nodeId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({ level: nodeUnderstanding.level })
        .from(nodeUnderstanding)
        .where(
          and(
            eq(nodeUnderstanding.userId, ctx.userId),
            eq(nodeUnderstanding.syllabusNodeId, input.nodeId),
          ),
        )
        .limit(1);
      return { level: row?.level ?? null };
    }),

  setUnderstanding: protectedProcedure
    .input(
      z.object({
        nodeId: z.number().int().positive(),
        level: z.enum(["red", "orange", "green"]),
        examId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { examId } = await resolveExam(ctx.db, ctx.userId, input.examId);
      const now = new Date();
      const [existing] = await ctx.db
        .select({ id: nodeUnderstanding.id })
        .from(nodeUnderstanding)
        .where(
          and(
            eq(nodeUnderstanding.userId, ctx.userId),
            eq(nodeUnderstanding.syllabusNodeId, input.nodeId),
          ),
        )
        .limit(1);

      if (existing) {
        await ctx.db
          .update(nodeUnderstanding)
          .set({ level: input.level, updatedAt: now })
          .where(eq(nodeUnderstanding.id, existing.id));
      } else {
        await ctx.db.insert(nodeUnderstanding).values({
          userId: ctx.userId,
          orgId: ctx.orgId,
          examId: examId ?? null,
          syllabusNodeId: input.nodeId,
          level: input.level,
        });
      }

      // A self-rated weak topic is also a demand signal.
      if (input.level !== "green") {
        try {
          await trackDemandSignal(
            ctx.db,
            input.nodeId,
            "direct",
            ctx.userId,
            1.0,
            examId,
            ctx.orgId,
          );
        } catch {
          // best-effort
        }
      }
      return { success: true };
    }),
});
