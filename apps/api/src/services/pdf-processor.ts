import { z } from "zod";
import { generateObject } from "ai";
import { eq, and } from "drizzle-orm";
import { portalDocuments, questions, stagedQuestions } from "@examforge/shared/db/schema";
import {
  portalMCQSchema,
  answerKeySchema,
  descriptiveQuestionSchema,
} from "@examforge/shared/validators";
import type { Database } from "@examforge/shared/db";
import { getLanguageModel } from "../ai/providers.js";
import { routeAIRequest } from "../ai/ai-router.js";
import {
  buildMCQExtractionFromPDFPrompt,
  buildAnswerKeyExtractionPrompt,
  buildDescriptiveQuestionExtractionPrompt,
} from "../ai/prompts/portal-extraction.js";
import { logAICall } from "../ai/logger.js";
import { estimateCost } from "../ai/cost.js";

const MAX_PDF_SIZE = 50 * 1024 * 1024; // 50MB
const FETCH_TIMEOUT = 30_000;
const PDF_DOWNLOAD_DELAY = 2000; // Rate-limit: 2s between downloads

// Max PDF size for vision-based extraction (Anthropic supports up to 32MB PDFs)
const MAX_VISION_PDF_SIZE = 30 * 1024 * 1024; // 30MB
// Text quality threshold: if pdf-parse yields < this many chars, use vision
const MIN_TEXT_QUALITY_LENGTH = 200;

/**
 * Extract all hyperlink URLs from a PDF buffer.
 * PDF annotations contain /URI (http://...) or /URI <hex> patterns.
 * This parses the raw PDF bytes to find them — no external library needed.
 */
function extractHyperlinksFromPdf(pdfBuffer: Buffer): string[] {
  const text = pdfBuffer.toString("latin1"); // latin1 preserves byte values
  const urls: Set<string> = new Set();

  // Pattern 1: /URI (http://...) or /URI (https://...)
  const uriParenRegex = /\/URI\s*\(([^)]+)\)/gi;
  let match: RegExpExecArray | null;
  while ((match = uriParenRegex.exec(text)) !== null) {
    const url = match[1]?.trim();
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      urls.add(url);
    }
  }

  // Pattern 2: /URI <hex encoded>
  const uriHexRegex = /\/URI\s*<([0-9A-Fa-f]+)>/gi;
  while ((match = uriHexRegex.exec(text)) !== null) {
    if (match[1]) {
      try {
        const url = Buffer.from(match[1], "hex").toString("utf-8").trim();
        if (url.startsWith("http://") || url.startsWith("https://")) {
          urls.add(url);
        }
      } catch {
        // Invalid hex
      }
    }
  }

  // Pattern 3: /A << /URI (url) >> style
  const aUriRegex = /\/A\s*<<[^>]*\/URI\s*\(([^)]+)\)[^>]*>>/gi;
  while ((match = aUriRegex.exec(text)) !== null) {
    const url = match[1]?.trim();
    if (url && (url.startsWith("http://") || url.startsWith("https://"))) {
      urls.add(url);
    }
  }

  return [...urls];
}

export type ProcessPDFParams = {
  documentId: string;
  pdfUrl: string;
  documentType: string;
  examName: string;
  examYear?: number;
  examId?: string;
  paperNumber?: string;
  userId: string;
  orgId: string;
  staging?: boolean; // When true, write to staged_questions instead of questions
};

export type ProcessingResult = {
  success: boolean;
  questionsExtracted: number;
  answersMatched: number;
  error?: string;
};

