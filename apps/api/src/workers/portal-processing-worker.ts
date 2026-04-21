import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { portalDocuments } from "@examforge/shared/db/schema";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  PORTAL_PROCESSING_QUEUE_NAME,
  type ProcessDocumentJobData,
} from "../queues/portal-processing-queue.js";
import { processPDF, PDF_DOWNLOAD_DELAY } from "../services/pdf-processor.js";

// ─── Worker Factory (Process Individual Documents) ───
// Admin triggers this via the UI. Each job processes a single portal document:
// download PDF → extract text → AI extraction → save to staged_questions.

export function createPortalProcessingWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    PORTAL_PROCESSING_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as ProcessDocumentJobData;
      console.log(`[portal-processing] Starting job ${job.id} for document ${data.documentId}`);

      // Fetch the document record
      const [doc] = await db
        .select()
        .from(portalDocuments)
        .where(eq(portalDocuments.id, data.documentId))
        .limit(1);

      if (!doc) {
        throw new Error(`Portal document ${data.documentId} not found`);
      }

      if (doc.processingStatus === "processed") {
        console.log(`[portal-processing] Document ${data.documentId} already processed, skipping`);
        return { success: true, skipped: true };
      }

      try {
        await job.updateProgress({ stage: "processing", percent: 10 });

        // Trust hints stashed on portal_documents.metadata by the admin
        // at ingest time (e.g. "this is the official answer key PDF").
        // Defaults mean the existing portal-discovery flow still works.
        const docMeta = (doc.metadata as Record<string, unknown>) ?? {};
        const isOfficialAnswerKey = docMeta.isOfficialAnswerKey === true;

        const result = await processPDF(
          {
            documentId: doc.id,
            pdfUrl: doc.originalUrl,
            documentType: doc.documentType,
            examName: doc.examName ?? doc.title,
            examYear: doc.examYear ?? undefined,
            examId: doc.examId ?? undefined,
            paperNumber: undefined,
            userId: data.userId,
            orgId: data.orgId,
            staging: true, // Write to staged_questions, not questions
            sourceType: "real_paper",
            answerSource: isOfficialAnswerKey ? "official_key" : "unverified",
          },
          db,
        );

        await job.updateProgress({ stage: "completed", percent: 100 });

        console.log(
          `[portal-processing] Document ${data.documentId} processed: ${result.questionsExtracted} questions staged`,
        );

        // NOTE: Pattern classification used to auto-queue here, but
        // portal-processing writes to `staged_questions` (not
        // `questions`). Classification queries the `questions` table,
        // so it always found 0 rows. Classification now auto-queues
        // from `approveQuestions` (portal-ingestion router) — right
        // after staged rows are promoted to questions.

        return {
          success: result.success,
          questionsExtracted: result.questionsExtracted,
          answersMatched: result.answersMatched,
          error: result.error,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[portal-processing] Document ${data.documentId} failed:`, msg);

        // Update document status to error
        await db
          .update(portalDocuments)
          .set({
            processingStatus: "error",
            errorMessage: msg,
            updatedAt: new Date(),
          })
          .where(eq(portalDocuments.id, data.documentId));

        throw err;
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2, // Can process 2 PDFs at once (independent docs)
      limiter: {
        max: 1,
        duration: PDF_DOWNLOAD_DELAY, // Rate limit: 1 job per 2s to avoid overwhelming portals
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[portal-processing] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[portal-processing] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
