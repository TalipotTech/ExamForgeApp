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

export function extractTextForContent(content: CreatorContentRow): string {
  // For v1: title + description + body + aiTranscript + aiSummary.
  // metadata.mediaItems (image OCR text) is out of scope until the
  // metadata JSONB shape is formally typed in a follow-up.
  const parts: string[] = [];
  if (content.title) parts.push(content.title);
  if (content.description) parts.push(content.description);
  if (content.body) parts.push(content.body);
  if (content.aiTranscript) parts.push(content.aiTranscript);
  if (content.aiSummary) parts.push(content.aiSummary);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .join("\n\n");
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
): Promise<{ chunks: number; skipped: boolean; reason?: string }> {
  const [content] = await db
    .select()
    .from(creatorContent)
    .where(eq(creatorContent.id, contentId))
    .limit(1);

  if (!content) {
    return { chunks: 0, skipped: true, reason: "content_not_found" };
  }

  const text = extractTextForContent(content);
  if (!text.trim()) {
    // Nothing embed-able yet — e.g. video without transcript. Worker will
    // be re-triggered when the transcription pipeline populates aiTranscript.
    return { chunks: 0, skipped: true, reason: "no_text" };
  }

  const chunks = chunkText(text);
  if (chunks.length === 0) {
    return { chunks: 0, skipped: true, reason: "empty_after_chunking" };
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

  return { chunks: chunks.length, skipped: false };
}