export async function processPDF(
  params: ProcessPDFParams,
  db: Database,
): Promise<ProcessingResult> {
  const {
    documentId,
    pdfUrl,
    documentType,
    examName,
    examYear,
    examId,
    paperNumber,
    userId,
    orgId,
    staging = false,
  } = params;

  try {
    // ─── Step 1: Download PDF ───
    await updateDocStatus(db, documentId, "downloading");

    const pdfBuffer = await downloadPDF(pdfUrl);
    const fileSizeBytes = pdfBuffer.byteLength;

    await db
      .update(portalDocuments)
      .set({
        fileSizeBytes,
        processingStatus: "downloaded",
        updatedAt: new Date(),
      })
      .where(eq(portalDocuments.id, documentId));

    // ─── Step 2: Extract text (try pdf-parse first, then decide extraction method) ───
    await updateDocStatus(db, documentId, "extracting");

    const rawText = await extractTextFromPDF(pdfBuffer);
    const textIsUsable = rawText.trim().length >= MIN_TEXT_QUALITY_LENGTH;

    // Decide extraction method: vision (PDF sent directly to Claude) or text-based
    const useVision = !textIsUsable || fileSizeBytes <= MAX_VISION_PDF_SIZE;
    const extractionMethod = useVision ? "claude-vision" : "pdf-parse";

    const pageCount = textIsUsable
      ? estimatePageCount(rawText)
      : Math.max(1, Math.ceil(fileSizeBytes / 50_000)); // Rough estimate from file size

    await db
      .update(portalDocuments)
      .set({
        rawText: textIsUsable ? rawText : "(extracted via vision)",
        pageCount,
        extractionMethod,
        updatedAt: new Date(),
      })
      .where(eq(portalDocuments.id, documentId));

    if (!textIsUsable && fileSizeBytes > MAX_VISION_PDF_SIZE) {
      await updateDocStatus(
        db,
        documentId,
        "error",
        "PDF too large for vision and text extraction failed",
      );
      return {
        success: false,
        questionsExtracted: 0,
        answersMatched: 0,
        error: "PDF too large for vision extraction",
      };
    }

    // ─── Step 3: AI Processing based on document type ───
    const context = { examName, examYear, examId, paperNumber, userId, orgId, staging };
    let result: ProcessingResult;

    switch (documentType) {
      case "question_paper_mcq":
        result = useVision
          ? await processMCQPaperVision(db, documentId, pdfBuffer, context)
          : await processMCQPaper(db, documentId, rawText, context);
        break;
      case "question_paper_descriptive":
        result = useVision
          ? await processDescriptivePaperVision(db, documentId, pdfBuffer, context)
          : await processDescriptivePaper(db, documentId, rawText, context);
        break;
      case "answer_key_omr":
      case "answer_key_online":
        result = useVision
          ? await processAnswerKeyVision(db, documentId, pdfBuffer, {
              ...context,
              type: documentType === "answer_key_omr" ? "omr" : "online",
            })
          : await processAnswerKey(db, documentId, rawText, {
              ...context,
              type: documentType === "answer_key_omr" ? "omr" : "online",
            });
        break;
      case "examination_schedule":
        result = useVision
          ? await processExaminationScheduleVision(db, documentId, pdfBuffer, context)
          : await processExaminationScheduleText(db, documentId, rawText, context);
        break;
      case "syllabus":
        await updateDocStatus(db, documentId, "processed");
        result = { success: true, questionsExtracted: 0, answersMatched: 0 };
        break;
      case "notification":
        await updateDocStatus(db, documentId, "processed");
        result = { success: true, questionsExtracted: 0, answersMatched: 0 };
        break;
      default:
        await updateDocStatus(db, documentId, "processed");
        result = { success: true, questionsExtracted: 0, answersMatched: 0 };
    }

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[pdf-processor] Error processing ${documentId}:`, errorMsg);
    await updateDocStatus(db, documentId, "error", errorMsg);
    return { success: false, questionsExtracted: 0, answersMatched: 0, error: errorMsg };
  }
}

// ─── Download PDF ───

async function downloadPDF(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; ExamForge/1.0; +https://examforge.app)",
      Accept: "application/pdf,*/*",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
  });

  if (!response.ok) {
    throw new Error(`Failed to download PDF: ${response.status} ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (arrayBuffer.byteLength > MAX_PDF_SIZE) {
    throw new Error(`PDF exceeds maximum size of ${MAX_PDF_SIZE / 1024 / 1024}MB`);
  }

  return Buffer.from(arrayBuffer);
}

// ─── Extract text from PDF (fallback/supplementary) ───

async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = (await import("pdf-parse")) as unknown as {
      PDFParse: new (opts: { data: Uint8Array }) => {
        load(): Promise<void>;
        getText(): Promise<{ text: string; pages: string[]; total: number }>;
        destroy(): Promise<void>;
      };
    };

    const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
    await parser.load();
    const result = await parser.getText();
    await parser.destroy();
    return result.text ?? "";
  } catch (err) {
    console.warn("[pdf-processor] pdf-parse failed, returning empty text:", err);
    return "";
  }
}

function estimatePageCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / 3000));
}

// ─── Vision-based extraction helper ───
// Sends the PDF directly to Claude as a file attachment for high-accuracy extraction

async function callVisionExtraction<T extends z.ZodTypeAny>(
  pdfBuffer: Buffer,
  schema: T,
  systemPrompt: string,
  userPrompt: string,
  userId: string,
  db: Database,
): Promise<{ data: z.infer<T>; usage: { inputTokens: number; outputTokens: number } }> {
  const model = getLanguageModel("anthropic", "claude-sonnet-4-20250514");
  const startTime = Date.now();

  const response = await generateObject({
    model,
    schema,
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
            text: userPrompt,
          },
        ],
      },
    ],
    system: systemPrompt,
    temperature: 0.1,
  });

  const latencyMs = Date.now() - startTime;
  const inputTokens = response.usage.inputTokens ?? 0;
  const outputTokens = response.usage.outputTokens ?? 0;
  const cost = estimateCost("claude-sonnet-4-20250514", inputTokens, outputTokens);

  await logAICall(db, {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    feature: "scrape",
    inputTokens,
    outputTokens,
    latencyMs,
    estimatedCostUsd: cost,
    userId,
  });

  console.log(
    `[pdf-processor] Vision extraction: ${inputTokens} in / ${outputTokens} out, ${latencyMs}ms, $${cost.toFixed(4)}`,
  );

  return {
    data: response.object,
    usage: { inputTokens, outputTokens },
  };
}

// ─── Processing Context ───

type ProcessingContext = {
  examName: string;
  examYear?: number;
  examId?: string;
  paperNumber?: string;
  userId: string;
  orgId: string;
  staging: boolean;
};

// ─── MCQ Paper Processing (Vision) ───

async function processMCQPaperVision(
  db: Database,
  documentId: string,
  pdfBuffer: Buffer,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const systemPrompt = `You extract MCQ questions from Indian competitive exam question papers (PDF).
These PDFs contain numbered questions with 4 options (A-D).
Sometimes bilingual (English + Malayalam/Hindi), sometimes with diagrams.
You can SEE the PDF pages directly — use the visual layout to accurately extract each question.`;

  const prompt = `Extract ALL MCQ questions from this question paper PDF.

Exam: ${context.examName}
Year: ${context.examYear ?? "Unknown"}
Paper: ${context.paperNumber ?? "Single paper"}

Rules:
1. Extract EVERY question — do not skip any
2. Preserve the original question number
3. Each question: { questionNumber, question, options (array of 4 strings), answer: -1, subject, difficulty }
4. If bilingual: extract the English version
5. If a question references an image/diagram: note "[Diagram: description]" in the question text
6. Classify each question's subject based on content
7. Difficulty: estimate based on concept complexity (easy/medium/hard)
8. Do NOT guess answers — set answer to -1 (answer keys are processed separately)

Return results as { "questions": [...] }`;

  const wrappedSchema = z.object({ questions: z.array(portalMCQSchema) });

  const aiResult = await callVisionExtraction(
    pdfBuffer,
    wrappedSchema,
    systemPrompt,
    prompt,
    context.userId,
    db,
  );

  return saveMCQResults(db, documentId, aiResult.data.questions, context);
}

