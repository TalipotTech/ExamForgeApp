// Context-sensitive image brief derivation.
//
// Turns a topic's actual content (title + description + key terms + the
// generated tutorial text + exam audience) into a precise visual brief and
// a yes/no decision on whether a diagram is even warranted. The brief —
// not an admin's free-text — becomes the image prompt. See
// docs/features/ai-image-gen/AI_IMAGE_GENERATION.md §5.

import { z } from "zod";
import type { Database } from "@examforge/shared/db";
import { routeAIRequest } from "../ai-router.js";
import type { ImagePurpose, ImageStyle } from "./prompt-enhancer.js";

export const ImageBriefSchema = z.object({
  needsImage: z
    .boolean()
    .describe("True only if a diagram/visual genuinely aids understanding of this topic."),
  visualType: z.enum(["diagram", "infographic", "chart", "illustration", "formula_card", "none"]),
  brief: z
    .string()
    .describe(
      "A precise description of what to draw — the image prompt. Empty if needsImage=false.",
    ),
  labels: z.array(z.string()).describe("Key labels/parts that must appear in the image."),
});
export type ImageBrief = z.infer<typeof ImageBriefSchema>;

export interface DeriveImageBriefInput {
  title: string;
  description?: string | null;
  keyTerms?: string[];
  examName: string;
  tutorialText?: string | null;
  /** Optional extra guidance from the admin to steer this specific image. */
  additionalPrompt?: string;
  userId: string;
  examId?: string;
}

export interface DerivedImageBrief extends ImageBrief {
  purpose: ImagePurpose;
  style: ImageStyle;
}

const MATH_HINTS =
  /\b(equation|formula|theorem|geometry|trigonometr|graph|integral|derivative|calculus|algebra)\b/i;

// Map the model's visualType + topic hints → an image-router purpose/style.
// Done deterministically in code (not by the LLM) for reliable routing.
function pickPurposeStyle(
  brief: ImageBrief,
  input: DeriveImageBriefInput,
): { purpose: ImagePurpose; style: ImageStyle } {
  const haystack = `${input.title} ${(input.keyTerms ?? []).join(" ")} ${brief.brief}`;

  if (
    brief.visualType === "formula_card" ||
    (MATH_HINTS.test(haystack) && brief.visualType !== "chart")
  ) {
    return { purpose: "formula_card", style: "diagram" };
  }
  if (brief.visualType === "infographic" || brief.visualType === "chart") {
    return { purpose: "comparison_infographic", style: "flat" };
  }
  if (brief.visualType === "illustration") {
    return { purpose: "tutorial_diagram", style: "illustration" };
  }
  // default: labeled scientific/technical diagram
  return { purpose: "tutorial_diagram", style: "diagram" };
}

export async function deriveImageBrief(
  input: DeriveImageBriefInput,
  db: Database,
): Promise<DerivedImageBrief> {
  const tutorialExcerpt = (input.tutorialText ?? "").slice(0, 4000);

  const prompt = [
    `You are deciding whether an educational diagram would help students learn a topic, and if so, writing a precise brief for an image generator.`,
    ``,
    `Exam / audience: ${input.examName}`,
    `Topic: ${input.title}`,
    input.description ? `Description: ${input.description}` : "",
    input.keyTerms?.length ? `Key terms: ${input.keyTerms.join(", ")}` : "",
    tutorialExcerpt ? `\nStudy material (excerpt):\n${tutorialExcerpt}` : "",
    input.additionalPrompt?.trim()
      ? `\nAdditional guidance from the admin (prioritise this): ${input.additionalPrompt.trim()}`
      : "",
    ``,
    `Decide: does a single static diagram/visual meaningfully aid understanding? Many topics (definitions, lists, history dates) do NOT — set needsImage=false for those.`,
    `If yes, write a concrete brief describing exactly what to draw (structures, flow, relationships) and the labels that must appear. Keep it factual and exam-appropriate; no decorative fluff.`,
  ]
    .filter(Boolean)
    .join("\n");

  // The LLM brief is an enhancement, not a hard dependency. If the text-AI
  // provider is unavailable (no credits, rate-limited, transient error), we
  // fall back to a deterministic brief built from the topic's own content so
  // image generation still works. Returning a fallback also avoids hanging
  // the request through the full retry+fallback sequence on a 500.
  // Hard upper bound on the brief step — it sits on the synchronous
  // single-topic request path, so it must never dominate latency (which is
  // what caused the dev-proxy socket hang-ups). If the providers are slow or
  // retrying, we abandon and use the deterministic brief.
  const briefTimeoutMs = Number(process.env.IMAGE_BRIEF_TIMEOUT_MS ?? 12000);

  let brief: ImageBrief;
  try {
    const result = await Promise.race([
      routeAIRequest(
        {
          task: "derive_image_brief",
          prompt,
          schema: ImageBriefSchema,
          userId: input.userId,
          examId: input.examId,
          bypassUserRateLimit: true,
          maxTokens: 600,
        },
        db,
      ),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("brief timed out")), briefTimeoutMs),
      ),
    ]);
    brief = result.data;
  } catch (e) {
    console.warn(
      `[image-brief] LLM brief unavailable for "${input.title}", using deterministic fallback: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    brief = buildFallbackBrief(input);
  }

  const { purpose, style } = pickPurposeStyle(brief, input);
  return { ...brief, purpose, style };
}

// Content-derived brief with no LLM call. Used when the brief model fails.
// Defaults needsImage=true because the caller explicitly targeted this topic
// (single-topic) or opted into a full-syllabus run.
function buildFallbackBrief(input: DeriveImageBriefInput): ImageBrief {
  const desc = input.description?.trim();
  const extra = input.additionalPrompt?.trim();
  return {
    needsImage: true,
    visualType: "diagram",
    brief:
      `Clear, labeled educational diagram of "${input.title}" for ${input.examName}.` +
      (desc ? ` ${desc}` : "") +
      (extra ? ` ${extra}` : ""),
    labels: (input.keyTerms ?? []).slice(0, 6),
  };
}
