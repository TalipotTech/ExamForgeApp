import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import type { Database } from "@examforge/shared/db";
import { searchResults, userSavedContent } from "@examforge/shared/db/schema";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { getRedisClient } from "../lib/redis.js";
import {
  CONTENT_FETCH_QUEUE_NAME,
  type ContentFetchJobData,
} from "../queues/content-fetch-queue.js";

// ─── Cache Keys ───

const PREVIEW_CACHE_PREFIX = "preview:";
const PREVIEW_CACHE_TTL = 3600; // 1 hour
const EXTRACTED_CACHE_PREFIX = "extracted:";
const EXTRACTED_CACHE_TTL = 3600; // 1 hour

// ─── Worker Factory ───

export function createContentFetchWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    CONTENT_FETCH_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as ContentFetchJobData;

      switch (data.type) {
        case "preview":
          return handlePreview(data.resultId, db);
        case "extract_questions":
          return handleExtractQuestions(data.resultId, data.provider, data.userId, db);
        case "extract_syllabus":
          return handleExtractSyllabus(data.resultId, data.provider, data.userId, db);
        case "download_pdf":
          return handleDownloadPdf(data.resultId, data.userId, db);
        case "extract_text":
          return handleExtractText(data.resultId, data.userId, db);
        default:
          throw new Error(`Unknown job type`);
      }
    },
    {
      connection: getBullMQConnection(),
      concurrency: 3,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[content-fetch] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[content-fetch] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Fetch page content ───

async function fetchPageContent(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ExamForge/1.0; +https://examforge.app)",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/pdf")) {
    // For PDFs, return a placeholder — PDF text extraction handled separately
    return "[PDF content — use PDF extraction for full text]";
  }

  const html = await response.text();
  return stripHtmlToText(html);
}

function stripHtmlToText(html: string): string {
  // Remove scripts, styles, and nav elements
  let text = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, "");

  // Remove all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// ─── Preview Handler ───

async function handlePreview(resultId: string, db: Database): Promise<{ preview: string }> {
  const redis = getRedisClient();
  const cacheKey = `${PREVIEW_CACHE_PREFIX}${resultId}`;

  // Check cache
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) return { preview: cached };

  // Get result URL
  const [result] = await db
    .select({ sourceUrl: searchResults.sourceUrl, contentType: searchResults.contentType })
    .from(searchResults)
    .where(eq(searchResults.id, resultId))
    .limit(1);

  if (!result) throw new Error(`Search result ${resultId} not found`);

  // Handle internal URLs
  if (result.sourceUrl.startsWith("internal://")) {
    const preview = "This content is available in your ExamForge library.";
    await redis.set(cacheKey, preview, "EX", PREVIEW_CACHE_TTL);
    return { preview };
  }

  const text = await fetchPageContent(result.sourceUrl);
  const preview = text.slice(0, 2000);

  await redis.set(cacheKey, preview, "EX", PREVIEW_CACHE_TTL);
  return { preview };
}

// ─── Extract Questions Handler ───

async function handleExtractQuestions(
  resultId: string,
  _provider: string,
  _userId: string,
  db: Database,
): Promise<{ questions: unknown[] }> {
  const redis = getRedisClient();
  const cacheKey = `${EXTRACTED_CACHE_PREFIX}questions:${resultId}`;

  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as { questions: unknown[] };
    } catch {
      /* continue */
    }
  }

  const [result] = await db
    .select({ sourceUrl: searchResults.sourceUrl })
    .from(searchResults)
    .where(eq(searchResults.id, resultId))
    .limit(1);

  if (!result) throw new Error(`Search result ${resultId} not found`);

  if (result.sourceUrl.startsWith("internal://")) {
    return { questions: [] };
  }

  const content = await fetchPageContent(result.sourceUrl);

  // TODO: Send to AI for question extraction using routeAIRequest
  // For now, return the raw content for client-side handling
  const extractedResult = { questions: [], rawContent: content.slice(0, 10000) };

  await redis
    .set(cacheKey, JSON.stringify(extractedResult), "EX", EXTRACTED_CACHE_TTL)
    .catch(() => {});

  return extractedResult;
}

// ─── Extract Syllabus Handler ───

async function handleExtractSyllabus(
  resultId: string,
  _provider: string,
  _userId: string,
  db: Database,
): Promise<{ syllabus: unknown }> {
  const redis = getRedisClient();
  const cacheKey = `${EXTRACTED_CACHE_PREFIX}syllabus:${resultId}`;

  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      return JSON.parse(cached) as { syllabus: unknown };
    } catch {
      /* continue */
    }
  }

  const [result] = await db
    .select({ sourceUrl: searchResults.sourceUrl })
    .from(searchResults)
    .where(eq(searchResults.id, resultId))
    .limit(1);

  if (!result) throw new Error(`Search result ${resultId} not found`);

  if (result.sourceUrl.startsWith("internal://")) {
    return { syllabus: null };
  }

  const content = await fetchPageContent(result.sourceUrl);

  // TODO: Send to AI for syllabus extraction
  const extractedResult = { syllabus: null, rawContent: content.slice(0, 10000) };

  await redis
    .set(cacheKey, JSON.stringify(extractedResult), "EX", EXTRACTED_CACHE_TTL)
    .catch(() => {});

  return extractedResult;
}

// ─── Download PDF Handler ───

async function handleDownloadPdf(
  resultId: string,
  userId: string,
  db: Database,
): Promise<{ savedContentId: string }> {
  const [result] = await db
    .select({
      sourceUrl: searchResults.sourceUrl,
      title: searchResults.title,
      sourceName: searchResults.sourceName,
      contentType: searchResults.contentType,
    })
    .from(searchResults)
    .where(eq(searchResults.id, resultId))
    .limit(1);

  if (!result) throw new Error(`Search result ${resultId} not found`);

  // TODO: Download PDF, upload to S3, extract text with pdf-parse
  // For now, save as bookmark with source URL
  const [saved] = await db
    .insert(userSavedContent)
    .values({
      userId,
      searchResultId: resultId,
      title: result.title,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
      contentType: result.contentType,
      savedType: "downloaded_pdf",
      ownerType: "user",
      ownerId: userId,
    })
    .returning({ id: userSavedContent.id });

  // Mark as saved
  await db.update(searchResults).set({ isSaved: true }).where(eq(searchResults.id, resultId));

  return { savedContentId: saved!.id };
}

// ─── Extract Text Handler ───

async function handleExtractText(
  resultId: string,
  userId: string,
  db: Database,
): Promise<{ savedContentId: string }> {
  const [result] = await db
    .select({
      sourceUrl: searchResults.sourceUrl,
      title: searchResults.title,
      sourceName: searchResults.sourceName,
      contentType: searchResults.contentType,
    })
    .from(searchResults)
    .where(eq(searchResults.id, resultId))
    .limit(1);

  if (!result) throw new Error(`Search result ${resultId} not found`);

  let rawText = "";
  if (!result.sourceUrl.startsWith("internal://")) {
    rawText = await fetchPageContent(result.sourceUrl);
  }

  const [saved] = await db
    .insert(userSavedContent)
    .values({
      userId,
      searchResultId: resultId,
      title: result.title,
      sourceUrl: result.sourceUrl,
      sourceName: result.sourceName,
      contentType: result.contentType,
      savedType: "extracted_text",
      rawText,
      ownerType: "user",
      ownerId: userId,
    })
    .returning({ id: userSavedContent.id });

  await db.update(searchResults).set({ isSaved: true }).where(eq(searchResults.id, resultId));

  return { savedContentId: saved!.id };
}
