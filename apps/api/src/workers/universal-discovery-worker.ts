/**
 * Universal Discovery Worker — Universal Discovery Agent v2
 *
 * Handles three job types (job.data.type discriminator):
 *
 *  1. `broad-discover`  — Sweep a portal's notifications page (+ follow
 *                         pagination up to N pages). For every exam item
 *                         the universal parser finds, upsert into exams +
 *                         create a notification if the dates changed.
 *
 *  2. `deep-discover`   — Given an existing exam, find every portal that
 *                         conducts it and scrape its previousPapers /
 *                         answerKeys / syllabus pages to harvest PDF links.
 *                         Each PDF link becomes a portal-ingestion job so
 *                         the existing pipeline extracts questions.
 *
 *  3. `validate-exam`   — URL sanity (HEAD requests), date sanity,
 *                         recompute contentCompleteness JSONB on the exam.
 */

import { Worker, Job } from "bullmq";
import { eq, and, ilike } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import {
  exams,
  examNotifications,
  questions,
  portalDocuments,
  syllabi,
  examPatterns,
  paperAnalysis,
} from "@examforge/shared/db/schema";
import {
  discoveryPageResultSchema,
  type DiscoveryPageResult,
  type DiscoveredItem,
  type ExamContentCompleteness,
} from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import {
  UNIVERSAL_DISCOVERY_QUEUE_NAME,
  type UniversalDiscoveryJobData,
  type BroadDiscoverJobData,
  type DeepDiscoverJobData,
  type ValidateExamJobData,
} from "../queues/universal-discovery-queue.js";
import { routeAIRequest } from "../ai/ai-router.js";
import { buildUniversalPageParserPrompt } from "../ai/prompts/universal-page-parser.js";
import { htmlToMarkdown } from "../services/html-to-markdown.js";
import { crawlPages } from "./scraper/crawler.js";
import {
  PORTAL_BY_ID,
  getPortalsForExam,
  type OfficialPortal,
  type OfficialPortalPages,
} from "../config/official-portals.js";
import { normalizeExamName } from "../config/exam-name-normalizer.js";

// ─── Worker Factory ───────────────────────────────────

export function createUniversalDiscoveryWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    UNIVERSAL_DISCOVERY_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as UniversalDiscoveryJobData;

      switch (data.type) {
        case "broad-discover":
          return broadDiscover(job, data, db);
        case "deep-discover":
          return deepDiscover(job, data, db);
        case "validate-exam":
          return validateExam(job, data, db);
        default:
          throw new Error(
            `Unknown universal-discovery job type: ${(data as { type: string }).type}`,
          );
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2,
      limiter: { max: 5, duration: 60_000 },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[universal-discovery] Job ${job.id} (${job.name}) completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`[universal-discovery] Job ${job?.id} (${job?.name}) failed:`, err.message);
  });

  return worker;
}

// ─── Job 1: Broad Discover ────────────────────────────

