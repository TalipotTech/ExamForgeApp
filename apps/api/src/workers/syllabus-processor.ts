import { Worker, Job } from "bullmq";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { generateText } from "ai";
import { createDatabase } from "@examforge/shared/db";
import type { Database } from "@examforge/shared/db";
import { syllabi, syllabusNodes, exams, aiUsageLogs } from "@examforge/shared/db/schema";
import type { SyllabusJobData } from "@examforge/shared/validators";
import { syllabusTreeSchema } from "@examforge/shared/validators";
import type { SyllabusNodeInput } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { getLanguageModel } from "../ai/providers.js";
import { SYLLABUS_QUEUE_NAME } from "../queues/syllabus-queue.js";

// ─── Worker Factory ───

export function createSyllabusWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    SYLLABUS_QUEUE_NAME,
    async (job: Job) => {
      const data = job.data as SyllabusJobData;
      return processSyllabusJob(job, data, db);
    },
    {
      connection: getBullMQConnection(),
      concurrency: 2,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[syllabus] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[syllabus] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

// ─── Main Job Processor ───

type SyllabusProcessResult = {
  nodeCount: number;
  method: string;
};

async function processSyllabusJob(
  job: Job,
  jobData: SyllabusJobData,
  db: Database,
): Promise<SyllabusProcessResult> {
  const { syllabusId, examId, fileKey, userId, examName } = jobData;

  try {
    // 1. Update status → processing
    await db
      .update(syllabi)
      .set({ status: "processing", updatedAt: new Date() })
      .where(eq(syllabi.id, syllabusId));

    await job.updateProgress(10);

    // 2. Get exam context early (needed for smart PDF link matching)
    const resolvedExamName = examName ?? (await getExamName(db, examId));

    // 3. Get the original source URL from syllabi metadata (for re-download)
    const [syllabusRecord] = await db
      .select({ metadata: syllabi.metadata })
      .from(syllabi)
      .where(eq(syllabi.id, syllabusId))
      .limit(1);
    const sourceUrl = (syllabusRecord?.metadata as Record<string, unknown> | null)?.sourceUrl as
      | string
      | undefined;

    // 4. Acquire a valid PDF — either from fresh download or stored file
    const filePath = join(process.cwd(), "storage", fileKey);
    let pdfBuffer: Buffer | null = null;

    // Always re-download from source URL if available (stored file may be corrupt/wrong)
    if (sourceUrl) {
      console.log(`[syllabus] Downloading from source: ${sourceUrl}`);
      pdfBuffer = await downloadAndResolvePdf(sourceUrl, resolvedExamName);

      if (pdfBuffer) {
        // Save the correct PDF to disk
        const storageDir = join(process.cwd(), "storage", "syllabi");
        await fs.mkdir(storageDir, { recursive: true });
        await fs.writeFile(filePath, pdfBuffer);
        console.log(`[syllabus] Saved PDF: ${(pdfBuffer.length / 1024).toFixed(0)} KB`);
      }
    }

    // Fall back to stored file ONLY if there's no source URL (direct upload).
    // If sourceUrl existed but download failed, the stored file is likely wrong too — fail fast.
    if (!pdfBuffer) {
      if (sourceUrl) {
        throw new Error(
          `Failed to download PDF from source URL: ${sourceUrl}. ` +
            "The syllabus URL may be broken (404), require browser-based access, or the PDF may not be directly downloadable.",
        );
      }
      try {
        pdfBuffer = await fs.readFile(filePath);
        console.log(
          `[syllabus] Read stored file: ${fileKey} (${(pdfBuffer.length / 1024).toFixed(0)} KB)`,
        );
      } catch {
        throw new Error(`No source URL available and stored file not found: ${fileKey}`);
      }
    }

    // Verify PDF magic bytes
    const pdfMagic = pdfBuffer.subarray(0, 5).toString("utf-8");
    if (!pdfMagic.startsWith("%PDF")) {
      throw new Error(
        `File is not a valid PDF (starts with: ${pdfMagic.slice(0, 10)}). ` +
          "The syllabus URL may point to a broken page or require browser-based access.",
      );
    }

    await job.updateProgress(20);

    // 4. Use Claude vision to extract syllabus structure directly from PDF
    //    Using generateText (not generateObject) because the syllabus schema
    //    has recursive children which structured output mode can't handle.
    const systemPrompt = `You are an expert academic curriculum analyst specializing in Indian university examination syllabi. You parse syllabus documents into precise hierarchical structures. You ALWAYS respond with valid JSON only — no markdown, no backticks, no explanation.`;

    const visionPrompt = `You can SEE the PDF pages directly. Parse the syllabus into a structured hierarchy.

Exam: ${resolvedExamName}

Rules:
1. Preserve the EXACT hierarchy as written in the syllabus
2. Every item must have a type: "unit" | "chapter" | "topic" | "subtopic" | "definition" | "formula" | "objective"
3. Extract ALL items — do not skip, summarize, or combine entries
4. For each item, extract:
   - title: the exact title/heading from the syllabus
   - type: one of the types above
   - depth: 0=root, 1=unit, 2=chapter, 3=topic, 4=subtopic
   - sort_order: integer based on appearance order
   - description: additional text/context (optional)
   - content: full text content for definitions/formulas (optional)
   - key_terms: array of technical terms (optional, default [])
   - children: array of child nodes (same structure, recursive)
5. If hours, credits, or marks weightage are mentioned, include in description
6. Maintain sort_order based on appearance in document

OUTPUT FORMAT: Return ONLY valid JSON (no markdown, no backticks) matching this exact structure:
{
  "nodes": [
    {
      "title": "Unit I: ...",
      "type": "unit",
      "depth": 1,
      "sort_order": 0,
      "description": "...",
      "key_terms": ["term1"],
      "children": [
        {
          "title": "Chapter 1: ...",
          "type": "chapter",
          "depth": 2,
          "sort_order": 0,
          "key_terms": [],
          "children": []
        }
      ]
    }
  ]
}`;

    await job.updateProgress(30);

    const model = getLanguageModel("anthropic", "claude-sonnet-4-20250514");
    const startTime = Date.now();

    const response = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file" as const,
              data: new Uint8Array(pdfBuffer),
              mediaType: "application/pdf" as const,
            },
            {
              type: "text" as const,
              text: visionPrompt,
            },
          ],
        },
      ],
      system: systemPrompt,
      temperature: 0.1,
      maxOutputTokens: 16000,
    });

    const latencyMs = Date.now() - startTime;
    const inputTokens = response.usage.inputTokens ?? 0;
    const outputTokens = response.usage.outputTokens ?? 0;

    // Estimate cost (Claude Sonnet 4 pricing)
    const costPerInputToken = 3 / 1_000_000;
    const costPerOutputToken = 15 / 1_000_000;
    const estimatedCost = inputTokens * costPerInputToken + outputTokens * costPerOutputToken;

    // Log AI call
    await db.insert(aiUsageLogs).values({
      provider: "anthropic",
      model: "claude-sonnet-4-20250514",
      feature: "scrape",
      inputTokens,
      outputTokens,
      latencyMs,
      estimatedCostUsd: estimatedCost,
      userId,
    });

    console.log(
      `[syllabus] Vision extraction: ${inputTokens} in / ${outputTokens} out, ${latencyMs}ms, $${estimatedCost.toFixed(4)}`,
    );

    await job.updateProgress(70);

    // 5. Parse and validate the JSON response
    const rawText = response.text.trim();
    // Strip markdown code fences if present
    const jsonText = rawText.startsWith("```")
      ? rawText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "")
      : rawText;

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error(
        `[syllabus] Failed to parse AI response as JSON. First 500 chars:`,
        jsonText.slice(0, 500),
      );
      throw new Error(
        `AI returned invalid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
      );
    }

    const validated = syllabusTreeSchema.safeParse(parsedJson);
    if (!validated.success) {
      console.error(`[syllabus] Schema validation failed:`, validated.error.issues.slice(0, 5));
      throw new Error(
        `AI response did not match syllabus schema: ${validated.error.issues[0]?.message}`,
      );
    }

    const tree = validated.data;

    // 6. Clear existing nodes (for reparse)
    await db.delete(syllabusNodes).where(eq(syllabusNodes.syllabusId, syllabusId));

    // 7. Insert nodes into database
    let nodeCount = 0;

    for (let i = 0; i < tree.nodes.length; i++) {
      const count = await insertNodeRecursive(db, syllabusId, null, tree.nodes[i]!, i);
      nodeCount += count;
    }

    await job.updateProgress(90);

    // 8. Update syllabus status → parsed (preserve existing metadata like sourceUrl)
    const existingMeta = (syllabusRecord?.metadata as Record<string, unknown>) ?? {};
    await db
      .update(syllabi)
      .set({
        status: "parsed",
        extractionMethod: "claude-vision",
        metadata: {
          ...existingMeta,
          nodeCount,
          inputTokens,
          outputTokens,
          latencyMs,
          estimatedCostUsd: estimatedCost,
        },
        updatedAt: new Date(),
      })
      .where(eq(syllabi.id, syllabusId));

    await job.updateProgress(100);

    console.log(`[syllabus] Parsed ${nodeCount} nodes for syllabus ${syllabusId}`);

    return { nodeCount, method: "claude-vision" };
  } catch (error) {
    // Update status → error
    const errorMessage = error instanceof Error ? error.message : String(error);

    await db
      .update(syllabi)
      .set({
        status: "error",
        errorMessage,
        updatedAt: new Date(),
      })
      .where(eq(syllabi.id, syllabusId));

    throw error;
  }
}

// ─── PDF Download & Resolution ───

async function downloadAndResolvePdf(url: string, examName: string): Promise<Buffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`[syllabus] Download failed: ${response.status} ${response.statusText}`);
      return null;
    }

    let buffer = Buffer.from(await response.arrayBuffer());
    const header = buffer.subarray(0, 20).toString("utf-8");

    // If it's already a PDF, return directly
    if (header.startsWith("%PDF")) {
      console.log(`[syllabus] Direct PDF download: ${(buffer.length / 1024).toFixed(0)} KB`);
      return buffer;
    }

    // If it's HTML, try to find the real PDF link
    if (
      header.startsWith("<!DOCTYPE") ||
      header.startsWith("<html") ||
      header.startsWith("<HTML")
    ) {
      console.log(`[syllabus] Got HTML page, looking for actual PDF link...`);

      const htmlContent = buffer.toString("utf-8");
      const realPdfUrl = extractPdfLinkFromHtml(htmlContent, examName);

      if (!realPdfUrl) {
        console.log(`[syllabus] No valid PDF link found in HTML page`);
        return null;
      }

      console.log(`[syllabus] Found PDF link: ${realPdfUrl}`);

      const pdfResponse = await fetch(realPdfUrl);
      if (!pdfResponse.ok) {
        console.log(`[syllabus] Failed to fetch linked PDF: ${pdfResponse.status}`);
        return null;
      }

      buffer = Buffer.from(await pdfResponse.arrayBuffer());
      const pdfHeader = buffer.subarray(0, 5).toString("utf-8");
      if (!pdfHeader.startsWith("%PDF")) {
        console.log(`[syllabus] Linked URL did not return a PDF either`);
        return null;
      }

      console.log(`[syllabus] Downloaded real PDF: ${(buffer.length / 1024).toFixed(0)} KB`);
      return buffer;
    }

    console.log(`[syllabus] Unknown file format (not PDF, not HTML)`);
    return null;
  } catch (err) {
    console.error(`[syllabus] Download error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── HTML PDF Link Extraction ───

function extractPdfLinkFromHtml(html: string, examName?: string): string | null {
  // Check for 404 pages — these won't have the syllabus
  const htmlLower = html.toLowerCase();
  if (
    html.includes('<div class="big-title">404</div>') ||
    htmlLower.includes("<title>404") ||
    htmlLower.includes("page not found") ||
    htmlLower.includes("oops, page not found") ||
    htmlLower.includes("_exception_statuscode=404") ||
    /href="[^"]*404[^"]*page/i.test(html)
  ) {
    console.log(`[syllabus] HTML page is a 404 — syllabus URL is broken`);
    return null;
  }

  // Collect ALL PDF links from the page
  const pdfLinkRegex = /href=["']([^"']*\.pdf[^"']*)["']/gi;
  const allPdfLinks: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pdfLinkRegex.exec(html)) !== null) {
    if (match[1]) allPdfLinks.push(match[1]);
  }

  if (allPdfLinks.length === 0) {
    // Also check for embedded PDFs (iframe, embed, object)
    const embedRegex = /(?:src|data)=["']([^"']*\.pdf[^"']*)["']/gi;
    while ((match = embedRegex.exec(html)) !== null) {
      if (match[1]) allPdfLinks.push(match[1]);
    }
  }

  if (allPdfLinks.length === 0) {
    return null;
  }

  // Try to find the content area PDF links (not nav/header/footer)
  // Kerala PSC Drupal pages have content in class="node__content" or class="field--name-body"
  const contentAreaMatch = html.match(
    /class="(?:node__content|field--name-body)[^"]*"[^]*?<\/(?:div|article)>/is,
  );
  const contentHtml = contentAreaMatch?.[0] ?? "";

  // If the content area has PDF links, prefer those
  if (contentHtml) {
    const contentPdfLinks: string[] = [];
    const contentPdfRegex = /href=["']([^"']*\.pdf[^"']*)["']/gi;
    while ((match = contentPdfRegex.exec(contentHtml)) !== null) {
      if (match[1]) contentPdfLinks.push(match[1]);
    }
    if (contentPdfLinks.length > 0) {
      // If exam name provided, try to find a link matching the name
      const bestMatch = findBestPdfMatch(contentPdfLinks, examName);
      if (bestMatch) return resolveUrl(bestMatch);
    }
  }

  // Score and rank all PDF links
  const bestMatch = findBestPdfMatch(allPdfLinks, examName);
  if (bestMatch) return resolveUrl(bestMatch);

  // Last resort: skip header/nav PDFs (like authorised-signatory, favicon, logo)
  const navPdfPatterns = /authorised|signatory|logo|icon|favicon|banner|header|footer|search/i;
  const filteredLinks = allPdfLinks.filter((link) => !navPdfPatterns.test(link));
  if (filteredLinks.length > 0) {
    return resolveUrl(filteredLinks[0]!);
  }

  return null;
}

