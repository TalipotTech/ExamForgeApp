/**
 * TrustBadge — visual trust-tier indicator on every question.
 *
 * Implements §1.2 of docs/features/QUESTION_ACQUISITION_STRATEGY.md:
 *
 *   Tier | Emoji | Example label                  | Colour
 *   -----+-------+--------------------------------+--------
 *   1    | 🟢    | Kerala PSC 2024 — Verified     | green-solid
 *   2    | 🟢    | Kerala PSC 2024                | green
 *   3    | 🔵    | Textbook — KD Tripathi Ch.4    | blue
 *   4    | 🟡    | AI Generated — Pattern Verified| yellow
 *   5    | 🟠    | AI Generated — Topic Based     | orange
 *   6    | ⚪    | AI Practice — Not Exam Pattern | grey
 *
 * No question is presented as authoritative unless it carries a tier
 * 1-3 badge. Admins and students see the same tier determination.
 */

"use client";

import { Badge } from "@/components/ui/badge";

export type TrustBadgeProps = {
  sourceType?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  answerSource?: string | null;
  verificationStatus?: string | null;
  paperYear?: number | null;
  conductingBody?: string | null;
  originalExam?: string | null;
  /** Human-friendly source string (column `questions.source`). Fallback
   *  when sourceDetail isn't present (older rows). */
  rawSource?: string | null;
  className?: string;
};

type Tier = 1 | 2 | 3 | 4 | 5 | 6;

interface TierDescriptor {
  tier: Tier;
  icon: string;
  label: string;
  tooltip: string;
  className: string;
}

function computeTier(p: TrustBadgeProps): TierDescriptor {
  const {
    sourceType,
    sourceDetail,
    answerSource,
    verificationStatus,
    paperYear,
    conductingBody,
    originalExam,
    rawSource,
  } = p;

  // ─── Tier 1/2: Real paper ───
  if (sourceType === "real_paper") {
    const bodyLabel =
      originalExam ??
      conductingBody ??
      (sourceDetail?.conductingBody as string | undefined) ??
      rawSource ??
      "Real Paper";
    const yearSuffix = paperYear ? ` ${paperYear}` : "";
    if (answerSource === "official_key") {
      return {
        tier: 1,
        icon: "🟢",
        label: `${bodyLabel}${yearSuffix} · Verified`,
        tooltip: `Extracted from a real ${bodyLabel} paper with an official answer key.`,
        className: "border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-400",
      };
    }
    return {
      tier: 2,
      icon: "🟢",
      label: `${bodyLabel}${yearSuffix}`,
      tooltip: `Extracted from a real ${bodyLabel} paper. Answer not yet matched to an official key.`,
      className: "border-green-500/40 bg-green-500/5 text-green-700 dark:text-green-400",
    };
  }

  // ─── Tier 3: Textbook ───
  if (sourceType === "textbook") {
    const book = (sourceDetail?.textbook as string | undefined) ?? rawSource ?? "Textbook";
    const chapter = sourceDetail?.chapter as string | undefined;
    const short = book.length > 28 ? book.slice(0, 26) + "…" : book;
    const suffix = chapter ? ` · ${chapter}` : "";
    return {
      tier: 3,
      icon: "🔵",
      label: `${short}${suffix}`,
      tooltip: `Authored MCQ from standard textbook: ${book}${chapter ? ` (${chapter})` : ""}.`,
      className: "border-blue-500/40 bg-blue-500/5 text-blue-700 dark:text-blue-400",
    };
  }

  // ─── Tier 4/5/6: AI-generated ───
  const isAdminVerified =
    verificationStatus === "admin_approved" || verificationStatus === "auto_approved";

  if (sourceType === "pattern_ai") {
    return {
      tier: isAdminVerified ? 4 : 5,
      icon: isAdminVerified ? "🟡" : "🟠",
      label: isAdminVerified ? "AI · Pattern Verified" : "AI · Pattern (pending)",
      tooltip: isAdminVerified
        ? "AI-generated to match the real exam fingerprint, and passed the verification pipeline."
        : "AI-generated to match the real exam fingerprint — not yet verified.",
      className: isAdminVerified
        ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
        : "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    };
  }

  if (sourceType === "topic_ai") {
    return {
      tier: isAdminVerified ? 4 : 5,
      icon: isAdminVerified ? "🟡" : "🟠",
      label: isAdminVerified ? "AI · Topic Verified" : "AI · Topic-based",
      tooltip: isAdminVerified
        ? "AI-generated from real seed questions on this topic, passed verification."
        : "AI-generated from real seed questions on this topic. Under review.",
      className: isAdminVerified
        ? "border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400"
        : "border-orange-500/50 bg-orange-500/10 text-orange-700 dark:text-orange-400",
    };
  }

  if (sourceType === "supplementary_ai") {
    return {
      tier: 6,
      icon: "⚪",
      label: "AI · Practice (no exam precedent)",
      tooltip:
        "AI-generated for topic practice. This topic has no real-paper precedent in our dataset, so treat as practice rather than exam-style.",
      className: "border-muted-foreground/40 bg-muted/40 text-muted-foreground",
    };
  }

  // ─── Unknown/unverified ───
  return {
    tier: 6,
    icon: "⚪",
    label: rawSource ? rawSource.slice(0, 36) : "Unverified",
    tooltip: "Source not tagged or verified. Shown for completeness — treat cautiously.",
    className: "border-muted-foreground/40 bg-muted/40 text-muted-foreground",
  };
}

export function TrustBadge(props: TrustBadgeProps): React.ReactElement {
  const t = computeTier(props);
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 text-[10px] font-normal ${t.className} ${props.className ?? ""}`}
      title={t.tooltip}
    >
      <span aria-hidden>{t.icon}</span>
      <span className="max-w-[22ch] truncate">{t.label}</span>
    </Badge>
  );
}
