import { z } from "zod";
import { eq, and, desc, count, sql, inArray } from "drizzle-orm";
import {
  portalDocuments,
  exams,
  scrapeSources,
  scrapeRuns,
  questions,
  stagedQuestions,
  syllabi,
  syllabusNodes,
} from "@examforge/shared/db/schema";
import {
  ingestPortalSchema,
  ingestDirectPdfSchema,
  portalDocumentFilterSchema,
  processDocumentsSchema,
  approveQuestionsSchema,
  rejectQuestionsSchema,
  mapExamSchema,
  stagedQuestionFilterSchema,
} from "@examforge/shared/validators";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure, publicProcedure } from "../trpc.js";
import { addPortalIngestionJob } from "../../queues/portal-ingestion-queue.js";
import {
  addProcessDocumentJob,
  addProcessDocumentJobs,
} from "../../queues/portal-processing-queue.js";
import { addSyllabusJob } from "../../queues/syllabus-queue.js";
import { addClassifyPaperJob } from "../../queues/pattern-analysis-queue.js";

export const portalIngestionRouter = router({
  // ────────────────────────────────────────────────────
  // Discovery (Phase 1)
  // ────────────────────────────────────────────────────

  /** Trigger portal discovery — crawl page + save document records (no processing) */
  ingestPortal: adminProcedure.input(ingestPortalSchema).mutation(async ({ ctx, input }) => {
    const [source] = await ctx.db
      .insert(scrapeSources)
      .values({
        name: `${input.portalName} - ${input.pageType}`,
        url: input.url,
        sourceType: "portal",
        status: "active",
        examId: input.examId ?? null,
        orgId: ctx.orgId ?? "",
      })
      .returning({ id: scrapeSources.id });

    const [run] = await ctx.db
      .insert(scrapeRuns)
      .values({
        sourceId: source!.id,
        status: "queued",
        aiProvider: "auto",
      })
      .returning({ id: scrapeRuns.id });

    try {
      const jobId = await addPortalIngestionJob({
        url: input.url,
        portalName: input.portalName,
        pageType: input.pageType,
        examId: input.examId,
        runId: run!.id,
        userId: ctx.userId,
      });

      return { runId: run!.id, jobId, sourceId: source!.id };
    } catch (err) {
      await ctx.db
        .update(scrapeRuns)
        .set({ status: "failed", completedAt: new Date() })
        .where(eq(scrapeRuns.id, run!.id));

      const errMsg = err instanceof Error ? err.message : String(err);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to queue ingestion job: ${errMsg}. Is Redis running?`,
      });
    }
  }),

  /**
   * One-shot ingestion of a single direct-PDF URL (bypasses portal
   * discovery). Creates ONE portal_documents row in 'discovered'
   * status and immediately queues it for processing.
   *
   * Use case: Kerala PSC Asst. Prof. Pharmacy answer-key PDFs are
   * only linked from post-slug pages, not from the generic
   * /previous-question-papers listing. The admin pastes the PDF URL
   * directly, picks the target canonical exam, optionally marks it
   * as an official answer key, and skips the discovery step.
   */
  ingestDirectPdf: adminProcedure.input(ingestDirectPdfSchema).mutation(async ({ ctx, input }) => {
    // Verify target exam exists so we fail fast with a clear error.
    const [exam] = await ctx.db
      .select({ id: exams.id, name: exams.name })
      .from(exams)
      .where(eq(exams.id, input.examId))
      .limit(1);
    if (!exam) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Exam not found" });
    }

    // Create the portal_documents row directly in 'discovered' state.
    // Trust hints live on metadata so portal-processing-worker can
    // read them and pass them to the PDF processor.
    const [doc] = await ctx.db
      .insert(portalDocuments)
      .values({
        portalName: input.portalName,
        portalUrl: input.pdfUrl,
        sourcePageType: "previous_questions",
        documentType: input.documentType,
        title: input.title,
        examName: input.examName ?? exam.name,
        examYear: input.examYear ?? null,
        originalUrl: input.pdfUrl,
        processingStatus: "discovered",
        examId: input.examId,
        metadata: {
          extractedFrom: "direct_upload",
          isOfficialAnswerKey: input.isOfficialAnswerKey,
          paperNumber: input.paperNumber ?? null,
        },
      })
      .returning({ id: portalDocuments.id });

    if (!doc) {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create portal document row",
      });
    }

    // Queue processing immediately — no discovery step needed.
    try {
      const jobId = await addProcessDocumentJob({
        documentId: doc.id,
        userId: ctx.userId,
        orgId: ctx.orgId ?? "",
      });

      await ctx.db
        .update(portalDocuments)
        .set({ processingStatus: "downloading", updatedAt: new Date() })
        .where(eq(portalDocuments.id, doc.id));

      return { documentId: doc.id, jobId };
    } catch (err) {
      await ctx.db
        .update(portalDocuments)
        .set({
          processingStatus: "error",
          errorMessage: err instanceof Error ? err.message : String(err),
          updatedAt: new Date(),
        })
        .where(eq(portalDocuments.id, doc.id));
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Failed to queue processing job: ${err instanceof Error ? err.message : String(err)}. Is Redis running?`,
      });
    }
  }),

  // ────────────────────────────────────────────────────
  // Processing (Phase 2 — Admin triggered)
  // ────────────────────────────────────────────────────

  /** Queue processing for selected document IDs */
  processDocuments: adminProcedure
    .input(processDocumentsSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify all documents exist and are in "discovered" status
      const docs = await ctx.db
        .select({ id: portalDocuments.id, processingStatus: portalDocuments.processingStatus })
        .from(portalDocuments)
        .where(inArray(portalDocuments.id, input.documentIds));

      const discoveredDocs = docs.filter((d) => d.processingStatus === "discovered");

      if (discoveredDocs.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No documents in 'discovered' status to process",
        });
      }

      const jobIds = await addProcessDocumentJobs(
        discoveredDocs.map((d) => ({
          documentId: d.id,
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
        })),
      );

      // Mark them as queued
      await ctx.db
        .update(portalDocuments)
        .set({ processingStatus: "downloading", updatedAt: new Date() })
        .where(
          inArray(
            portalDocuments.id,
            discoveredDocs.map((d) => d.id),
          ),
        );

      return { queued: discoveredDocs.length, jobIds };
    }),

  /** Queue all discovered documents matching a page type */
  processAllByPageType: adminProcedure
    .input(
      z.object({
        sourcePageType: z.string(),
        portalName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const conditions = [
        eq(portalDocuments.processingStatus, "discovered"),
        eq(portalDocuments.sourcePageType, input.sourcePageType),
      ];

      if (input.portalName) {
        conditions.push(eq(portalDocuments.portalName, input.portalName));
      }

      const docs = await ctx.db
        .select({ id: portalDocuments.id })
        .from(portalDocuments)
        .where(and(...conditions));

      if (docs.length === 0) {
        return { queued: 0, jobIds: [] };
      }

      const jobIds = await addProcessDocumentJobs(
        docs.map((d) => ({
          documentId: d.id,
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
        })),
      );

      await ctx.db
        .update(portalDocuments)
        .set({ processingStatus: "downloading", updatedAt: new Date() })
        .where(
          inArray(
            portalDocuments.id,
            docs.map((d) => d.id),
          ),
        );

      return { queued: docs.length, jobIds };
    }),

  // ────────────────────────────────────────────────────
  // Staged Questions (Review)
  // ────────────────────────────────────────────────────

  /** List staged questions with filters + pagination */
  getStagedQuestions: adminProcedure
    .input(stagedQuestionFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const conditions = [];

      if (input?.portalDocumentId) {
        conditions.push(eq(stagedQuestions.portalDocumentId, input.portalDocumentId));
      }
      if (input?.examId) {
        conditions.push(eq(stagedQuestions.examId, input.examId));
      }
      if (input?.reviewStatus) {
        conditions.push(eq(stagedQuestions.reviewStatus, input.reviewStatus));
      }

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 50;
      const offset = (page - 1) * limit;
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: stagedQuestions.id,
            portalDocumentId: stagedQuestions.portalDocumentId,
            examId: stagedQuestions.examId,
            suggestedExamName: stagedQuestions.suggestedExamName,
            type: stagedQuestions.type,
            content: stagedQuestions.content,
            subject: stagedQuestions.subject,
            difficulty: stagedQuestions.difficulty,
            paperYear: stagedQuestions.paperYear,
            questionNumber: stagedQuestions.questionNumber,
            reviewStatus: stagedQuestions.reviewStatus,
            createdAt: stagedQuestions.createdAt,
          })
          .from(stagedQuestions)
          .where(whereClause)
          .orderBy(stagedQuestions.questionNumber)
          .limit(limit)
          .offset(offset),

        ctx.db.select({ count: count() }).from(stagedQuestions).where(whereClause),
      ]);

      return {
        questions: rows,
        total: totalResult[0]?.count ?? 0,
        page,
        limit,
      };
    }),

  /** Approve staged questions → move to main questions table */
  approveQuestions: adminProcedure
    .input(approveQuestionsSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify exam exists
      const [exam] = await ctx.db
        .select({ id: exams.id })
        .from(exams)
        .where(eq(exams.id, input.examId))
        .limit(1);

      if (!exam) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Exam not found" });
      }

      // Get all staged questions
      const staged = await ctx.db
        .select()
        .from(stagedQuestions)
        .where(
          and(
            inArray(stagedQuestions.id, input.stagedQuestionIds),
            eq(stagedQuestions.reviewStatus, "pending"),
          ),
        );

      if (staged.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "No pending staged questions found for the given IDs",
        });
      }

      let approved = 0;

      for (const sq of staged) {
        // Trust metadata stashed by the PDF processor lives on
        // staged_questions.metadata (no dedicated columns yet). Promote
        // it into real questions.sourceType / answerSource columns here
        // so the verification pipeline and topic-seed filter see it.
        const stagedMeta = (sq.metadata as Record<string, unknown>) ?? {};
        const promotedSourceType = (stagedMeta.sourceType as string | undefined) ?? "real_paper";
        const promotedAnswerSource =
          (stagedMeta.answerSource as string | undefined) ?? "unverified";

        // Insert into main questions table
        const [newQuestion] = await ctx.db
          .insert(questions)
          .values({
            examId: input.examId,
            type: "mcq",
            content: sq.content,
            subject: sq.subject ?? "General",
            difficulty: (sq.difficulty as "easy" | "medium" | "hard") ?? "medium",
            source: sq.source,
            portalDocumentId: sq.portalDocumentId,
            paperYear: sq.paperYear,
            paperNumber: sq.paperNumber,
            questionNumber: sq.questionNumber,
            sourceType: promotedSourceType,
            answerSource: promotedAnswerSource,
            sourceDetail: {
              kind: "real_paper",
              documentId: sq.portalDocumentId,
              paperYear: sq.paperYear,
              paperNumber: sq.paperNumber,
              isOfficialAnswerKey: promotedAnswerSource === "official_key",
            },
            metadata: { ...stagedMeta, approvedFrom: "staging" },
          })
          .returning({ id: questions.id });

        // Update staged question
        await ctx.db
          .update(stagedQuestions)
          .set({
            reviewStatus: "approved",
            reviewedBy: ctx.userId,
            reviewedAt: new Date(),
            approvedQuestionId: newQuestion!.id,
            examId: input.examId,
            updatedAt: new Date(),
          })
          .where(eq(stagedQuestions.id, sq.id));

        approved++;
      }

      // After promotion, queue pattern classification for each
      // distinct source document. This is the right moment — it used
      // to run from portal-processing-worker but that fired before
      // staged rows were promoted, so classification always found
      // zero questions. Collecting distinct documentIds avoids
      // double-classifying when an admin approves across multiple
      // docs in one call.
      const docIds = new Set(
        staged.map((sq) => sq.portalDocumentId).filter((id): id is string => Boolean(id)),
      );
      for (const docId of docIds) {
        try {
          await addClassifyPaperJob({
            examId: input.examId,
            portalDocumentId: docId,
            userId: ctx.userId,
            orgId: ctx.orgId ?? "",
          });
        } catch (err) {
          // Non-fatal — admin can re-trigger classification manually.
          console.warn(
            `[portal-ingestion] Failed to queue classification for doc ${docId}:`,
            err instanceof Error ? err.message : err,
          );
        }
      }

      return { approved };
    }),

  /**
   * Approve every pending staged question for a given portal document
   * in one call. Intended for the common case where an admin trusts a
   * whole ingested paper (e.g. an official answer-key PDF they just
   * uploaded) and doesn't want to pick questions one-by-one.
   *
   * Same logic as `approveQuestions` but driven by documentId — the
   * stagedQuestionIds are resolved server-side.
   */
  bulkApproveByDocument: adminProcedure
    .input(
      z.object({
        portalDocumentId: z.string().uuid(),
        examId: z.string().uuid(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [exam] = await ctx.db
        .select({ id: exams.id })
        .from(exams)
        .where(eq(exams.id, input.examId))
        .limit(1);
      if (!exam) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Exam not found" });
      }

      const staged = await ctx.db
        .select()
        .from(stagedQuestions)
        .where(
          and(
            eq(stagedQuestions.portalDocumentId, input.portalDocumentId),
            eq(stagedQuestions.reviewStatus, "pending"),
          ),
        );

      if (staged.length === 0) {
        return { approved: 0, classificationQueued: false };
      }

      let approved = 0;
      for (const sq of staged) {
        const stagedMeta = (sq.metadata as Record<string, unknown>) ?? {};
        const promotedSourceType = (stagedMeta.sourceType as string | undefined) ?? "real_paper";
        const promotedAnswerSource =
          (stagedMeta.answerSource as string | undefined) ?? "unverified";

        const [newQuestion] = await ctx.db
          .insert(questions)
          .values({
            examId: input.examId,
            type: "mcq",
            content: sq.content,
            subject: sq.subject ?? "General",
            difficulty: (sq.difficulty as "easy" | "medium" | "hard") ?? "medium",
            source: sq.source,
            portalDocumentId: sq.portalDocumentId,
            paperYear: sq.paperYear,
            paperNumber: sq.paperNumber,
            questionNumber: sq.questionNumber,
            sourceType: promotedSourceType,
            answerSource: promotedAnswerSource,
            sourceDetail: {
              kind: "real_paper",
              documentId: sq.portalDocumentId,
              paperYear: sq.paperYear,
              paperNumber: sq.paperNumber,
              isOfficialAnswerKey: promotedAnswerSource === "official_key",
            },
            metadata: { ...stagedMeta, approvedFrom: "staging_bulk" },
          })
          .returning({ id: questions.id });

        await ctx.db
          .update(stagedQuestions)
          .set({
            reviewStatus: "approved",
            reviewedBy: ctx.userId,
            reviewedAt: new Date(),
            approvedQuestionId: newQuestion!.id,
            examId: input.examId,
            updatedAt: new Date(),
          })
          .where(eq(stagedQuestions.id, sq.id));

        approved++;
      }

      let classificationQueued = false;
      try {
        await addClassifyPaperJob({
          examId: input.examId,
          portalDocumentId: input.portalDocumentId,
          userId: ctx.userId,
          orgId: ctx.orgId ?? "",
        });
        classificationQueued = true;
      } catch (err) {
        console.warn(
          `[portal-ingestion] Failed to queue classification for doc ${input.portalDocumentId}:`,
          err instanceof Error ? err.message : err,
        );
      }

      return { approved, classificationQueued };
    }),

  /** Reject staged questions */
  rejectQuestions: adminProcedure.input(rejectQuestionsSchema).mutation(async ({ ctx, input }) => {
    await ctx.db
      .update(stagedQuestions)
      .set({
        reviewStatus: "rejected",
        reviewedBy: ctx.userId,
        reviewedAt: new Date(),
        rejectionReason: input.reason ?? null,
        updatedAt: new Date(),
      })
      .where(
        and(
          inArray(stagedQuestions.id, input.stagedQuestionIds),
          eq(stagedQuestions.reviewStatus, "pending"),
        ),
      );

    return { rejected: input.stagedQuestionIds.length };
  }),

  // ────────────────────────────────────────────────────
  // Exam Mapping
  // ────────────────────────────────────────────────────

  /** Map a portal document to an existing exam or create a new one */
  mapDocumentExam: adminProcedure.input(mapExamSchema).mutation(async ({ ctx, input }) => {
    let examId: string;

    if (input.examId) {
      // Map to existing exam
      const [exam] = await ctx.db
        .select({ id: exams.id })
        .from(exams)
        .where(eq(exams.id, input.examId))
        .limit(1);

      if (!exam) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Exam not found" });
      }
      examId = exam.id;
    } else if (input.createExam) {
      // Create a new exam
      const [newExam] = await ctx.db
        .insert(exams)
        .values({
          name: input.createExam.name,
          conductingBody: input.createExam.conductingBody,
          category: input.createExam.category,
          status: "active",
          orgId: ctx.orgId ?? "",
        })
        .returning({ id: exams.id });

      examId = newExam!.id;
    } else {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Must provide either examId or createExam",
      });
    }

    // Update portal document
    await ctx.db
      .update(portalDocuments)
      .set({ examId, updatedAt: new Date() })
      .where(eq(portalDocuments.id, input.documentId));

    // Update all staged questions for this document
    await ctx.db
      .update(stagedQuestions)
      .set({ examId, updatedAt: new Date() })
      .where(eq(stagedQuestions.portalDocumentId, input.documentId));

    return { examId };
  }),

  // ────────────────────────────────────────────────────
  // Document Queries
  // ────────────────────────────────────────────────────

  /** List portal documents with filters + pagination (supports sourcePageType tab filter) */
  getPortalDocuments: adminProcedure
    .input(portalDocumentFilterSchema.optional())
    .query(async ({ ctx, input }) => {
      const conditions = [];

      if (input?.portalName) {
        conditions.push(eq(portalDocuments.portalName, input.portalName));
      }
      if (input?.documentType) {
        conditions.push(eq(portalDocuments.documentType, input.documentType));
      }
      if (input?.processingStatus) {
        conditions.push(eq(portalDocuments.processingStatus, input.processingStatus));
      }
      if (input?.sourcePageType) {
        conditions.push(eq(portalDocuments.sourcePageType, input.sourcePageType));
      }
      if (input?.examId) {
        conditions.push(eq(portalDocuments.examId, input.examId));
      }

      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: portalDocuments.id,
            portalName: portalDocuments.portalName,
            sourcePageType: portalDocuments.sourcePageType,
            documentType: portalDocuments.documentType,
            title: portalDocuments.title,
            examName: portalDocuments.examName,
            examYear: portalDocuments.examYear,
            processingStatus: portalDocuments.processingStatus,
            questionsExtracted: portalDocuments.questionsExtracted,
            answersMatched: portalDocuments.answersMatched,
            originalUrl: portalDocuments.originalUrl,
            fileSizeBytes: portalDocuments.fileSizeBytes,
            errorMessage: portalDocuments.errorMessage,
            createdAt: portalDocuments.createdAt,
            examId: portalDocuments.examId,
            linkedExamName: exams.name,
          })
          .from(portalDocuments)
          .leftJoin(exams, eq(portalDocuments.examId, exams.id))
          .where(whereClause)
          .orderBy(desc(portalDocuments.createdAt))
          .limit(limit)
          .offset(offset),

        ctx.db.select({ count: count() }).from(portalDocuments).where(whereClause),
      ]);

      return {
        documents: rows,
        total: totalResult[0]?.count ?? 0,
        page,
        limit,
      };
    }),

  /** Get a single portal document with staged question counts */
  getPortalDocumentById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [doc] = await ctx.db
        .select()
        .from(portalDocuments)
        .where(eq(portalDocuments.id, input.id))
        .limit(1);

      if (!doc) return null;

      // Count linked questions (live)
      const [qCount] = await ctx.db
        .select({ count: count() })
        .from(questions)
        .where(eq(questions.portalDocumentId, input.id));

      // Count staged questions by status
      const stagedCounts = await ctx.db
        .select({
          reviewStatus: stagedQuestions.reviewStatus,
          count: count(),
        })
        .from(stagedQuestions)
        .where(eq(stagedQuestions.portalDocumentId, input.id))
        .groupBy(stagedQuestions.reviewStatus);

      const stagedByStatus: Record<string, number> = {};
      for (const row of stagedCounts) {
        stagedByStatus[row.reviewStatus] = Number(row.count);
      }

      return {
        ...doc,
        linkedQuestionsCount: qCount?.count ?? 0,
        stagedCounts: stagedByStatus,
      };
    }),

  /** Re-process a document (resets to discovered, queues processing) */
  reprocessDocument: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [doc] = await ctx.db
        .select({ id: portalDocuments.id, originalUrl: portalDocuments.originalUrl })
        .from(portalDocuments)
        .where(eq(portalDocuments.id, input.id))
        .limit(1);

      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found" });
      }

      // Reset status
      await ctx.db
        .update(portalDocuments)
        .set({
          processingStatus: "discovered",
          questionsExtracted: 0,
          answersMatched: 0,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(portalDocuments.id, input.id));

      // Queue processing
      const jobId = await addProcessDocumentJob({
        documentId: doc.id,
        userId: ctx.userId,
        orgId: ctx.orgId ?? "",
      });

      return { jobId };
    }),

  /** Get ingestion run status (for polling) */
  getRunStatus: adminProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(scrapeRuns)
        .where(eq(scrapeRuns.id, input.runId))
        .limit(1);

      return run ?? null;
    }),

  /** Aggregate stats for portal ingestion dashboard */
  getStats: adminProcedure.query(async ({ ctx }) => {
    const [totalDocs] = await ctx.db.select({ count: count() }).from(portalDocuments);

    const [discoveredDocs] = await ctx.db
      .select({ count: count() })
      .from(portalDocuments)
      .where(eq(portalDocuments.processingStatus, "discovered"));

    const [processedDocs] = await ctx.db
      .select({ count: count() })
      .from(portalDocuments)
      .where(eq(portalDocuments.processingStatus, "processed"));

    const [errorDocs] = await ctx.db
      .select({ count: count() })
      .from(portalDocuments)
      .where(eq(portalDocuments.processingStatus, "error"));

    const [pendingStaged] = await ctx.db
      .select({ count: count() })
      .from(stagedQuestions)
      .where(eq(stagedQuestions.reviewStatus, "pending"));

    const [approvedStaged] = await ctx.db
      .select({ count: count() })
      .from(stagedQuestions)
      .where(eq(stagedQuestions.reviewStatus, "approved"));

    return {
      totalDocuments: totalDocs?.count ?? 0,
      discoveredDocuments: discoveredDocs?.count ?? 0,
      processedDocuments: processedDocs?.count ?? 0,
      errorDocuments: errorDocs?.count ?? 0,
      pendingReview: pendingStaged?.count ?? 0,
      approvedQuestions: approvedStaged?.count ?? 0,
    };
  }),

  /** Clear portal documents and staged questions — optionally scoped to a page type */
  clearData: adminProcedure
    .input(z.object({ sourcePageType: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const pageType = input?.sourcePageType;

      if (pageType) {
        // Scoped clear: only documents matching the page type
        const docsToDelete = await ctx.db
          .select({ id: portalDocuments.id })
          .from(portalDocuments)
          .where(eq(portalDocuments.sourcePageType, pageType));

        const docIds = docsToDelete.map((d) => d.id);

        if (docIds.length > 0) {
          // Delete staged questions linked to these documents first
          await ctx.db
            .delete(stagedQuestions)
            .where(inArray(stagedQuestions.portalDocumentId, docIds));

          // Delete the documents
          await ctx.db.delete(portalDocuments).where(inArray(portalDocuments.id, docIds));
        }

        return {
          deletedDocuments: docIds.length,
          deletedStagedQuestions: docIds.length > 0 ? docIds.length : 0,
          scope: pageType,
        };
      }

      // Global clear: delete everything
      const [deletedStaged] = await ctx.db.select({ count: count() }).from(stagedQuestions);
      await ctx.db.delete(stagedQuestions);

      const [deletedDocs] = await ctx.db.select({ count: count() }).from(portalDocuments);
      await ctx.db.delete(portalDocuments);

      return {
        deletedDocuments: deletedDocs?.count ?? 0,
        deletedStagedQuestions: deletedStaged?.count ?? 0,
        scope: "all",
      };
    }),

  /** Parse a syllabus PDF from URL (for examination entries with syllabus links) */
  parseSyllabusFromUrl: adminProcedure
    .input(
      z.object({
        syllabusUrl: z.string().min(1),
        examName: z.string().min(1),
        categoryNumber: z.string().optional(),
        portalDocumentId: z.string().uuid(),
        examId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get portal document info for URL resolution
      const [portalDoc] = await ctx.db
        .select({ portalUrl: portalDocuments.portalUrl })
        .from(portalDocuments)
        .where(eq(portalDocuments.id, input.portalDocumentId))
        .limit(1);

      const portalOrigin = portalDoc?.portalUrl
        ? new URL(portalDoc.portalUrl).origin
        : "https://www.keralapsc.gov.in";

      // Build candidate URLs to try (in priority order)
      const candidateUrls = buildCandidateUrls(
        input.syllabusUrl,
        input.examName,
        portalOrigin,
        portalDoc?.portalUrl,
      );

      // Try each candidate URL until one returns a valid PDF
      let pdfBuffer: Buffer | null = null;
      let resolvedUrl = candidateUrls[0] ?? input.syllabusUrl;
      let contentType = "application/pdf";

      for (const candidateUrl of candidateUrls) {
        try {
          const response = await fetch(candidateUrl, {
            signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) continue;

          const buffer = Buffer.from(await response.arrayBuffer());
          const header = buffer.subarray(0, 20).toString("utf-8");

          // Direct PDF — use it
          if (header.startsWith("%PDF")) {
            pdfBuffer = buffer;
            resolvedUrl = candidateUrl;
            contentType = response.headers.get("content-type") ?? "application/pdf";
            break;
          }

          // HTML page — try to extract PDF link from it
          if (
            header.startsWith("<!DOCTYPE") ||
            header.startsWith("<html") ||
            header.startsWith("<HTML")
          ) {
            const htmlContent = buffer.toString("utf-8");
            const pdfLink = extractPdfLinkFromHtml(htmlContent, input.examName, portalOrigin);
            if (pdfLink) {
              const pdfResponse = await fetch(pdfLink, {
                signal: AbortSignal.timeout(15000),
              });
              if (pdfResponse.ok) {
                const pdfBuf = Buffer.from(await pdfResponse.arrayBuffer());
                if (pdfBuf.subarray(0, 5).toString("utf-8").startsWith("%PDF")) {
                  pdfBuffer = pdfBuf;
                  resolvedUrl = pdfLink;
                  contentType = pdfResponse.headers.get("content-type") ?? "application/pdf";
                  break;
                }
              }
            }
          }
        } catch {
          // Timeout or network error — try next candidate
          continue;
        }
      }

      // If no PDF found from candidate URLs, try the syllabus listing page
      if (!pdfBuffer) {
        const listingPdfUrl = await findSyllabusFromListingPage(input.examName, portalOrigin);
        if (listingPdfUrl) {
          try {
            const pdfResponse = await fetch(listingPdfUrl, {
              signal: AbortSignal.timeout(15000),
            });
            if (pdfResponse.ok) {
              const pdfBuf = Buffer.from(await pdfResponse.arrayBuffer());
              if (pdfBuf.subarray(0, 5).toString("utf-8").startsWith("%PDF")) {
                pdfBuffer = pdfBuf;
                resolvedUrl = listingPdfUrl;
                contentType = pdfResponse.headers.get("content-type") ?? "application/pdf";
              }
            }
          } catch {
            // Listing page PDF download failed
          }
        }
      }

      if (!pdfBuffer) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Could not find a valid syllabus PDF for "${input.examName}". Tried ${candidateUrls.length} direct URL(s) and the syllabus listing page. The syllabus may not be available on the portal.`,
        });
      }

      const fileSizeBytes = pdfBuffer.length;

      // 2. Save PDF locally to fileKey path
      const { promises: fs } = await import("node:fs");
      const { join } = await import("node:path");
      const { randomUUID } = await import("node:crypto");

      const storageDir = join(process.cwd(), "storage", "syllabi");
      await fs.mkdir(storageDir, { recursive: true });
      const fileId = randomUUID();
      const fileName = `${fileId}.pdf`;
      const filePath = join(storageDir, fileName);
      await fs.writeFile(filePath, pdfBuffer);

      const fileKey = `syllabi/${fileName}`;
      const fileUrl = `/api/files/${fileKey}`;

      // 3. Find or create an exam mapping
      let examId = input.examId;
      if (!examId) {
        // Try to find matching exam by name
        const searchTerms = input.examName.split(" ").slice(0, 3).join(" ");
        const [match] = await ctx.db
          .select({ id: exams.id })
          .from(exams)
          .where(sql`${exams.name} ILIKE ${"%" + searchTerms + "%"}`)
          .limit(1);
        examId = match?.id;
      }

      if (!examId) {
        // Auto-create exam from examination entry data
        // Determine conducting body from portal document
        const [portalDoc] = await ctx.db
          .select({
            portalName: portalDocuments.portalName,
            examCategory: portalDocuments.examCategory,
          })
          .from(portalDocuments)
          .where(eq(portalDocuments.id, input.portalDocumentId))
          .limit(1);

        const [newExam] = await ctx.db
          .insert(exams)
          .values({
            name: input.examName,
            category: portalDoc?.examCategory ?? "Government Exam",
            conductingBody: portalDoc?.portalName ?? "Unknown",
            status: "draft",
            isAutoDiscovered: true,
            discoverySource: "portal-syllabus-parse",
            orgId: ctx.orgId,
          })
          .returning({ id: exams.id });

        examId = newExam?.id;

        if (!examId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to auto-create exam record",
          });
        }
      }

      // 4. Create syllabi record
      const [syllabus] = await ctx.db
        .insert(syllabi)
        .values({
          examId,
          orgId: ctx.orgId,
          name: `${input.examName} - Syllabus`,
          fileKey,
          fileUrl,
          fileSizeBytes,
          mimeType: contentType,
          status: "uploaded",
          metadata: {
            sourceUrl: resolvedUrl,
            portalDocumentId: input.portalDocumentId,
          },
        })
        .returning({ id: syllabi.id });

      if (!syllabus) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create syllabus record",
        });
      }

      // 5. Queue syllabus processing job
      const jobId = await addSyllabusJob({
        syllabusId: syllabus.id,
        examId,
        fileKey,
        userId: ctx.userId,
        examName: input.examName,
      });

      // 6. Update the portal document metadata with syllabus link info
      const [doc] = await ctx.db
        .select({ metadata: portalDocuments.metadata })
        .from(portalDocuments)
        .where(eq(portalDocuments.id, input.portalDocumentId))
        .limit(1);

      if (doc?.metadata) {
        const meta = doc.metadata as Record<string, unknown>;
        const syllabusLinks = (meta.syllabusLinks as Record<string, unknown>[] | undefined) ?? [];
        syllabusLinks.push({
          url: input.syllabusUrl,
          entryKey: `${input.examName}::${input.categoryNumber ?? ""}`,
          syllabusId: syllabus.id,
          examName: input.examName,
          status: "processing",
        });
        await ctx.db
          .update(portalDocuments)
          .set({
            metadata: { ...meta, syllabusLinks },
            updatedAt: new Date(),
          })
          .where(eq(portalDocuments.id, input.portalDocumentId));
      }

      return {
        syllabusId: syllabus.id,
        jobId,
        fileUrl,
        fileKey,
      };
    }),

  /** Get syllabus data for an exam (parsed nodes tree) */
  getSyllabusData: adminProcedure
    .input(z.object({ syllabusId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const [syllabus] = await ctx.db
        .select()
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);

      if (!syllabus) return null;

      const nodes = await ctx.db
        .select()
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, input.syllabusId))
        .orderBy(syllabusNodes.depth, syllabusNodes.sortOrder);

      return {
        ...syllabus,
        nodes,
      };
    }),

  /** Re-parse a syllabus (re-queue the processing job) */
  reparseSyllabus: adminProcedure
    .input(z.object({ syllabusId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [syllabus] = await ctx.db
        .select({
          id: syllabi.id,
          examId: syllabi.examId,
          fileKey: syllabi.fileKey,
          name: syllabi.name,
        })
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);

      if (!syllabus) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Syllabus not found" });
      }

      // Reset status
      await ctx.db
        .update(syllabi)
        .set({
          status: "uploaded",
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(syllabi.id, input.syllabusId));

      // Re-queue processing
      const jobId = await addSyllabusJob({
        syllabusId: syllabus.id,
        examId: syllabus.examId,
        fileKey: syllabus.fileKey,
        userId: ctx.userId,
        examName: syllabus.name.replace(/ - Syllabus$/, ""),
      });

      return { jobId };
    }),

  // ─── Public Endpoints (for student-facing pages) ───

  /** List processed examination schedule documents (public) */
  listExaminationDocuments: publicProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(50).default(20),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const page = input?.page ?? 1;
      const limit = input?.limit ?? 20;
      const offset = (page - 1) * limit;

      const conditions = [
        eq(portalDocuments.documentType, "examination_schedule"),
        eq(portalDocuments.processingStatus, "processed"),
      ];

      const docs = await ctx.db
        .select({
          id: portalDocuments.id,
          title: portalDocuments.title,
          examName: portalDocuments.examName,
          examCategory: portalDocuments.examCategory,
          portalName: portalDocuments.portalName,
          metadata: portalDocuments.metadata,
          createdAt: portalDocuments.createdAt,
        })
        .from(portalDocuments)
        .where(and(...conditions))
        .orderBy(desc(portalDocuments.createdAt))
        .limit(limit)
        .offset(offset);

      const [totalRow] = await ctx.db
        .select({ count: count() })
        .from(portalDocuments)
        .where(and(...conditions));

      return {
        documents: docs,
        total: Number(totalRow?.count ?? 0),
        page,
        limit,
      };
    }),

  /** Get examination entries from a specific document (public, read-only) */
  getExaminationEntries: publicProcedure
    .input(
      z.object({
        documentId: z.string().uuid(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const [doc] = await ctx.db
        .select({
          id: portalDocuments.id,
          title: portalDocuments.title,
          examName: portalDocuments.examName,
          examCategory: portalDocuments.examCategory,
          portalName: portalDocuments.portalName,
          metadata: portalDocuments.metadata,
          createdAt: portalDocuments.createdAt,
        })
        .from(portalDocuments)
        .where(
          and(
            eq(portalDocuments.id, input.documentId),
            eq(portalDocuments.documentType, "examination_schedule"),
            eq(portalDocuments.processingStatus, "processed"),
          ),
        )
        .limit(1);

      if (!doc) return null;

      type ExamEntry = {
        examName: string;
        postName?: string;
        categoryNumber?: string;
        examDate?: string;
        examTime?: string;
        venue?: string;
        department?: string;
        stage?: string;
        status?: string;
        remarks?: string;
        syllabusUrl?: string;
      };

      const meta = doc.metadata as {
        type?: string;
        examinations?: ExamEntry[];
        syllabusLinks?: Array<{
          url: string;
          entryKey: string;
          syllabusId: number;
          examName: string;
          status: string;
        }>;
      } | null;
      let examinations = meta?.examinations ?? [];
      const syllabusLinks = meta?.syllabusLinks ?? [];

      // Filter by search term
      if (input.search) {
        const term = input.search.toLowerCase();
        examinations = examinations.filter(
          (e) =>
            e.examName.toLowerCase().includes(term) ||
            e.postName?.toLowerCase().includes(term) ||
            e.categoryNumber?.toLowerCase().includes(term) ||
            e.department?.toLowerCase().includes(term),
        );
      }

      return {
        document: doc,
        examinations,
        syllabusLinks,
        total: examinations.length,
      };
    }),

  /** Get syllabus data (public, read-only) */
  getPublicSyllabusData: publicProcedure
    .input(z.object({ syllabusId: z.number().int() }))
    .query(async ({ ctx, input }) => {
      const [syllabus] = await ctx.db
        .select()
        .from(syllabi)
        .where(eq(syllabi.id, input.syllabusId))
        .limit(1);

      if (!syllabus) return null;

      const nodes = await ctx.db
        .select({
          id: syllabusNodes.id,
          title: syllabusNodes.title,
          nodeType: syllabusNodes.nodeType,
          depth: syllabusNodes.depth,
          parentId: syllabusNodes.parentId,
          description: syllabusNodes.description,
          content: syllabusNodes.content,
          sortOrder: syllabusNodes.sortOrder,
        })
        .from(syllabusNodes)
        .where(eq(syllabusNodes.syllabusId, input.syllabusId))
        .orderBy(syllabusNodes.sortOrder);

      return {
        status: syllabus.status,
        extractionMethod: syllabus.extractionMethod,
        fileUrl: syllabus.fileUrl,
        nodes,
      };
    }),

  /** Aggregate all examination entries across all processed documents (for dropdowns) */
  listAllExaminations: publicProcedure
    .input(z.object({ search: z.string().max(200).optional() }).optional())
    .query(async ({ ctx, input }) => {
      const search = input?.search;

      // Fetch all processed examination_schedule documents
      const docs = await ctx.db
        .select({
          id: portalDocuments.id,
          title: portalDocuments.title,
          portalName: portalDocuments.portalName,
          examCategory: portalDocuments.examCategory,
          metadata: portalDocuments.metadata,
          createdAt: portalDocuments.createdAt,
        })
        .from(portalDocuments)
        .where(
          and(
            eq(portalDocuments.documentType, "examination_schedule"),
            eq(portalDocuments.processingStatus, "processed"),
          ),
        )
        .orderBy(desc(portalDocuments.createdAt));

      type ExamEntry = {
        examName: string;
        postName?: string;
        categoryNumber?: string;
        examDate?: string;
        examTime?: string;
        venue?: string;
        department?: string;
        stage?: string;
        status?: string;
        remarks?: string;
        syllabusUrl?: string;
      };

      // Aggregate all examination entries with document context
      const allEntries: Array<{
        id: string;
        examName: string;
        postName: string | null;
        categoryNumber: string | null;
        examDate: string | null;
        examTime: string | null;
        venue: string | null;
        department: string | null;
        stage: string | null;
        syllabusUrl: string | null;
        documentId: string;
        documentTitle: string | null;
        portalName: string | null;
        examCategory: string | null;
        hasSyllabus: boolean;
      }> = [];

      for (const doc of docs) {
        const meta = doc.metadata as {
          examinations?: ExamEntry[];
          syllabusLinks?: Array<{ entryKey: string; syllabusId: number; status: string }>;
        } | null;

        const examinations = meta?.examinations ?? [];
        const syllabusLinks = meta?.syllabusLinks ?? [];

        for (const entry of examinations) {
          const entryKey = `${entry.examName}::${entry.categoryNumber ?? ""}`;
          const hasSyllabus = syllabusLinks.some(
            (s) => s.entryKey === entryKey && s.status !== "error",
          );

          // Generate a stable ID from document + exam name + category
          const id = `${doc.id}::${entry.categoryNumber ?? ""}::${entry.examName}`;

          allEntries.push({
            id,
            examName: entry.examName,
            postName: entry.postName ?? null,
            categoryNumber: entry.categoryNumber ?? null,
            examDate: entry.examDate ?? null,
            examTime: entry.examTime ?? null,
            venue: entry.venue ?? null,
            department: entry.department ?? null,
            stage: entry.stage ?? null,
            syllabusUrl: entry.syllabusUrl ?? null,
            documentId: doc.id,
            documentTitle: doc.title,
            portalName: doc.portalName,
            examCategory: doc.examCategory,
            hasSyllabus,
          });
        }
      }

      // Filter by search term if provided
      if (search) {
        const term = search.toLowerCase();
        return allEntries.filter(
          (e) =>
            e.examName.toLowerCase().includes(term) ||
            e.postName?.toLowerCase().includes(term) ||
            e.categoryNumber?.toLowerCase().includes(term) ||
            e.department?.toLowerCase().includes(term),
        );
      }

      return allEntries;
    }),

  /** List exams grouped by conducting body (for exam mapper dropdown) */
  getExamsByCategory: adminProcedure.query(async ({ ctx }) => {
    const examsList = await ctx.db
      .select({
        id: exams.id,
        name: exams.name,
        conductingBody: exams.conductingBody,
        category: exams.category,
      })
      .from(exams)
      .orderBy(exams.conductingBody, exams.name);

    // Group by conducting body
    const grouped: Record<
      string,
      Array<{ id: string; name: string; category: string | null }>
    > = {};

    for (const exam of examsList) {
      const key = exam.conductingBody ?? "Other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        id: exam.id,
        name: exam.name,
        category: exam.category,
      });
    }

    return grouped;
  }),
});

// ─── Syllabus URL Resolution Helpers ───

/**
 * Build a list of candidate URLs to try for a syllabus, in priority order.
 * Handles: direct URLs, relative paths, generic "Syllabus" links, and
 * auto-constructed slugs from exam name (Kerala PSC pattern).
 */
function buildCandidateUrls(
  syllabusUrl: string,
  examName: string,
  portalOrigin: string,
  portalBaseUrl?: string | null,
): string[] {
  const candidates: string[] = [];
  const trimmed = syllabusUrl.trim();
  const isGeneric = /^(syllabus|syllabi|\/syllabus|\/syllabi)$/i.test(trimmed);

  // 1. If it's a full URL and not generic, try it first
  if (!isGeneric && (trimmed.startsWith("http://") || trimmed.startsWith("https://"))) {
    candidates.push(trimmed);
  }

  // 2. If it's a relative path and not generic, resolve it
  if (!isGeneric && !trimmed.startsWith("http")) {
    if (portalBaseUrl) {
      try {
        candidates.push(new URL(trimmed, portalBaseUrl).href);
      } catch {
        candidates.push(
          trimmed.startsWith("/") ? `${portalOrigin}${trimmed}` : `${portalOrigin}/${trimmed}`,
        );
      }
    } else {
      candidates.push(
        trimmed.startsWith("/") ? `${portalOrigin}${trimmed}` : `${portalOrigin}/${trimmed}`,
      );
    }
  }

  // Deduplicate
  return [...new Set(candidates)];
}

/**
 * Extract the best PDF link from an HTML page, with smart scoring.
 * Matches both href URLs and anchor text against exam name.
 */
function extractPdfLinkFromHtml(
  html: string,
  examName: string,
  portalOrigin: string,
): string | null {
  const htmlLower = html.toLowerCase();

  // Check for 404 pages
  if (
    html.includes('<div class="big-title">404</div>') ||
    htmlLower.includes("<title>404") ||
    htmlLower.includes("page not found") ||
    htmlLower.includes("oops, page not found") ||
    htmlLower.includes("_exception_statuscode=404")
  ) {
    return null;
  }

  // Collect ALL PDF links WITH their anchor text
  const pdfAnchorRegex = /<a[^>]*href=["']([^"']*\.pdf[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const allPdfLinks: Array<{ href: string; text: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pdfAnchorRegex.exec(html)) !== null) {
    if (match[1]) {
      // Strip HTML tags from anchor text
      const text = (match[2] ?? "").replace(/<[^>]*>/g, "").trim();
      allPdfLinks.push({ href: match[1], text });
    }
  }

  // Also collect bare href PDF links (no anchor text)
  const pdfHrefRegex = /href=["']([^"']*\.pdf[^"']*)["']/gi;
  while ((match = pdfHrefRegex.exec(html)) !== null) {
    if (match[1] && !allPdfLinks.some((l) => l.href === match![1])) {
      allPdfLinks.push({ href: match[1], text: "" });
    }
  }

  if (allPdfLinks.length === 0) return null;

  // Score each link based on BOTH href URL and anchor text
  const penaltyPatterns = /authorised|signatory|logo|icon|favicon|banner/i;

  // Extract meaningful words from exam name (>2 chars, skip common words)
  const stopWords = new Set(["the", "and", "for", "from", "with", "grade", "class"]);
  const nameWords = examName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  const scored = allPdfLinks.map(({ href, text }) => {
    let score = 0;
    const lowerHref = decodeURIComponent(href).toLowerCase().replace(/[_-]/g, " ");
    const lowerText = text.toLowerCase();

    // Penalize known junk
    if (penaltyPatterns.test(lowerHref)) return { href, score: -100 };

    // In /sites/default/files/ (actual content file, not navigation)
    if (lowerHref.includes("/sites/default/files/")) score += 3;

    // Match exam name words against BOTH anchor text and URL
    for (const word of nameWords) {
      if (lowerText.includes(word)) score += 8; // Anchor text match is strong
      if (lowerHref.includes(word)) score += 4; // URL match is weaker
    }

    return { href, score };
  });

  scored.sort((a, b) => b.score - a.score);

  if (scored[0] && scored[0].score > 0) {
    const best = scored[0].href;
    if (best.startsWith("http")) return best;
    return best.startsWith("/") ? `${portalOrigin}${best}` : `${portalOrigin}/${best}`;
  }

  return null;
}

/**
 * Scrape the Kerala PSC syllabus listing page and fuzzy-match
 * the exam name to find the direct PDF URL.
 */
async function findSyllabusFromListingPage(
  examName: string,
  portalOrigin: string,
): Promise<string | null> {
  const listingUrl = `${portalOrigin}/index.php/syllabus1`;
  try {
    const response = await fetch(listingUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;

    const html = await response.text();
    return extractPdfLinkFromHtml(html, examName, portalOrigin);
  } catch {
    return null;
  }
}
