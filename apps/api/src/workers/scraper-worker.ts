import { Worker, Job } from "bullmq";
import { eq, sql, and } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import type { Database } from "@examforge/shared/db";
import { questions, scrapeSources, scrapeRuns, exams } from "@examforge/shared/db/schema";
import type { ScrapeSourceConfig } from "@examforge/shared/db/schema";
import type {
  ScrapeJobData,
  ScrapeProgress,
  ExtractedQuestion,
} from "@examforge/shared/validators";
import { extractedQuestionsResponseSchema } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { routeAIRequest, routeEmbedRequest } from "../ai/ai-router.js";
import { buildQuestionExtractionPrompt } from "../ai/prompts/question-extraction.js";
import { SCRAPER_QUEUE_NAME } from "../queues/scraper-queue.js";
import { crawlPages } from "./scraper/crawler.js";
import type { CrawledPage } from "./scraper/crawler.js";

const DUPLICATE_SIMILARITY_THRESHOLD = 0.92;

// ─── Worker Factory ───

export function createScraperWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    SCRAPER_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as ScrapeJobData;
      return processScraperJob(job, data, db);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2,
      limiter: {
        max: 5,
        duration: 60_000,
      },
    },
  );

  worker.on("completed", (job) => {
    console.log(`[scraper] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[scraper] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Main Job Processor ───

type ScrapeResult = {
  pagesVisited: number;
  questionsFound: number;
  duplicatesSkipped: number;
  errorsCount: number;
};

async function processScraperJob(
  job: Job,
  jobData: ScrapeJobData,
  db: Database,
): Promise<ScrapeResult> {
  const { sourceId, runId, url, examId, orgId, userId, maxPages } = jobData;

  // 1. Fetch source config and exam context
  const [source] = await db
    .select()
    .from(scrapeSources)
    .where(and(eq(scrapeSources.id, sourceId), eq(scrapeSources.orgId, orgId)))
    .limit(1);

  if (!source) {
    throw new Error(`Scrape source ${sourceId} not found for org ${orgId}`);
  }

  const [exam] = await db
    .select({ id: exams.id, name: exams.name, subjects: exams.subjects })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);

  if (!exam) {
    throw new Error(`Exam ${examId} not found`);
  }

  const examName = exam.name;
  const examSubjects = exam.subjects ?? [];

  const config: ScrapeSourceConfig = (source.config as ScrapeSourceConfig) ?? {};

  // 2. Update source status and scrape_run status to running
  await db
    .update(scrapeSources)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(scrapeSources.id, sourceId));

  if (runId) {
    await db
      .update(scrapeRuns)
      .set({ status: "running", startedAt: new Date() })
      .where(eq(scrapeRuns.id, runId));
  }

  // 3. Initialize progress tracker
  const progress: ScrapeProgress = {
    pagesVisited: 0,
    pagesTotal: maxPages,
    questionsFound: 0,
    duplicatesSkipped: 0,
    errorsCount: 0,
    status: "crawling",
  };

  const errorLog: Array<{ time: string; message: string; page?: string }> = [];

  try {
    // 4. Crawl pages
    const pages = await crawlPages({
      startUrl: url,
      maxPages,
      crawlerType: config.crawlerType ?? "cheerio",
      fetchDelayMs: config.fetchDelayMs ?? 2000,
      urlPatterns: config.urlPatterns,
      excludePatterns: config.excludePatterns,
      contentSelector: config.contentSelector,
      onPageCrawled: (pageUrl) => {
        progress.pagesVisited++;
        progress.currentPage = pageUrl;
        progress.status = "crawling";
        job.updateProgress(progress);
      },
    });

    progress.pagesTotal = pages.length;
    progress.status = "extracting";
    await job.updateProgress(progress);

    console.log(`[scraper] Crawled ${pages.length} pages from ${url}`);

    // 5. Process each page through AI extraction pipeline
    for (const page of pages) {
      try {
        await processPage(page, job, db, {
          examId,
          orgId,
          userId,
          sourceId,
          examName,
          examSubjects,
          config,
          progress,
        });
      } catch (pageError) {
        const errMsg = pageError instanceof Error ? pageError.message : String(pageError);
        console.error(`[scraper] Error processing page ${page.url}:`, pageError);
        progress.errorsCount++;
        errorLog.push({ time: new Date().toISOString(), message: errMsg, page: page.url });
        await job.updateProgress(progress);
      }
    }

    // 6. Mark source and scrape_run as completed
    progress.status = "completed";
    await job.updateProgress(progress);

    await db
      .update(scrapeSources)
      .set({
        status: "completed",
        lastScrapedAt: new Date(),
        questionsCount: sql`${scrapeSources.questionsCount} + ${progress.questionsFound}`,
        totalRuns: sql`${scrapeSources.totalRuns} + 1`,
        successfulRuns: sql`${scrapeSources.successfulRuns} + 1`,
        totalQuestionsScraped: sql`${scrapeSources.totalQuestionsScraped} + ${progress.questionsFound}`,
        updatedAt: new Date(),
      })
      .where(eq(scrapeSources.id, sourceId));

    if (runId) {
      await db
        .update(scrapeRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          pagesVisited: progress.pagesVisited,
          pagesFailed: progress.errorsCount,
          questionsFound: progress.questionsFound + progress.duplicatesSkipped,
          questionsNew: progress.questionsFound,
          questionsDuplicate: progress.duplicatesSkipped,
          errorLog: errorLog.length > 0 ? errorLog : [],
        })
        .where(eq(scrapeRuns.id, runId));
    }

    console.log(
      `[scraper] Completed: ${progress.questionsFound} questions found, ` +
        `${progress.duplicatesSkipped} duplicates skipped, ` +
        `${progress.errorsCount} errors`,
    );

    return {
      pagesVisited: progress.pagesVisited,
      questionsFound: progress.questionsFound,
      duplicatesSkipped: progress.duplicatesSkipped,
      errorsCount: progress.errorsCount,
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    progress.status = "failed";
    await job.updateProgress(progress);

    await db
      .update(scrapeSources)
      .set({
        status: "error",
        lastError: errMsg,
        totalRuns: sql`${scrapeSources.totalRuns} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(scrapeSources.id, sourceId));

    if (runId) {
      errorLog.push({ time: new Date().toISOString(), message: errMsg });
      await db
        .update(scrapeRuns)
        .set({
          status: "failed",
          completedAt: new Date(),
          pagesVisited: progress.pagesVisited,
          pagesFailed: progress.errorsCount,
          questionsFound: progress.questionsFound + progress.duplicatesSkipped,
          questionsNew: progress.questionsFound,
          questionsDuplicate: progress.duplicatesSkipped,
          errorLog,
        })
        .where(eq(scrapeRuns.id, runId));
    }

    throw error;
  }
}

