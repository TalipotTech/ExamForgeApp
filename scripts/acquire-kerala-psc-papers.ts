/**
 * acquire-kerala-psc-papers.ts
 *
 * One-time admin script to:
 * 1. Trigger Portal Ingestion on keralapsc.gov.in/previous-question-paper
 * 2. Queue classification jobs for all extracted papers
 * 3. Queue pattern analysis after classification
 *
 * Usage: npx tsx scripts/acquire-kerala-psc-papers.ts
 *
 * Prerequisites:
 * - Database must be running and migrated
 * - Redis must be running (for BullMQ)
 * - .env.local must have DATABASE_URL and REDIS_URL
 */

import { config } from "dotenv";
config({ path: ".env.local" });

import { createDatabase } from "@examforge/shared/db";
import { eq, and, sql } from "drizzle-orm";
import { portalDocuments, questions } from "@examforge/shared/db/schema";
import {
  addClassifyPaperJob,
  addAnalyzePatternJob,
} from "../apps/api/src/queues/pattern-analysis-queue";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = createDatabase(DATABASE_URL);

// Kerala PSC exam IDs — matches seed data
const KERALA_PSC_EXAM_ID = "c0000000-0000-0000-0000-000000000005";
const ADMIN_USER_ID = "b0000000-0000-0000-0000-000000000001";
const ORG_ID = "a0000000-0000-0000-0000-000000000001";

async function main(): Promise<void> {
  console.log("=== Kerala PSC Paper Acquisition & Classification ===\n");

  // 1. Check what papers already exist
  const existingDocs = await db
    .select({
      id: portalDocuments.id,
      title: portalDocuments.title,
      examYear: portalDocuments.examYear,
      questionsExtracted: portalDocuments.questionsExtracted,
      processingStatus: portalDocuments.processingStatus,
    })
    .from(portalDocuments)
    .where(eq(portalDocuments.examId, KERALA_PSC_EXAM_ID));

  console.log(`Found ${existingDocs.length} existing portal documents for Kerala PSC`);

  // 2. Check questions with paper years (directly imported)
  const questionYears = await db
    .select({
      paperYear: questions.paperYear,
      count: sql<number>`count(*)::int`,
    })
    .from(questions)
    .where(and(eq(questions.examId, KERALA_PSC_EXAM_ID), sql`${questions.paperYear} IS NOT NULL`))
    .groupBy(questions.paperYear)
    .orderBy(questions.paperYear);

  console.log("\nQuestions by paper year:");
  for (const row of questionYears) {
    console.log(`  ${row.paperYear}: ${row.count} questions`);
  }

  // 3. Queue classification for documents with extracted questions
  const docsToClassify = existingDocs.filter(
    (d) => d.questionsExtracted && d.questionsExtracted > 0,
  );

  if (docsToClassify.length === 0 && questionYears.length === 0) {
    console.log(
      "\nNo papers with questions found. Please ingest papers first via the Portal Ingestion UI.",
    );
    console.log("Sources to ingest:");
    console.log("  - https://keralapsc.gov.in/previous-question-paper");
    console.log("  - https://keralapscgk.com/p/previous-question-papers.html");
    console.log("  - https://pscpdfbanks.in/p/previous-question-papers.html");
    process.exit(0);
  }

  console.log(`\nQueuing classification for ${docsToClassify.length} documents...`);

  const jobIds: string[] = [];

  for (const doc of docsToClassify) {
    const jobId = await addClassifyPaperJob({
      examId: KERALA_PSC_EXAM_ID,
      portalDocumentId: doc.id,
      userId: ADMIN_USER_ID,
      orgId: ORG_ID,
    });
    console.log(`  Queued: ${doc.title} (${doc.examYear}) → job ${jobId}`);
    jobIds.push(jobId);
  }

  // Also classify by paper year for questions without portal documents
  for (const row of questionYears) {
    if (!row.paperYear) continue;
    const jobId = await addClassifyPaperJob({
      examId: KERALA_PSC_EXAM_ID,
      paperYear: row.paperYear,
      userId: ADMIN_USER_ID,
      orgId: ORG_ID,
    });
    console.log(`  Queued: Year ${row.paperYear} (${row.count} questions) → job ${jobId}`);
    jobIds.push(jobId);
  }

  // 4. Queue pattern analysis (will wait for classifications to complete)
  const analyzeJobId = await addAnalyzePatternJob({
    examId: KERALA_PSC_EXAM_ID,
    userId: ADMIN_USER_ID,
    orgId: ORG_ID,
  });

  console.log(`\nQueued pattern analysis → job ${analyzeJobId}`);
  console.log(`\nTotal: ${jobIds.length} classification jobs + 1 analysis job queued.`);
  console.log("Monitor progress via the admin Pattern Analysis UI or BullMQ dashboard.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