// ─── MCQ Paper Processing (Text) ───

async function processMCQPaper(
  db: Database,
  documentId: string,
  rawText: string,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { systemPrompt, prompt } = buildMCQExtractionFromPDFPrompt(rawText, {
    examName: context.examName,
    year: context.examYear,
    paperNumber: context.paperNumber,
  });

  const wrappedSchema = z.object({ questions: z.array(portalMCQSchema) });

  const aiResult = await routeAIRequest(
    {
      task: "extract_mcq_from_pdf",
      prompt,
      systemPrompt,
      schema: wrappedSchema,
      userId: context.userId,
      skipCache: true,
      temperature: 0.1,
    },
    db,
  );

  return saveMCQResults(db, documentId, aiResult.data.questions, context);
}

// ─── Shared MCQ save logic ───

async function saveMCQResults(
  db: Database,
  documentId: string,
  mcqs: z.infer<typeof portalMCQSchema>[],
  context: ProcessingContext,
): Promise<ProcessingResult> {
  let saved = 0;

  if (context.staging) {
    for (const mcq of mcqs) {
      await db.insert(stagedQuestions).values({
        portalDocumentId: documentId,
        examId: context.examId ?? undefined,
        suggestedExamName: context.examName,
        type: "mcq",
        content: {
          type: "mcq",
          question: mcq.question,
          options: mcq.options,
          answer: mcq.answer,
          explanation: "",
        },
        subject: mcq.subject,
        difficulty: mcq.difficulty ?? "medium",
        source: context.examName,
        paperYear: context.examYear ?? null,
        paperNumber: context.paperNumber ?? null,
        questionNumber: mcq.questionNumber,
        reviewStatus: "pending",
        orgId: context.orgId,
        metadata: { extractedFrom: "portal_ingestion" },
      });
      saved++;
    }
  } else {
    for (const mcq of mcqs) {
      if (!context.examId) continue;

      const existing = await db
        .select({ id: questions.id })
        .from(questions)
        .where(
          and(
            eq(questions.examId, context.examId),
            eq(questions.questionNumber, mcq.questionNumber),
            ...(context.examYear ? [eq(questions.paperYear, context.examYear)] : []),
          ),
        )
        .limit(1);

      if (existing.length > 0) continue;

      await db.insert(questions).values({
        examId: context.examId,
        type: "mcq",
        content: {
          type: "mcq",
          question: mcq.question,
          options: mcq.options,
          answer: mcq.answer,
          explanation: "",
        },
        subject: mcq.subject,
        difficulty: mcq.difficulty ?? "medium",
        source: context.examName,
        portalDocumentId: documentId,
        paperYear: context.examYear ?? null,
        paperNumber: context.paperNumber ?? null,
        questionNumber: mcq.questionNumber,
        metadata: { extractedFrom: "portal_ingestion" },
      });
      saved++;
    }
  }

  await db
    .update(portalDocuments)
    .set({
      questionsExtracted: saved,
      processingStatus: "processed",
      updatedAt: new Date(),
    })
    .where(eq(portalDocuments.id, documentId));

  return { success: true, questionsExtracted: saved, answersMatched: 0 };
}

// ─── Descriptive Paper Processing (Vision) ───

async function processDescriptivePaperVision(
  db: Database,
  documentId: string,
  pdfBuffer: Buffer,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const systemPrompt = `You extract descriptive (essay/written) exam questions from question paper PDFs.
These are NOT MCQ — they require written answers with specific marks per question.
You can SEE the PDF pages directly — use the visual layout accurately.`;

  const prompt = `Extract all descriptive questions from this paper PDF.

Exam: ${context.examName}
Year: ${context.examYear ?? "Unknown"}

For each question extract:
1. questionNumber: original number
2. question: full question text
3. marks: marks allocated
4. section: which section/part (if paper has parts)
5. type: essay | short_answer | problem | case_study
6. subject: classify the subject area
7. subQuestions: if the question has parts (a, b, c), extract each with { label, question, marks }

Return results as { "questions": [...] }`;

  const wrappedSchema = z.object({ questions: z.array(descriptiveQuestionSchema) });

  const aiResult = await callVisionExtraction(
    pdfBuffer,
    wrappedSchema,
    systemPrompt,
    prompt,
    context.userId,
    db,
  );

  return saveDescriptiveResults(db, documentId, aiResult.data.questions, context);
}

