/**
 * Question Verification — admin review dashboard router
 *
 * Implements the endpoints that back the /admin/verification page
 * (Phase 4 of QUESTION_ACQUISITION_STRATEGY.md). Queue listing,
 * per-question detail with full audit trail, approve/reject/edit
 * with audit writeback, and on-demand revalidation.
 */

import { z } from "zod";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  questions,
  questionVerifications,
  exams,
  syllabusNodes,
  users,
} from "@examforge/shared/db/schema";
import {
  listVerificationQueueInputSchema,
  reviewQuestionInputSchema,
  verificationStatusEnum,
  sourceTypeEnum,
} from "@examforge/shared/validators";
import { router, adminProcedure } from "../trpc.js";
import { addVerifyQuestionJob } from "../../queues/verification-queue.js";
import { TRPCError } from "@trpc/server";

export const questionVerificationRouter = router({
  /**
   * Admin: per-status counts for the summary chips. Optionally
   * scoped to one exam.
   */
  getSummary: adminProcedure
    .input(z.object({ examId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const where = input?.examId ? eq(questions.examId, input.examId) : undefined;

      const rows = await ctx.db
        .select({
          status: questions.verificationStatus,
          count: sql<number>`count(*)::int`,
        })
        .from(questions)
        .where(where)
        .groupBy(questions.verificationStatus);

      type StatusKey =
        | "unverified"
        | "auto_approved"
        | "needs_review"
        | "admin_approved"
        | "rejected";
      const counts: Record<StatusKey, number> = {
        unverified: 0,
        auto_approved: 0,
        needs_review: 0,
        admin_approved: 0,
        rejected: 0,
      };
      for (const r of rows) {
        const s = (r.status ?? "unverified") as StatusKey;
        if (s in counts) counts[s] = Number(r.count);
      }
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return { total, ...counts };
    }),

  /**
   * Admin: paginated queue for the review table. Each row returns the
   * question + verification scores + a small slice of the most recent
   * audit issues so the row can render a one-line "why flagged?".
   */
  listQueue: adminProcedure
    .input(listVerificationQueueInputSchema)
    .query(async ({ ctx, input }) => {
      const conditions = [];
      if (input.examId) conditions.push(eq(questions.examId, input.examId));
      if (input.status) conditions.push(eq(questions.verificationStatus, input.status));
      if (input.sourceType) conditions.push(eq(questions.sourceType, input.sourceType));
      if (input.minScore !== undefined)
        conditions.push(sql`${questions.verificationScore} >= ${input.minScore}`);
      if (input.maxScore !== undefined)
        conditions.push(sql`${questions.verificationScore} <= ${input.maxScore}`);

      const whereClause = conditions.length ? and(...conditions) : undefined;

      const [rows, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: questions.id,
            examId: questions.examId,
            examName: exams.name,
            content: questions.content,
            subject: questions.subject,
            analyzedSubject: questions.analyzedSubject,
            analyzedTopic: questions.analyzedTopic,
            analyzedStyle: questions.analyzedStyle,
            difficulty: questions.difficulty,
            sourceType: questions.sourceType,
            sourceDetail: questions.sourceDetail,
            source: questions.source,
            originalExam: questions.originalExam,
            paperYear: questions.paperYear,
            verificationStatus: questions.verificationStatus,
            verificationScore: questions.verificationScore,
            factualConfidence: questions.factualConfidence,
            syllabusAlignmentScore: questions.syllabusAlignmentScore,
            patternMatchScore: questions.patternMatchScore,
            verificationDetails: questions.verificationDetails,
            mappedSyllabusNodeId: questions.mappedSyllabusNodeId,
            historicallyTested: questions.historicallyTested,
            verifiedAt: questions.verifiedAt,
            createdAt: questions.createdAt,
          })
          .from(questions)
          .leftJoin(exams, eq(questions.examId, exams.id))
          .where(whereClause)
          .orderBy(
            // Lowest-score items bubble to the top of the review queue
            // so admins see the most problematic first.
            sql`${questions.verificationScore} ASC NULLS LAST`,
            desc(questions.createdAt),
          )
          .limit(input.limit)
          .offset(input.offset),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(questions)
          .where(whereClause),
      ]);

      return {
        rows,
        total: Number(totalResult[0]?.count ?? 0),
      };
    }),

  /**
   * Admin: full detail for one question — content + verification
   * scores + full audit trail (every question_verifications row) +
   * the linked syllabus node's title if any.
   */
  getDetail: adminProcedure
    .input(z.object({ questionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [q] = await ctx.db
        .select({
          question: questions,
          examName: exams.name,
        })
        .from(questions)
        .leftJoin(exams, eq(questions.examId, exams.id))
        .where(eq(questions.id, input.questionId))
        .limit(1);

      if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });

      const auditRows = await ctx.db
        .select({
          id: questionVerifications.id,
          layer: questionVerifications.layer,
          result: questionVerifications.result,
          score: questionVerifications.score,
          details: questionVerifications.details,
          aiProvider: questionVerifications.aiProvider,
          aiTokensUsed: questionVerifications.aiTokensUsed,
          reviewedBy: questionVerifications.reviewedBy,
          reviewerName: users.email,
          createdAt: questionVerifications.createdAt,
        })
        .from(questionVerifications)
        .leftJoin(users, eq(questionVerifications.reviewedBy, users.id))
        .where(eq(questionVerifications.questionId, input.questionId))
        .orderBy(desc(questionVerifications.createdAt));

      let mappedNodeTitle: string | null = null;
      if (q.question.mappedSyllabusNodeId) {
        const [node] = await ctx.db
          .select({ title: syllabusNodes.title })
          .from(syllabusNodes)
          .where(eq(syllabusNodes.id, q.question.mappedSyllabusNodeId))
          .limit(1);
        mappedNodeTitle = node?.title ?? null;
      }

      return {
        question: q.question,
        examName: q.examName,
        auditTrail: auditRows,
        mappedSyllabusNodeTitle: mappedNodeTitle,
      };
    }),

  /**
   * Admin: approve or reject a question with optional edits. Writes
   * an audit row (layer='admin'). If edits are provided, applies them
   * to questions.content before flipping status.
   */
  review: adminProcedure.input(reviewQuestionInputSchema).mutation(async ({ ctx, input }) => {
    const [q] = await ctx.db
      .select()
      .from(questions)
      .where(eq(questions.id, input.questionId))
      .limit(1);
    if (!q) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });

    // Apply edits to content if any.
    if (input.edits) {
      const current = q.content as {
        question?: string;
        options?: string[];
        answer?: number;
        explanation?: string;
      };
      const next = {
        ...current,
        ...(input.edits.question !== undefined ? { question: input.edits.question } : {}),
        ...(input.edits.options ? { options: input.edits.options } : {}),
        ...(input.edits.answer !== undefined ? { answer: input.edits.answer } : {}),
        ...(input.edits.explanation !== undefined ? { explanation: input.edits.explanation } : {}),
      };
      const updates: Partial<typeof questions.$inferInsert> = {
        content: next,
        updatedAt: new Date(),
      };
      if (input.edits.difficulty) updates.difficulty = input.edits.difficulty;
      await ctx.db.update(questions).set(updates).where(eq(questions.id, q.id));
    }

    const newStatus = input.decision === "approve" ? "admin_approved" : "rejected";
    await ctx.db
      .update(questions)
      .set({
        verificationStatus: newStatus,
        verifiedBy: ctx.userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(questions.id, q.id));

    await ctx.db.insert(questionVerifications).values({
      questionId: q.id,
      layer: "admin",
      result: input.decision === "approve" ? "pass" : "fail",
      score: input.decision === "approve" ? 1.0 : 0.0,
      details: {
        decision: input.decision,
        notes: input.notes ?? null,
        editsApplied: Boolean(input.edits),
        edits: input.edits ?? null,
        previousStatus: q.verificationStatus,
      },
      reviewedBy: ctx.userId,
    });

    return {
      success: true,
      questionId: q.id,
      newStatus,
    };
  }),

  /**
   * Admin: queue another verification pass — e.g. after schema or
   * prompt improvements.
   */
  revalidate: adminProcedure
    .input(z.object({ questionId: z.string().uuid(), force: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const jobId = await addVerifyQuestionJob({
        questionId: input.questionId,
        userId: ctx.userId,
        orgId: ctx.orgId ?? "",
        autoTriggered: false,
        force: input.force,
      });
      return { success: true, jobId };
    }),

  /**
   * Admin: bulk revalidate a filtered set of questions. Useful after
   * tuning prompts or adding new seed data — re-run verification on
   * all `needs_review` items, or all `unverified` for a given exam,
   * without clicking each one.
   */
  bulkRevalidate: adminProcedure
    .input(
      z.object({
        examId: z.string().uuid().optional(),
        status: verificationStatusEnum.optional(),
        limit: z.number().int().min(1).max(500).default(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [];
      if (input.examId) conditions.push(eq(questions.examId, input.examId));
      if (input.status) conditions.push(eq(questions.verificationStatus, input.status));

      const rows = await ctx.db
        .select({ id: questions.id })
        .from(questions)
        .where(conditions.length ? and(...conditions) : undefined)
        .limit(input.limit);

      let queued = 0;
      for (const row of rows) {
        try {
          await addVerifyQuestionJob({
            questionId: row.id,
            userId: ctx.userId,
            orgId: ctx.orgId ?? "",
            autoTriggered: false,
            force: true,
          });
          queued++;
        } catch {
          // non-fatal — skip
        }
      }
      return { success: true, queued, candidateCount: rows.length };
    }),

  /**
   * Admin: bulk-approve a filtered set of questions without clicking
   * each one. Intended for the "I trust this whole paper" case — e.g.
   * the admin just ingested an official Kerala PSC answer-key PDF and
   * wants every extracted question flipped to `admin_approved` in one
   * go. Writes one audit row per question so the decision is traced.
   *
   * Scope the filter narrowly (at minimum by `examId`) or the call
   * will touch every matching question in the org.
   */
  bulkApprove: adminProcedure
    .input(
      z.object({
        examId: z.string().uuid().optional(),
        status: verificationStatusEnum.optional(),
        sourceType: sourceTypeEnum.optional(),
        notes: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [];
      if (input.examId) conditions.push(eq(questions.examId, input.examId));
      if (input.status) conditions.push(eq(questions.verificationStatus, input.status));
      if (input.sourceType) conditions.push(eq(questions.sourceType, input.sourceType));

      // Safety net: refuse if no filters — too easy to approve the
      // entire DB by accident.
      if (conditions.length === 0) {
        throw new Error("bulkApprove requires at least one filter (examId / status / sourceType).");
      }

      const rows = await ctx.db
        .select({ id: questions.id, previousStatus: questions.verificationStatus })
        .from(questions)
        .where(and(...conditions))
        .limit(input.limit);

      if (rows.length === 0) {
        return { success: true, approved: 0, candidateCount: 0 };
      }

      const ids = rows.map((r) => r.id);

      // Flip status in one UPDATE.
      await ctx.db
        .update(questions)
        .set({
          verificationStatus: "admin_approved",
          verifiedBy: ctx.userId,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(inArray(questions.id, ids));

      // One audit row per question so the decision is traceable.
      await ctx.db.insert(questionVerifications).values(
        rows.map((r) => ({
          questionId: r.id,
          layer: "admin" as const,
          result: "pass" as const,
          score: 1.0,
          details: {
            decision: "bulk_approve",
            notes: input.notes ?? null,
            previousStatus: r.previousStatus,
            filters: {
              examId: input.examId ?? null,
              status: input.status ?? null,
              sourceType: input.sourceType ?? null,
            },
          },
          reviewedBy: ctx.userId,
        })),
      );

      return { success: true, approved: rows.length, candidateCount: rows.length };
    }),
});