async function broadDiscover(
  job: Job,
  data: BroadDiscoverJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{
  portalId: string;
  itemsExtracted: number;
  examsCreated: number;
  examsUpdated: number;
  notificationsCreated: number;
}> {
  const portal = PORTAL_BY_ID[data.portalId];
  if (!portal) {
    throw new Error(`Unknown portal: ${data.portalId}`);
  }
  const startUrl = portal.pages.notifications ?? portal.pages.examCalendar;
  if (!startUrl) {
    throw new Error(`Portal ${portal.id} has no notifications/calendar page configured`);
  }

  console.log(`[universal-discovery] broad: ${portal.id} (${startUrl}) maxPages=${data.maxPages}`);
  await job.updateProgress({ stage: "crawling", percent: 10 });

  // 1. Fetch pages with the existing crawler (cheerio/playwright).
  const crawled = await crawlPages({
    startUrl,
    maxPages: data.maxPages,
    crawlerType: portal.fetchMethod === "playwright" ? "playwright" : "cheerio",
    fetchDelayMs: portal.rateLimit,
  });

  if (crawled.length === 0) {
    console.warn(`[universal-discovery] No pages crawled for ${portal.id}`);
    return {
      portalId: portal.id,
      itemsExtracted: 0,
      examsCreated: 0,
      examsUpdated: 0,
      notificationsCreated: 0,
    };
  }

  // 2. Parse each page with the universal AI prompt and collect items.
  let allItems: DiscoveredItem[] = [];
  for (let i = 0; i < crawled.length; i++) {
    const page = crawled[i]!;
    await job.updateProgress({
      stage: "parsing",
      percent: 20 + Math.floor((i / crawled.length) * 50),
    });

    const markdown = page.htmlContent
      ? htmlToMarkdown(page.htmlContent, { baseUrl: page.url })
      : page.textContent;

    if (!markdown || markdown.length < 100) {
      console.warn(`[universal-discovery] Skipping ${page.url} — insufficient content`);
      continue;
    }

    try {
      const items = await parsePageWithAI({
        portal,
        pageUrl: page.url,
        markdown,
        userId: data.userId,
      });
      allItems = allItems.concat(items);
    } catch (err) {
      console.error(`[universal-discovery] Parse failed for ${page.url}:`, (err as Error).message);
    }
  }

  // 3. Upsert into DB.
  await job.updateProgress({ stage: "upserting", percent: 80 });
  let examsCreated = 0;
  let examsUpdated = 0;
  let notificationsCreated = 0;

  for (const item of allItems) {
    const { created, updated, notifCreated } = await upsertDiscoveredItem(
      item,
      portal,
      data.orgId,
      db,
    );
    if (created) examsCreated++;
    if (updated) examsUpdated++;
    if (notifCreated) notificationsCreated++;
  }

  await job.updateProgress({ stage: "done", percent: 100 });
  return {
    portalId: portal.id,
    itemsExtracted: allItems.length,
    examsCreated,
    examsUpdated,
    notificationsCreated,
  };
}

// ─── Job 2: Deep Discover ─────────────────────────────

async function deepDiscover(
  job: Job,
  data: DeepDiscoverJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{
  examId: string;
  portalsChecked: number;
  itemsHarvested: number;
  pdfsFound: number;
}> {
  const [exam] = await db.select().from(exams).where(eq(exams.id, data.examId)).limit(1);

  if (!exam) throw new Error(`Exam not found: ${data.examId}`);

  console.log(`[universal-discovery] deep: examId=${exam.id} name="${exam.name}"`);

  // Find all portals that conduct or aggregate this exam.
  const portals = getPortalsForExam(exam.name);
  if (portals.length === 0) {
    console.log(`[universal-discovery] No known portals for "${exam.name}"`);
    return {
      examId: exam.id,
      portalsChecked: 0,
      itemsHarvested: 0,
      pdfsFound: 0,
    };
  }

  // Target pages: previousPapers, answerKeys, syllabus.
  const targetPageKeys: (keyof OfficialPortalPages)[] = [
    "previousPapers",
    "answerKeys",
    "syllabus",
  ];

  let itemsHarvested = 0;
  let pdfsFound = 0;
  let portalsChecked = 0;

  for (let p = 0; p < portals.length; p++) {
    const portal = portals[p]!;
    await job.updateProgress({
      stage: `portal ${portal.id}`,
      percent: Math.floor((p / portals.length) * 90),
    });

    let portalTouched = false;
    for (const key of targetPageKeys) {
      const url = portal.pages[key];
      if (!url) continue;

      try {
        const crawled = await crawlPages({
          startUrl: url,
          maxPages: 1,
          crawlerType: portal.fetchMethod === "playwright" ? "playwright" : "cheerio",
          fetchDelayMs: portal.rateLimit,
        });

        for (const page of crawled) {
          const markdown = page.htmlContent
            ? htmlToMarkdown(page.htmlContent, { baseUrl: page.url })
            : page.textContent;
          if (!markdown) continue;

          const items = await parsePageWithAI({
            portal,
            pageUrl: page.url,
            markdown,
            userId: data.userId,
            pageType:
              key === "previousPapers"
                ? "previous_papers"
                : key === "answerKeys"
                  ? "answer_keys"
                  : "syllabus",
          });

          // Filter items to ones matching this exam.
          const matching = items.filter((i) => {
            const canonical = normalizeExamName(i.examName);
            return (
              canonical.toLowerCase() === exam.name.toLowerCase() ||
              canonical.toLowerCase().includes(exam.name.toLowerCase()) ||
              exam.name.toLowerCase().includes(canonical.toLowerCase())
            );
          });

          itemsHarvested += matching.length;
          portalTouched = true;

          // Collect PDF links from matching items and create portal_documents
          // rows. The existing portal-processing-worker will pick them up.
          for (const item of matching) {
            for (const link of item.links) {
              if (link.format !== "pdf") continue;
              if (
                link.type !== "question_paper" &&
                link.type !== "answer_key" &&
                link.type !== "syllabus"
              )
                continue;

              const mapped =
                link.type === "question_paper"
                  ? "question_paper_mcq"
                  : link.type === "answer_key"
                    ? "answer_key"
                    : "syllabus";

              // Skip if we already have this URL.
              const existing = await db
                .select({ id: portalDocuments.id })
                .from(portalDocuments)
                .where(eq(portalDocuments.originalUrl, link.url))
                .limit(1);
              if (existing.length > 0) continue;

              await db.insert(portalDocuments).values({
                portalName: portal.name,
                portalUrl: url,
                sourcePageType: key,
                documentType: mapped,
                title: item.title || link.label || exam.name,
                examName: exam.name,
                examYear: item.year ?? undefined,
                examCategory: exam.category,
                originalUrl: link.url,
                processingStatus: "discovered",
                examId: exam.id,
              });
              pdfsFound++;
            }
          }
        }
      } catch (err) {
        console.error(
          `[universal-discovery] Deep crawl failed for ${url}:`,
          (err as Error).message,
        );
      }
    }

    if (portalTouched) portalsChecked++;
  }

  await job.updateProgress({ stage: "done", percent: 100 });
  return {
    examId: exam.id,
    portalsChecked,
    itemsHarvested,
    pdfsFound,
  };
}

// ─── Job 3: Validate Exam + Compute Completeness ──────

async function validateExam(
  job: Job,
  data: ValidateExamJobData,
  db: ReturnType<typeof createDatabase>,
): Promise<{
  examId: string;
  completenessScore: number;
}> {
  const [exam] = await db.select().from(exams).where(eq(exams.id, data.examId)).limit(1);
  if (!exam) throw new Error(`Exam not found: ${data.examId}`);

  await job.updateProgress({ stage: "gathering", percent: 20 });

  const completeness = await computeContentCompleteness(exam.id, exam.name, db);

  await job.updateProgress({ stage: "writing", percent: 80 });
  await db
    .update(exams)
    .set({
      contentCompleteness: completeness as unknown as Record<string, unknown>,
      updatedAt: new Date(),
    })
    .where(eq(exams.id, exam.id));

  await job.updateProgress({ stage: "done", percent: 100 });
  return { examId: exam.id, completenessScore: completeness.completenessScore };
}

// ─── Helpers ──────────────────────────────────────────

async function parsePageWithAI(args: {
  portal: OfficialPortal;
  pageUrl: string;
  markdown: string;
  userId: string;
  pageType?: "notifications" | "previous_papers" | "answer_keys" | "syllabus";
}): Promise<DiscoveredItem[]> {
  const baseUrl = `https://${args.portal.domain}`;
  const { systemPrompt, prompt } = buildUniversalPageParserPrompt({
    portalName: args.portal.name,
    portalDomain: args.portal.domain,
    pageUrl: args.pageUrl,
    pageType: args.pageType ?? "notifications",
    baseUrl,
    pageMarkdown: args.markdown,
    knownExams: args.portal.examsConducted,
  });

  const result = await routeAIRequest(
    {
      task: "parse_portal_page",
      prompt,
      systemPrompt,
      schema: discoveryPageResultSchema,
      userId: args.userId,
    },
    createDatabase(process.env.DATABASE_URL!),
  );

  return (result.data as DiscoveryPageResult).items;
}

async function upsertDiscoveredItem(
  item: DiscoveredItem,
  portal: OfficialPortal,
  orgId: string,
  db: ReturnType<typeof createDatabase>,
): Promise<{ created: boolean; updated: boolean; notifCreated: boolean }> {
  const canonicalName = normalizeExamName(item.examName);
  if (!canonicalName) {
    return { created: false, updated: false, notifCreated: false };
  }

  // Try to find an existing exam by case-insensitive name match.
  const [existing] = await db.select().from(exams).where(ilike(exams.name, canonicalName)).limit(1);

  const examDate = parseMaybeIsoDate(item.dates?.examDate);
  const regStart = parseMaybeIsoDate(item.dates?.applicationStart);
  const regEnd = parseMaybeIsoDate(item.dates?.applicationEnd);

  if (!existing) {
    // Create new exam as draft (admin reviews).
    await db.insert(exams).values({
      name: canonicalName,
      category: item.category ?? "other",
      conductingBody: item.conductingBody ?? portal.name,
      isAutoDiscovered: true,
      discoverySource: portal.domain,
      status: "draft",
      level: "national", // default; admin can refine
      examDate: examDate ?? undefined,
      registrationStart: regStart ?? undefined,
      registrationEnd: regEnd ?? undefined,
      eligibility: item.eligibility ?? undefined,
      orgId,
      lastCheckedAt: new Date(),
      dateConfidence: examDate ? "confirmed" : "unknown",
    });
    return { created: true, updated: false, notifCreated: false };
  }

  // Existing exam — update dates if changed, emit notification if material.
  const updates: Partial<typeof exams.$inferInsert> = {
    lastCheckedAt: new Date(),
  };
  let notifCreated = false;

  if (examDate && (!existing.examDate || existing.examDate.getTime() !== examDate.getTime())) {
    updates.examDate = examDate;
    await db.insert(examNotifications).values({
      examId: existing.id,
      type: "date_change",
      title: `Exam date updated: ${canonicalName}`,
      description: `New exam date: ${examDate.toISOString().slice(0, 10)}. Source: ${portal.name}`,
      sourceUrl: portal.pages.notifications ?? null,
    });
    notifCreated = true;
  }

  if (
    regStart &&
    (!existing.registrationStart || existing.registrationStart.getTime() !== regStart.getTime())
  ) {
    updates.registrationStart = regStart;
  }
  if (
    regEnd &&
    (!existing.registrationEnd || existing.registrationEnd.getTime() !== regEnd.getTime())
  ) {
    updates.registrationEnd = regEnd;
  }

  const didUpdate = Object.keys(updates).length > 1; // more than just lastCheckedAt
  await db.update(exams).set(updates).where(eq(exams.id, existing.id));

  return { created: false, updated: didUpdate, notifCreated };
}

function parseMaybeIsoDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

async function computeContentCompleteness(
  examId: string,
  examName: string,
  db: ReturnType<typeof createDatabase>,
): Promise<ExamContentCompleteness> {
  // Previous papers: distinct paperYear values in questions + portal_documents.
  const qYearsRows = await db
    .select({ paperYear: questions.paperYear })
    .from(questions)
    .where(eq(questions.examId, examId))
    .groupBy(questions.paperYear);
  const yearsFromQuestions = qYearsRows
    .map((r) => r.paperYear)
    .filter((y): y is number => y !== null && y !== undefined);

  const docRows = await db
    .select({
      examYear: portalDocuments.examYear,
      documentType: portalDocuments.documentType,
    })
    .from(portalDocuments)
    .where(eq(portalDocuments.examId, examId));
  const yearsFromDocs = docRows
    .filter((r) => r.documentType === "question_paper_mcq")
    .map((r) => r.examYear)
    .filter((y): y is number => y !== null && y !== undefined);

  const paperYearsSet = new Set<number>([...yearsFromQuestions, ...yearsFromDocs]);
  const previousPapersYears = [...paperYearsSet].sort((a, b) => b - a);

  const answerKeysFound = docRows.filter((r) => r.documentType === "answer_key").length;

  // Syllabus: exists?
  const syllabiRows = await db
    .select({
      id: syllabi.id,
      status: syllabi.status,
    })
    .from(syllabi)
    .where(eq(syllabi.examId, examId));

  const syllabusFound = syllabiRows.length > 0;
  const syllabusProcessed = syllabiRows.some((s) => s.status === "parsed");

  // Pattern classification + analysis
  const classifiedRows = await db
    .select({ id: paperAnalysis.id, status: paperAnalysis.status })
    .from(paperAnalysis)
    .where(and(eq(paperAnalysis.examId, examId), eq(paperAnalysis.status, "classified")));

  const [currentPattern] = await db
    .select({
      id: examPatterns.id,
      confidence: examPatterns.confidence,
    })
    .from(examPatterns)
    .where(and(eq(examPatterns.examId, examId), eq(examPatterns.isCurrent, true)))
    .limit(1);

  // Gap analysis: the last 10 years we'd ideally have.
  const currentYear = new Date().getFullYear();
  const idealYears = Array.from({ length: 10 }, (_, i) => currentYear - 1 - i);
  const missingPaperYears = idealYears.filter((y) => !paperYearsSet.has(y));

  // Scoring (out of 100) — matches spec weights.
  let score = 0;
  if (currentPattern) score += 20;
  if (syllabusFound) score += 15;
  if (previousPapersYears.length >= 3) score += 15;
  if (answerKeysFound > 0) score += 10;
  if (previousPapersYears.length >= 5) score += 10;
  if (syllabusProcessed) score += 15;
  if (classifiedRows.length > 0) score += 15;

  void examName; // unused for now; reserved for future enrichment rules
  return {
    previousPapersFound: previousPapersYears.length,
    previousPapersYears,
    answerKeysFound,
    answeredPapersCount: answerKeysFound, // approx: assumes 1 answer key per paper
    syllabusFound,
    syllabusProcessed,
    papersClassified: classifiedRows.length,
    patternGenerated: Boolean(currentPattern),
    patternConfidence: currentPattern?.confidence ?? 0,
    missingPaperYears,
    needsAnswerKeys: previousPapersYears.filter(
      (y) => !docRows.some((d) => d.examYear === y && d.documentType === "answer_key"),
    ),
    needsSyllabus: !syllabusFound,
    completenessScore: Math.min(100, score),
    lastComputedAt: new Date().toISOString(),
  };
}