// ─── Descriptive Paper Processing (Text) ───

async function processDescriptivePaper(
  db: Database,
  documentId: string,
  rawText: string,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { systemPrompt, prompt } = buildDescriptiveQuestionExtractionPrompt(rawText, {
    examName: context.examName,
    year: context.examYear,
  });

  const wrappedSchema = z.object({
    questions: z.array(descriptiveQuestionSchema),
  });

  const aiResult = await routeAIRequest(
    {
      task: "extract_descriptive_questions",
      prompt,
      systemPrompt,
      schema: wrappedSchema,
      userId: context.userId,
      skipCache: true,
      temperature: 0.1,
    },
    db,
  );

  return saveDescriptiveResults(db, documentId, aiResult.data.questions, context);
}

// ─── Shared descriptive save logic ───

async function saveDescriptiveResults(
  db: Database,
  documentId: string,
  descriptiveQuestions: z.infer<typeof descriptiveQuestionSchema>[],
  context: ProcessingContext,
): Promise<ProcessingResult> {
  let saved = 0;

  if (context.staging) {
    for (const dq of descriptiveQuestions) {
      await db.insert(stagedQuestions).values({
        portalDocumentId: documentId,
        examId: context.examId ?? undefined,
        suggestedExamName: context.examName,
        type: "descriptive",
        content: {
          type: "descriptive",
          question: dq.question,
          marks: dq.marks,
          section: dq.section,
          questionType: dq.type,
          subQuestions: dq.subQuestions,
        },
        subject: dq.subject,
        difficulty: "medium",
        source: context.examName,
        paperYear: context.examYear ?? null,
        paperNumber: context.paperNumber ?? null,
        questionNumber: dq.questionNumber,
        reviewStatus: "pending",
        orgId: context.orgId,
        metadata: { extractedFrom: "portal_ingestion", descriptive: true },
      });
      saved++;
    }
  } else {
    for (const dq of descriptiveQuestions) {
      if (!context.examId) continue;

      const existing = await db
        .select({ id: questions.id })
        .from(questions)
        .where(
          and(
            eq(questions.examId, context.examId),
            eq(questions.questionNumber, dq.questionNumber),
            ...(context.examYear ? [eq(questions.paperYear, context.examYear)] : []),
          ),
        )
        .limit(1);

      if (existing.length > 0) continue;

      await db.insert(questions).values({
        examId: context.examId,
        type: "mcq", // Questions table uses "mcq" as type; content.type distinguishes descriptive
        content: {
          type: "descriptive",
          question: dq.question,
          marks: dq.marks,
          section: dq.section,
          questionType: dq.type,
          subQuestions: dq.subQuestions,
        },
        subject: dq.subject,
        difficulty: "medium",
        source: context.examName,
        portalDocumentId: documentId,
        paperYear: context.examYear ?? null,
        paperNumber: context.paperNumber ?? null,
        questionNumber: dq.questionNumber,
        metadata: { extractedFrom: "portal_ingestion", descriptive: true },
      });
      saved++;
    }
  }

  await db
    .update(portalDocuments)
    .set({
      questionsExtracted: saved,
      processingStatus: "processed",
      updatedAt: new Date(),
    })
    .where(eq(portalDocuments.id, documentId));

  return { success: true, questionsExtracted: saved, answersMatched: 0 };
}

// ─── Answer Key Processing (Vision) ───