function findBestPdfMatch(pdfLinks: string[], examName?: string): string | null {
  if (pdfLinks.length === 0) return null;
  if (pdfLinks.length === 1) return pdfLinks[0]!;

  // Keywords that indicate a syllabus PDF
  const syllabusKeywords = /syllabus|curriculum|scheme|paper|subject/i;

  // Score each link
  const scored = pdfLinks.map((link) => {
    let score = 0;
    const lowerLink = link.toLowerCase();

    // Syllabus-related keywords in URL
    if (syllabusKeywords.test(lowerLink)) score += 10;

    // In /sites/default/files/ (Drupal content, not nav)
    if (lowerLink.includes("/sites/default/files/")) score += 3;

    // Exam name words in URL
    if (examName) {
      const nameWords = examName
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 3);
      for (const word of nameWords) {
        if (lowerLink.includes(word)) score += 5;
      }
    }

    // Penalize known non-syllabus patterns
    const penaltyPatterns =
      /authorised|signatory|logo|icon|favicon|banner|notification|order|circular|gazette/i;
    if (penaltyPatterns.test(lowerLink)) score -= 20;

    return { link, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Only return if the best score is positive (actually looks relevant)
  if (scored[0]!.score > 0) {
    return scored[0]!.link;
  }

  return null;
}

function resolveUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }

  const baseUrl = "https://www.keralapsc.gov.in";

  if (url.startsWith("/")) {
    return `${baseUrl}${url}`;
  }

  return `${baseUrl}/${url}`;
}

// ─── Recursive Node Insertion ───

async function insertNodeRecursive(
  db: Database,
  syllabusId: number,
  parentId: number | null,
  node: SyllabusNodeInput,
  sortOrder: number,
): Promise<number> {
  const [inserted] = await db
    .insert(syllabusNodes)
    .values({
      syllabusId,
      parentId,
      nodeType: node.type,
      title: node.title,
      description: node.description ?? null,
      content: node.content ?? null,
      sortOrder,
      depth: node.depth,
      keyTerms: node.key_terms,
      metadata: {},
    })
    .returning({ id: syllabusNodes.id });

  let count = 1;
  const nodeId = inserted!.id;

  if (node.children && node.children.length > 0) {
    for (let i = 0; i < node.children.length; i++) {
      count += await insertNodeRecursive(db, syllabusId, nodeId, node.children[i]!, i);
    }
  }

  return count;
}

// ─── Helpers ───

async function getExamName(db: Database, examId: string): Promise<string> {
  const [exam] = await db
    .select({ name: exams.name })
    .from(exams)
    .where(eq(exams.id, examId))
    .limit(1);

  return exam?.name ?? "Unknown Exam";
}