// ─── Per-Page Processor ───

type PageContext = {
  examId: string;
  orgId: string;
  userId: string;
  sourceId: string;
  examName: string;
  examSubjects: string[];
  config: ScrapeSourceConfig;
  progress: ScrapeProgress;
};

async function processPage(
  page: CrawledPage,
  job: Job,
  db: Database,
  ctx: PageContext,
): Promise<void> {
  const contentLength = page.textContent?.trim().length ?? 0;
  console.log(
    `[scraper] Processing page: ${page.url}\n` +
      `  Title: "${page.title}"\n` +
      `  Content length: ${contentLength} chars\n` +
      `  Content preview: "${page.textContent?.trim().slice(0, 300)}..."`,
  );

  // Skip pages with too little content
  if (!page.textContent || contentLength < 100) {
    console.log(
      `[scraper] ⏭ Skipping page — too little content (${contentLength} chars < 100 minimum)`,
    );
    return;
  }

  const { systemPrompt, prompt } = buildQuestionExtractionPrompt(page.textContent, {
    examName: ctx.examName,
    subjects: ctx.examSubjects,
    questionTypes: ctx.config.questionTypes ?? [
      "mcq",
      "true_false",
      "fill_blank",
      "match",
      "assertion",
    ],
  });

  ctx.progress.status = "extracting";
  ctx.progress.currentPage = page.url;
  await job.updateProgress(ctx.progress);

  console.log(`[scraper] 🤖 Sending page to AI for extraction (${contentLength} chars)...`);

  // Call AI to extract questions
  const aiResult = await routeAIRequest(
    {
      task: "extract_questions_from_web",
      prompt,
      systemPrompt,
      schema: extractedQuestionsResponseSchema,
      userId: ctx.userId,
      examId: ctx.examId,
      skipCache: true,
      temperature: 0.1,
    },
    db,
  );

  const extracted = aiResult.data;

  console.log(
    `[scraper] 📊 AI result: ${extracted.questions.length} questions, relevance=${extracted.pageRelevance}, ` +
      `provider=${aiResult.provider}, tokens=${aiResult.usage.totalTokens}, cost=$${aiResult.estimatedCostUsd.toFixed(4)}`,
  );

  if (extracted.pageRelevance === "none" || extracted.questions.length === 0) {
    console.log(`[scraper] ⏭ No questions extracted (relevance=${extracted.pageRelevance})`);
    return;
  }

  console.log(
    `[scraper] Extracted ${extracted.questions.length} questions from ${page.url} ` +
      `(relevance: ${extracted.pageRelevance})`,
  );

  // Batch-generate embeddings for all extracted questions
  const questionTexts = extracted.questions.map(buildQuestionText);
  const embedResult = await routeEmbedRequest(
    { task: "embed_text", texts: questionTexts, userId: ctx.userId, examId: ctx.examId },
    db,
  );

  ctx.progress.status = "deduplicating";
  await job.updateProgress(ctx.progress);

  // Check duplicates and save new questions
  for (let i = 0; i < extracted.questions.length; i++) {
    const question = extracted.questions[i]!;
    const embedding = embedResult.embeddings[i] ?? null;
    const qText = buildQuestionText(question);

    const isDuplicate = embedding ? await checkDuplicate(embedding, ctx.examId, db) : false;

    if (isDuplicate) {
      console.log(`[scraper]   ⚡ Duplicate skipped: "${qText.slice(0, 80)}..."`);
      ctx.progress.duplicatesSkipped++;
    } else {
      const savedId = await saveQuestion(
        question,
        embedding,
        {
          examId: ctx.examId,
          orgId: ctx.orgId,
          sourceId: ctx.sourceId,
          pageUrl: page.url,
        },
        db,
      );
      console.log(
        `[scraper]   ✅ Saved question ${savedId}: "${qText.slice(0, 80)}..." [${question.subject}/${question.difficulty}]`,
      );
      ctx.progress.questionsFound++;
    }
  }

  await job.updateProgress(ctx.progress);
}