async function processAnswerKeyVision(
  db: Database,
  documentId: string,
  pdfBuffer: Buffer,
  context: ProcessingContext & { type: "omr" | "online" },
): Promise<ProcessingResult> {
  const systemPrompt = `You extract answer keys from Indian exam OMR/online answer key PDFs.
These typically contain: question number to correct option (A/B/C/D or 1/2/3/4).
You can SEE the PDF pages directly — use the visual layout for accurate extraction.`;

  const prompt = `Extract the answer key from this PDF document.

Exam: ${context.examName}
Year: ${context.examYear ?? "Unknown"}
Type: ${context.type}

Rules:
1. Extract EVERY question number and answer mapping
2. Answers may be: A/B/C/D, 1/2/3/4, or (A)/(B)/(C)/(D)
3. Normalize to 0-indexed: A/1 = 0, B/2 = 1, C/3 = 2, D/4 = 3
4. Some answer keys have multiple series (A, B, C, D booklet codes) — extract all series
5. If a question is "cancelled" or "bonus", note it with answer = -2

OUTPUT: JSON matching { series, answers: [{ questionNumber, answer }] }`;

  const wrappedSchema = z.object({ result: answerKeySchema });

  const aiResult = await callVisionExtraction(
    pdfBuffer,
    wrappedSchema,
    systemPrompt,
    prompt,
    context.userId,
    db,
  );

  return saveAnswerKeyResults(db, documentId, aiResult.data.result, context);
}

// ─── Answer Key Processing (Text) ───

async function processAnswerKey(
  db: Database,
  documentId: string,
  rawText: string,
  context: ProcessingContext & { type: "omr" | "online" },
): Promise<ProcessingResult> {
  const { systemPrompt, prompt } = buildAnswerKeyExtractionPrompt(rawText, {
    examName: context.examName,
    year: context.examYear,
    type: context.type,
  });

  const wrappedAnswerKeySchema = z.object({ result: answerKeySchema });

  const aiResult = await routeAIRequest(
    {
      task: "extract_answer_key",
      prompt,
      systemPrompt,
      schema: wrappedAnswerKeySchema,
      userId: context.userId,
      skipCache: true,
      temperature: 0.1,
    },
    db,
  );

  return saveAnswerKeyResults(db, documentId, aiResult.data.result, context);
}

// ─── Shared answer key save logic ───

async function saveAnswerKeyResults(
  db: Database,
  documentId: string,
  answerKey: z.infer<typeof answerKeySchema>,
  context: ProcessingContext & { type: "omr" | "online" },
): Promise<ProcessingResult> {
  if (context.staging) {
    await db
      .update(portalDocuments)
      .set({
        processingStatus: "processed",
        metadata: {
          answerKey: {
            series: answerKey.series,
            answers: answerKey.answers,
          },
        },
        updatedAt: new Date(),
      })
      .where(eq(portalDocuments.id, documentId));

    return {
      success: true,
      questionsExtracted: 0,
      answersMatched: answerKey.answers.length,
    };
  }

  let matched = 0;

  if (!context.examId) {
    await updateDocStatus(db, documentId, "processed");
    return { success: true, questionsExtracted: 0, answersMatched: 0 };
  }

  for (const entry of answerKey.answers) {
    if (entry.answer < 0) continue;

    const [question] = await db
      .select({ id: questions.id, content: questions.content })
      .from(questions)
      .where(
        and(
          eq(questions.examId, context.examId),
          eq(questions.questionNumber, entry.questionNumber),
          ...(context.examYear ? [eq(questions.paperYear, context.examYear)] : []),
        ),
      )
      .limit(1);

    if (!question) continue;

    const updatedContent = {
      ...(question.content as Record<string, unknown>),
      answer: entry.answer,
    };

    await db
      .update(questions)
      .set({ content: updatedContent, updatedAt: new Date() })
      .where(eq(questions.id, question.id));

    matched++;
  }

  await db
    .update(portalDocuments)
    .set({
      answersMatched: matched,
      processingStatus: "processed",
      updatedAt: new Date(),
    })
    .where(eq(portalDocuments.id, documentId));

  return { success: true, questionsExtracted: 0, answersMatched: matched };
}

