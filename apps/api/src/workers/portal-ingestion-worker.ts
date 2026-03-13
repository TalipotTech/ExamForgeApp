import { Worker, Job } from "bullmq";
import { eq, ilike, or } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import type { Database } from "@examforge/shared/db";
import { portalDocuments, exams, scrapeRuns } from "@examforge/shared/db/schema";
import type { PortalPageEntry } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  PORTAL_INGESTION_QUEUE_NAME,
  type IngestPortalJobData,
} from "../queues/portal-ingestion-queue.js";
import { crawlPortalPage } from "../services/portal-crawler.js";

// ─── Title cleanup ───

/** Remove noise from titles: " - Download", trailing whitespace, etc. */
export function cleanTitle(raw: string): string {
  return raw
    .replace(/\s*[-–—]\s*download\s*$/i, "")
    .replace(/\s*\(\s*download\s*\)\s*$/i, "")
    .replace(/\s*download\s*$/i, "")
    .trim();
}

// ─── Document type classification ───

export function classifyDocumentType(
  pageType: string,
  linkLabel: string,
  linkType: string,
): string {
  // Page type (from portal page classification) takes priority
  switch (pageType) {
    case "previous_questions":
      return "question_paper_mcq";
    case "descriptive_questions":
      return "question_paper_descriptive";
    case "omr_answer_key":
      return "answer_key_omr";
    case "online_answer_key":
      return "answer_key_online";
    case "syllabus":
      return "syllabus";
    case "examinations":
      return "examination_schedule";
    case "notification":
      // Check if this is actually an examination programme/schedule
      if (/examination\s+programme/i.test(linkLabel)) return "examination_schedule";
      return "notification";
    default:
      break;
  }

  // Fall back to link type from AI extraction
  if (linkType === "syllabus") return "syllabus";
  if (linkType === "notification") {
    if (/examination\s+programme/i.test(linkLabel)) return "examination_schedule";
    return "notification";
  }

  // Fallback: check link label
  const label = linkLabel.toLowerCase();
  if (label.includes("examination programme")) return "examination_schedule";
  if (label.includes("answer") || label.includes("key")) return "answer_key_omr";
  if (label.includes("syllabus")) return "syllabus";
  if (label.includes("notification")) return "notification";
  if (label.includes("question") || label.includes("paper")) return "question_paper_mcq";

  return "other";
}

// ─── Match exam name to existing DB exam ───

export async function matchExam(db: Database, examName: string): Promise<string | null> {
  const [match] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(
      or(
        ilike(exams.name, `%${examName}%`),
        ilike(exams.name, `%${examName.split(" ").slice(0, 3).join(" ")}%`),
      ),
    )
    .limit(1);

  return match?.id ?? null;
}

// ─── Worker Factory (Discovery Only) ───
// This worker ONLY crawls the portal page and creates portal_documents
// records with status "discovered". Admin must trigger processing separately.

export function createPortalIngestionWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    PORTAL_INGESTION_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as IngestPortalJobData;
      console.log(`[portal-ingestion] Starting discovery job ${job.id} for ${data.url}`);

      // Update run status
      await db
        .update(scrapeRuns)
        .set({ status: "running", startedAt: new Date() })
        .where(eq(scrapeRuns.id, data.runId));

      const errorLog: Array<{ time: string; message: string }> = [];

      try {
        // Step 1: Crawl the portal page
        await job.updateProgress({ stage: "crawling", percent: 10 });

        const isPdfUrl =
          data.url.toLowerCase().endsWith(".pdf") || data.url.toLowerCase().includes(".pdf?");

        let entries: PortalPageEntry[];

        if (isPdfUrl) {
          // Direct PDF URL — skip crawling, create a synthetic entry
          console.log(`[portal-ingestion] Direct PDF URL detected, skipping crawl: ${data.url}`);
          entries = [
            {
              examName: data.portalName,
              examCategory: "",
              pdfLinks: [{ url: data.url, label: "Document", type: "question_paper" }],
            },
          ];
        } else {
          entries = await crawlPortalPage(
            {
              url: data.url,
              portalName: data.portalName,
              pageType: data.pageType,
              userId: data.userId,
            },
            db,
          );
        }

        if (entries.length === 0) {
          await db
            .update(scrapeRuns)
            .set({
              status: "completed",
              completedAt: new Date(),
              metadata: { note: "No entries found on page" },
            })
            .where(eq(scrapeRuns.id, data.runId));
          return { entries: 0, pdfs: 0 };
        }

        await job.updateProgress({
          stage: "saving",
          percent: 50,
          entriesFound: entries.length,
        });

        // Step 2: Create portal_documents records for each PDF (status: "discovered")
        let totalPDFs = 0;

        for (const entry of entries) {
          const examId = data.examId ?? (await matchExam(db, entry.examName));

          for (const link of entry.pdfLinks) {
            const documentType = classifyDocumentType(data.pageType, link.label, link.type);

            try {
              await db.insert(portalDocuments).values({
                portalName: data.portalName,
                portalUrl: data.url,
                sourcePageType: data.pageType,
                documentType,
                title: cleanTitle(`${entry.examName} - ${link.label}`),
                examName: entry.examName,
                examYear: entry.examYear,
                examCategory: entry.examCategory,
                originalUrl: link.url,
                processingStatus: "discovered",
                examId: examId ?? undefined,
              });
              totalPDFs++;
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              errorLog.push({
                time: new Date().toISOString(),
                message: `Failed to save document entry: ${msg}`,
              });
            }
          }
        }

        // Step 3: Update run record — discovery complete
        await db
          .update(scrapeRuns)
          .set({
            status: "completed",
            completedAt: new Date(),
            pagesVisited: entries.length,
            errorLog: errorLog.length > 0 ? errorLog : [],
            metadata: {
              totalPDFs,
              note: "Discovery complete. Documents ready for admin review.",
            },
          })
          .where(eq(scrapeRuns.id, data.runId));

        await job.updateProgress({ stage: "completed", percent: 100 });

        console.log(
          `[portal-ingestion] Discovery complete: ${entries.length} entries, ${totalPDFs} PDFs found`,
        );

        return {
          entries: entries.length,
          pdfs: totalPDFs,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[portal-ingestion] Job ${job.id} failed:`, msg);

        await db
          .update(scrapeRuns)
          .set({
            status: "failed",
            completedAt: new Date(),
            errorLog: [...errorLog, { time: new Date().toISOString(), message: msg }],
          })
          .where(eq(scrapeRuns.id, data.runId));

        throw err;
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[portal-ingestion] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[portal-ingestion] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