// ─── Duplicate Detection via pgvector ───

async function checkDuplicate(embedding: number[], examId: string, db: Database): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1 - (embedding <=> ${JSON.stringify(embedding)}::vector) AS similarity
    FROM questions
    WHERE exam_id = ${examId}
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${JSON.stringify(embedding)}::vector
    LIMIT 1
  `);

  const topMatch = result.rows?.[0] as { similarity: number } | undefined;
  return topMatch !== undefined && topMatch.similarity >= DUPLICATE_SIMILARITY_THRESHOLD;
}

// ─── Save Question ───

async function saveQuestion(
  q: ExtractedQuestion,
  embedding: number[] | null,
  meta: { examId: string; orgId: string; sourceId: string; pageUrl: string },
  db: Database,
): Promise<string> {
  const [row] = await db
    .insert(questions)
    .values({
      examId: meta.examId,
      type: q.content.type,
      content: q.content as unknown as Record<string, unknown>,
      subject: q.subject,
      topic: q.topic ?? null,
      difficulty: q.difficulty,
      source: meta.pageUrl,
      embedding,
      metadata: { scrapeSourceId: meta.sourceId },
      orgId: meta.orgId,
    })
    .returning({ id: questions.id });

  return row!.id;
}

// ─── Question Text Builder (for embedding) ───

function buildQuestionText(q: ExtractedQuestion): string {
  const c = q.content;
  switch (c.type) {
    case "mcq":
      return `${c.question} Options: ${c.options.join(" | ")}`;
    case "true_false":
      return c.question;
    case "fill_blank":
      return c.question;
    case "match":
      return `${c.question} ${c.pairs.map((p) => `${p.left}-${p.right}`).join(", ")}`;
    case "assertion":
      return `Assertion: ${c.assertion} Reason: ${c.reason}`;
  }
}