// ─── Examination Schedule Processing (Vision) ───

const examinationEntrySchema = z.object({
  examName: z.string().describe("Full name of the examination"),
  postName: z.string().optional().describe("Name of the post / position"),
  categoryNumber: z.string().optional().describe("Category number if any"),
  examDate: z
    .string()
    .optional()
    .describe("Exam date as string (e.g. '2026-03-15' or 'March 2026')"),
  examTime: z.string().optional().describe("Exam time if specified"),
  venue: z.string().optional().describe("Exam venue/centre if mentioned"),
  department: z.string().optional().describe("Department name"),
  stage: z.string().optional().describe("Stage of exam: preliminary, main, interview, etc."),
  status: z.string().optional().describe("Status: scheduled, postponed, cancelled, completed"),
  remarks: z.string().optional().describe("Any additional notes"),
  syllabusUrl: z
    .string()
    .optional()
    .describe("URL link to syllabus PDF if present in the document"),
});

const examinationScheduleSchema = z.object({
  examinations: z.array(examinationEntrySchema),
});

async function processExaminationScheduleVision(
  db: Database,
  documentId: string,
  pdfBuffer: Buffer,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const systemPrompt = `You extract examination schedule and notification details from Indian public service commission PDFs.
These documents list upcoming or recent exams with details like exam name, date, category number, post name, department.
They are NOT question papers. Extract the structured schedule data.
You can SEE the PDF pages directly — use the visual layout for accurate extraction.`;

  const prompt = `Extract ALL examination entries from this schedule/notification PDF.

Portal: ${context.examName}

For each examination entry, extract:
1. examName: full name of the examination
2. postName: name of the post/position (if mentioned)
3. categoryNumber: category number (e.g., "123/2025")
4. examDate: date of exam (any format, e.g., "15-03-2026" or "March 2026")
5. examTime: time of exam if specified
6. venue: venue/centre if mentioned
7. department: the department
8. stage: preliminary | main | interview | descriptive | OMR (if specified)
9. status: scheduled | postponed | cancelled | completed
10. remarks: any additional notes
11. syllabusUrl: if there is a link/URL to a syllabus PDF for this exam, extract the full URL

Return results as { "examinations": [...] }`;

  const aiResult = await callVisionExtraction(
    pdfBuffer,
    examinationScheduleSchema,
    systemPrompt,
    prompt,
    context.userId,
    db,
  );

  // Extract actual hyperlink URLs from the PDF binary
  const pdfHyperlinks = extractHyperlinksFromPdf(pdfBuffer);
  const syllabusLinks = pdfHyperlinks.filter(
    (url) => url.toLowerCase().includes("syllabus") || url.toLowerCase().includes(".pdf"),
  );

  console.log(
    `[pdf-processor] Found ${pdfHyperlinks.length} hyperlinks in PDF, ${syllabusLinks.length} syllabus-related`,
  );
  if (syllabusLinks.length > 0) {
    console.log(`[pdf-processor] Syllabus links:`, syllabusLinks.slice(0, 10));
  }

  // Merge hyperlinks into examination entries
  const enrichedExams = mergeHyperlinksIntoEntries(aiResult.data.examinations, syllabusLinks);

  return saveExaminationResults(db, documentId, enrichedExams);
}

async function processExaminationScheduleText(
  db: Database,
  documentId: string,
  rawText: string,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const systemPrompt = `You extract examination schedule and notification details from Indian public service commission documents.
These documents list upcoming or recent exams with details like exam name, date, category number, post name, department.
They are NOT question papers — do NOT extract questions.`;

  const prompt = `Extract ALL examination entries from the following text:

---
${rawText.slice(0, 15000)}
---

For each examination entry, extract:
1. examName, postName, categoryNumber, examDate, examTime, venue, department, stage, status, remarks, syllabusUrl (if a syllabus PDF link exists)

Return results as { "examinations": [...] }`;

  const wrappedSchema = examinationScheduleSchema;

  const aiResult = await routeAIRequest(
    {
      task: "extract_examination_schedule",
      prompt,
      systemPrompt,
      schema: wrappedSchema,
      userId: context.userId,
      skipCache: true,
      temperature: 0.1,
    },
    db,
  );

  return saveExaminationResults(db, documentId, aiResult.data.examinations);
}

