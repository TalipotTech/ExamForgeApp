// Per-topic image sync — shared by the batch worker (image-sync-worker.ts)
// and the single-topic admin mutation (imageGeneration.syncTopic). One
// source of truth for: hash-based idempotency, context-derived brief, model
// routing, generation, and persistence onto the syllabus node.

import { createHash } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { syllabusNodes, tutorialFiles, syllabi, exams } from "@examforge/shared/db/schema";
import { deriveImageBrief } from "../ai/image-prompts/image-brief.js";
import { generateImage } from "../ai/image-router.js";

export type SyncTopicResult =
  | { status: "ready"; imageUrl: string }
  | { status: "skipped"; reason: "unchanged" | "not_needed" };

// Idempotency key: hash of the source signal that feeds the image. Unchanged
// content → same hash → skipped (no LLM, no image cost). Re-extracted
// syllabus / regenerated tutorial → hash changes → image refreshes.
export function topicSourceHash(parts: {
  title: string;
  description: string | null;
  keyTerms: string[];
  tutorialText: string;
}): string {
  return createHash("sha256")
    .update(
      [parts.title, parts.description ?? "", parts.keyTerms.join("|"), parts.tutorialText].join(
        " ",
      ),
    )
    .digest("hex");
}

export async function syncTopicImage(
  opts: { syllabusNodeId: number; userId: string; force?: boolean; examName?: string },
  db: Database,
): Promise<SyncTopicResult> {
  const [node] = await db
    .select({
      id: syllabusNodes.id,
      title: syllabusNodes.title,
      description: syllabusNodes.description,
      keyTerms: syllabusNodes.keyTerms,
      syllabusId: syllabusNodes.syllabusId,
      imageStatus: syllabusNodes.imageStatus,
      imageContentHash: syllabusNodes.imageContentHash,
    })
    .from(syllabusNodes)
    .where(eq(syllabusNodes.id, opts.syllabusNodeId))
    .limit(1);

  if (!node) throw new Error("Topic not found");

  let examName = opts.examName;
  if (!examName) {
    const [s] = await db
      .select({ examName: exams.name })
      .from(syllabi)
      .leftJoin(exams, eq(syllabi.examId, exams.id))
      .where(eq(syllabi.id, node.syllabusId))
      .limit(1);
    examName = s?.examName ?? "this exam";
  }

  const [tutorial] = await db
    .select({ plainText: tutorialFiles.plainText })
    .from(tutorialFiles)
    .where(and(eq(tutorialFiles.syllabusNodeId, node.id), eq(tutorialFiles.isCurrent, true)))
    .limit(1);
  const tutorialText = tutorial?.plainText ?? "";

  const keyTerms = (node.keyTerms as string[]) ?? [];
  const hash = topicSourceHash({
    title: node.title,
    description: node.description,
    keyTerms,
    tutorialText,
  });

  if (
    !opts.force &&
    node.imageContentHash === hash &&
    (node.imageStatus === "ready" || node.imageStatus === "skipped")
  ) {
    return { status: "skipped", reason: "unchanged" };
  }

  const brief = await deriveImageBrief(
    {
      title: node.title,
      description: node.description,
      keyTerms,
      examName,
      tutorialText,
      userId: opts.userId,
    },
    db,
  );

  if (!brief.needsImage || !brief.brief.trim()) {
    await db
      .update(syllabusNodes)
      .set({ imageStatus: "skipped", imageContentHash: hash, updatedAt: new Date() })
      .where(eq(syllabusNodes.id, node.id));
    return { status: "skipped", reason: "not_needed" };
  }

  const promptText = brief.labels.length
    ? `${brief.brief} Labels: ${brief.labels.join(", ")}.`
    : brief.brief;

  const image = await generateImage(
    {
      purpose: brief.purpose,
      prompt: promptText,
      aspectRatio: "16:9",
      style: brief.style,
      platform: "examforge",
      userId: opts.userId,
      syllabusNodeId: node.id,
      contentType: "tutorial",
    },
    db,
  );

  await db
    .update(syllabusNodes)
    .set({
      imageUrl: image.cdnUrl,
      imageKey: image.key,
      imageStatus: "ready",
      imageContentHash: hash,
      updatedAt: new Date(),
    })
    .where(eq(syllabusNodes.id, node.id));

  return { status: "ready", imageUrl: image.cdnUrl };
}
