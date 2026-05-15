import { eq } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { creatorContent, contentEmbeddings } from "@examforge/shared/db/schema";
import { routeEmbedRequest } from "../ai/ai-router.js";

const MAX_TOKENS_PER_CHUNK = 500;
const OVERLAP_TOKENS = 50;
const EMBED_BATCH_SIZE = 50;

// Rough token estimate — 1 token ≈ 4 chars for English. Good enough for
// chunk sizing; the real token count comes back from OpenAI's response.
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

type CreatorContentRow = typeof creatorContent.$inferSelect;

/** Per-content extraction provenance — useful for worker logs so we can
 *  see exactly which sources produced text (or why the content yielded 0
 *  chunks). */
export type ExtractionSources = {
  title: boolean;
  description: boolean;
  body: boolean;
  aiSummary: boolean;
  aiTranscript: boolean;
  mediaExtractedText: number; // count of media items contributing text
};

export function extractTextForContent(content: CreatorContentRow): {
  text: string;
  sources: ExtractionSources;
} {
  const parts: string[] = [];
  const sources: ExtractionSources = {
    title: false,
    description: false,
    body: false,
    aiSummary: false,
    aiTranscript: false,
    mediaExtractedText: 0,
  };

  if (content.title) {
    parts.push(content.title);
    sources.title = true;
  }
  if (content.description) {
    parts.push(content.description);
    sources.description = true;
  }
  if (content.body) {
    parts.push(content.body);
    sources.body = true;
  }
  // aiTranscript is populated for video/audio by a transcription worker
  // (not yet built — see PR notes). When present, prefer it.
  if (content.aiTranscript) {
    parts.push(content.aiTranscript);
    sources.aiTranscript = true;
  }
  if (content.aiSummary) {
    parts.push(content.aiSummary);
    sources.aiSummary = true;
  }
  // OCR worker populates metadata.mediaItems[i].extractedText for documents
  // and images. Treat each as an additional source so a PDF inside an
  // otherwise-empty content piece still produces chunks.
  const meta = content.metadata;
  if (meta !== null && typeof meta === "object") {
    const raw = (meta as { mediaItems?: unknown }).mediaItems;
    if (Array.isArray(raw)) {
      for (const m of raw) {
        if (m !== null && typeof m === "object") {
          const text = (m as { extractedText?: unknown }).extractedText;
          if (typeof text === "string" && text.trim().length > 0) {
            parts.push(text);
            sources.mediaExtractedText++;
          }
        }
      }
    }
  }

  return {
    text: parts
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .join("\n\n"),
    sources,
  };
}

export function chunkText(
  text: string,
  opts: { maxTokens: number; overlap: number } = {
    maxTokens: MAX_TOKENS_PER_CHUNK,
    overlap: OVERLAP_TOKENS,
  },
): string[] {
  if (!text.trim()) return [];
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [];

  const chunks: string[] = [];
  let buf: string[] = [];
  let bufTokens = 0;

  const flush = (): void => {
    if (buf.length > 0) {
      chunks.push(buf.join("\n\n"));
    }
  };

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (paraTokens > opts.maxTokens) {
      // Paragraph alone exceeds the chunk budget — flush, then split by
      // sentence boundary and emit sentence-grouped chunks.
      flush();
      buf = [];
      bufTokens = 0;
      const sentences = para.split(/(?<=[.!?])\s+/);
      let sBuf: string[] = [];
      let sBufTokens = 0;
      for (const s of sentences) {
        const sTokens = estimateTokens(s);
        if (sBufTokens + sTokens > opts.maxTokens && sBuf.length > 0) {
          chunks.push(sBuf.join(" "));
          sBuf = [s];
          sBufTokens = sTokens;
        } else {
          sBuf.push(s);
          sBufTokens += sTokens;
        }
      }
      if (sBuf.length > 0) {
        chunks.push(sBuf.join(" "));
      }
      continue;
    }

    if (bufTokens + paraTokens > opts.maxTokens && buf.length > 0) {
      flush();
      // Overlap: carry the last paragraph forward.
      const last = buf[buf.length - 1] ?? "";
      const lastTokens = estimateTokens(last);
      if (lastTokens <= opts.overlap * 4) {
        buf = [last, para];
        bufTokens = lastTokens + paraTokens;
      } else {
        buf = [para];
        bufTokens = paraTokens;
      }
    } else {
      buf.push(para);
      bufTokens += paraTokens;
    }
  }

  flush();
  return chunks;
}

export async function upsertContentEmbeddings(
  db: Database,
  contentId: string,
): Promise<{
  chunks: number;
  skipped: boolean;
  reason?: string;
  sources?: ExtractionSources;
}> {
  const [content] = await db
    .select()
    .from(creatorContent)
    .where(eq(creatorContent.id, contentId))
    .limit(1);

  if (!content) {
    return { chunks: 0, skipped: true, reason: "content_not_found" };
  }

  const { text, sources } = extractTextForContent(content);
  if (!text.trim()) {
    // Nothing embed-able yet — common for audio/video before any
    // transcription worker has populated aiTranscript, or a document
    // before OCR ran.
    return { chunks: 0, skipped: true, reason: "no_text", sources };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { chunks: 0, skipped: true, reason: "empty_after_chunking", sources };
  }

  // Idempotent: wipe existing rows for this content first. Cheaper and
  // simpler than diffing; embeddings are cheap to regenerate.
  await db.delete(contentEmbeddings).where(eq(contentEmbeddings.contentId, contentId));

  const allEmbeddings: number[][] = [];
  const tokensPerChunk: number[] = [];

  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const batch = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const result = await routeEmbedRequest(
      {
        task: "embed_text",
        texts: batch,
        userId: "system",
        examId: content.examId ?? undefined,
        feature: "rag-embed",
      },
      db,
    );
    allEmbeddings.push(...result.embeddings);

    // OpenAI returns total tokens for the batch — distribute proportionally
    // to per-chunk char length so per-row tokenCount is meaningful for cost
    // analytics. Sum will equal the total batch tokens.
    const totalChars = batch.reduce((sum, t) => sum + t.length, 0);
    let allocated = 0;
    batch.forEach((t, idx) => {
      const isLast = idx === batch.length - 1;
      const tokens = isLast
        ? Math.max(0, result.usage.totalTokens - allocated)
        : Math.round(result.usage.totalTokens * (t.length / Math.max(totalChars, 1)));
      tokensPerChunk.push(tokens);
      allocated += tokens;
    });
  }

  await db.insert(contentEmbeddings).values(
    chunks.map((sourceText, idx) => ({
      contentId,
      syllabusNodeId: content.syllabusNodeId,
      chunkIndex: idx,
      sourceText,
      embedding: allEmbeddings[idx],
      tokenCount: tokensPerChunk[idx] ?? 0,
    })),
  );

  return { chunks: chunks.length, skipped: false, sources };
}