/**
 * Merge extracted PDF hyperlinks into examination entries.
 * Matches link URLs to exam entries by fuzzy name matching.
 * If only one syllabus link exists, it's treated as shared (generic page).
 * If multiple specific links exist, each is matched to the best exam entry.
 */
function mergeHyperlinksIntoEntries(
  examinations: z.infer<typeof examinationEntrySchema>[],
  syllabusLinks: string[],
): z.infer<typeof examinationEntrySchema>[] {
  if (syllabusLinks.length === 0) return examinations;

  // Filter out clearly generic links (just /syllabus or /syllabi pages)
  const specificLinks = syllabusLinks.filter((url) => {
    const path = new URL(url).pathname.toLowerCase();
    return !/^\/?(syllabus|syllabi|index\.php\/syllabus\d*)$/i.test(path);
  });

  // If only generic links, assign the generic link to all entries as-is
  if (specificLinks.length === 0) {
    return examinations.map((e) => ({
      ...e,
      syllabusUrl: e.syllabusUrl || syllabusLinks[0],
    }));
  }

  // For each exam entry, find the best matching specific link
  return examinations.map((entry) => {
    // If the entry already has a specific (non-generic) URL, keep it
    if (
      entry.syllabusUrl &&
      entry.syllabusUrl.startsWith("http") &&
      entry.syllabusUrl.includes(".pdf")
    ) {
      return entry;
    }

    // Extract meaningful words from exam name
    const stopWords = new Set(["the", "and", "for", "from", "in", "of", "to", "on"]);
    const nameWords = entry.examName
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    // Also include post name words
    if (entry.postName) {
      const postWords = entry.postName
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !stopWords.has(w));
      nameWords.push(...postWords);
    }

    // Score each specific link
    let bestLink: string | null = null;
    let bestScore = 0;

    for (const link of specificLinks) {
      const decodedPath = decodeURIComponent(new URL(link).pathname)
        .toLowerCase()
        .replace(/[_\-./]/g, " ");

      let score = 0;
      for (const word of nameWords) {
        if (decodedPath.includes(word)) score += 1;
      }

      // Require at least 2 word matches to avoid false positives
      if (score >= 2 && score > bestScore) {
        bestScore = score;
        bestLink = link;
      }
    }

    // If a single specific link and many entries — it might be the one for all
    if (!bestLink && specificLinks.length === 1) {
      bestLink = specificLinks[0] ?? null;
    }

    return {
      ...entry,
      syllabusUrl: bestLink || entry.syllabusUrl,
    };
  });
}

async function saveExaminationResults(
  db: Database,
  documentId: string,
  examinations: z.infer<typeof examinationEntrySchema>[],
): Promise<ProcessingResult> {
  await db
    .update(portalDocuments)
    .set({
      processingStatus: "processed",
      questionsExtracted: examinations.length,
      metadata: {
        type: "examination_schedule",
        examinations,
      },
      updatedAt: new Date(),
    })
    .where(eq(portalDocuments.id, documentId));

  console.log(
    `[pdf-processor] Examination schedule extracted: ${examinations.length} entries from document ${documentId}`,
  );

  return { success: true, questionsExtracted: examinations.length, answersMatched: 0 };
}

// ─── Helpers ───

async function updateDocStatus(
  db: Database,
  documentId: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  await db
    .update(portalDocuments)
    .set({
      processingStatus: status,
      ...(errorMessage ? { errorMessage } : {}),
      updatedAt: new Date(),
    })
    .where(eq(portalDocuments.id, documentId));
}

export { PDF_DOWNLOAD_DELAY };
