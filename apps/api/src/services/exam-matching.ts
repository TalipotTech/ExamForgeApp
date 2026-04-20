/**
 * Canonical ↔ Scraped Exam Matcher
 *
 * Portal ingestion produces scraped examination names (e.g. "Assistant
 * Professor in Pharmacy – Direct Recruitment") that don't always match
 * the admin-curated canonical exam name (e.g. "BPharm Assistant
 * Professor 2025"). This service resolves scraped names to canonical
 * `exams` records using a multi-step strategy:
 *
 *   1. Exact name match (confidence 1.0)
 *   2. Normalized match via EXAM_ALIASES dictionary (confidence 0.95)
 *   3. Alias match — admin-linked scraped names stored on the canonical
 *      exam's aliases JSONB column (confidence 0.9)
 *   4. Token-overlap heuristic with a hand-picked synonym map for
 *      Indian exam domain (confidence = jaccard score, only used when
 *      ≥ 0.5)
 *
 * Returns null match for unresolvable names; the admin UI then offers
 * "Link to canonical" or "Create new canonical" actions.
 */

import { normalizeExamName } from "../config/exam-name-normalizer.js";

export type MatchedBy = "exact" | "normalized" | "alias" | "token" | "none";

export interface CanonicalExamSummary {
  id: string;
  name: string;
  aliases: string[];
  category: string | null;
}

export interface ExamMatchResult {
  canonicalExamId: string | null;
  canonicalName: string | null;
  confidence: number; // 0-1
  matchedBy: MatchedBy;
}

/**
 * Domain-aware synonyms. If a token on either side is present in
 * the same set, we treat them as equivalent during Jaccard overlap.
 * Conservative — only obvious equivalences that matter for exam naming.
 */
const SYNONYM_GROUPS: string[][] = [
  ["bpharm", "bpharmacy", "pharmacy", "pharmaceutical"],
  ["mpharm", "mpharmacy"],
  ["mbbs", "medical"],
  ["bds", "dental"],
  ["bams", "ayurveda", "ayurvedic"],
  ["bhms", "homoeopathic", "homeopathic"],
  ["bsms", "siddha"],
  ["lecturer", "professor", "faculty"],
  ["asst", "assistant"],
  ["recruitment", "direct"],
  ["psc", "commission"],
];

/** Token map: lowercase token -> canonical synonym group id */
const TOKEN_TO_GROUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const group of SYNONYM_GROUPS) {
    const canon = group[0]!;
    for (const word of group) m.set(word, canon);
  }
  return m;
})();

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "in",
  "of",
  "for",
  "and",
  "or",
  "to",
  "by",
  "with",
  "exam",
  "examination",
  "test",
  "entrance",
  "eligibility",
]);

/** Tokenize a name for overlap comparison. Lower-cases, strips
 *  punctuation, drops stopwords and very short tokens, then maps each
 *  token through the synonym table so "bpharm" ↔ "pharmacy" unify. */
function tokenize(name: string): Set<string> {
  const raw = name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  return new Set(raw.map((t) => TOKEN_TO_GROUP.get(t) ?? t));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function canon(name: string): string {
  return normalizeExamName(name).toLowerCase().trim();
}

/**
 * Match a single scraped exam name against a pool of canonical exams.
 * Returns the best match above confidence threshold, or a "none" result.
 */
export function matchScrapedExam(
  scrapedName: string,
  canonicalExams: CanonicalExamSummary[],
  options: { tokenThreshold?: number } = {},
): ExamMatchResult {
  const tokenThreshold = options.tokenThreshold ?? 0.5;
  const scrapedCanon = canon(scrapedName);
  if (!scrapedCanon) {
    return {
      canonicalExamId: null,
      canonicalName: null,
      confidence: 0,
      matchedBy: "none",
    };
  }

  // 1. Exact match on raw name (case-insensitive)
  const exact = canonicalExams.find((e) => e.name.toLowerCase() === scrapedName.toLowerCase());
  if (exact) {
    return {
      canonicalExamId: exact.id,
      canonicalName: exact.name,
      confidence: 1.0,
      matchedBy: "exact",
    };
  }

  // 2. Normalized match
  const normMatch = canonicalExams.find((e) => canon(e.name) === scrapedCanon);
  if (normMatch) {
    return {
      canonicalExamId: normMatch.id,
      canonicalName: normMatch.name,
      confidence: 0.95,
      matchedBy: "normalized",
    };
  }

  // 3. Alias match
  const aliasMatch = canonicalExams.find((e) =>
    (e.aliases ?? []).some((alias) => canon(alias) === scrapedCanon),
  );
  if (aliasMatch) {
    return {
      canonicalExamId: aliasMatch.id,
      canonicalName: aliasMatch.name,
      confidence: 0.9,
      matchedBy: "alias",
    };
  }

  // 4. Token overlap (with synonym expansion)
  const scrapedTokens = tokenize(scrapedName);
  let best: { exam: CanonicalExamSummary; score: number } | null = null;
  for (const e of canonicalExams) {
    const canonTokens = tokenize(e.name);
    const score = jaccard(scrapedTokens, canonTokens);
    if (score >= tokenThreshold && (!best || score > best.score)) {
      best = { exam: e, score };
    }
  }
  if (best) {
    return {
      canonicalExamId: best.exam.id,
      canonicalName: best.exam.name,
      confidence: Math.min(0.85, best.score),
      matchedBy: "token",
    };
  }

  return {
    canonicalExamId: null,
    canonicalName: null,
    confidence: 0,
    matchedBy: "none",
  };
}

/**
 * Batch-match many scraped names against the same canonical pool.
 * Precomputes token sets once per canonical for O(M·N) token comparisons.
 */
export function matchScrapedExamsBatch(
  scrapedNames: string[],
  canonicalExams: CanonicalExamSummary[],
  options: { tokenThreshold?: number } = {},
): Map<string, ExamMatchResult> {
  const result = new Map<string, ExamMatchResult>();
  const tokenThreshold = options.tokenThreshold ?? 0.5;

  // Precompute canonical-side lookup structures.
  const byLowerName = new Map<string, CanonicalExamSummary>();
  const byCanon = new Map<string, CanonicalExamSummary>();
  const aliasIndex = new Map<string, CanonicalExamSummary>();
  const tokenIndex = canonicalExams.map((e) => ({
    exam: e,
    tokens: tokenize(e.name),
  }));
  for (const e of canonicalExams) {
    byLowerName.set(e.name.toLowerCase(), e);
    byCanon.set(canon(e.name), e);
    for (const alias of e.aliases ?? []) aliasIndex.set(canon(alias), e);
  }

  const seen = new Set<string>();
  for (const scrapedName of scrapedNames) {
    if (seen.has(scrapedName)) continue;
    seen.add(scrapedName);

    const scrapedCanon = canon(scrapedName);
    if (!scrapedCanon) {
      result.set(scrapedName, {
        canonicalExamId: null,
        canonicalName: null,
        confidence: 0,
        matchedBy: "none",
      });
      continue;
    }

    const exact = byLowerName.get(scrapedName.toLowerCase());
    if (exact) {
      result.set(scrapedName, {
        canonicalExamId: exact.id,
        canonicalName: exact.name,
        confidence: 1.0,
        matchedBy: "exact",
      });
      continue;
    }

    const normMatch = byCanon.get(scrapedCanon);
    if (normMatch) {
      result.set(scrapedName, {
        canonicalExamId: normMatch.id,
        canonicalName: normMatch.name,
        confidence: 0.95,
        matchedBy: "normalized",
      });
      continue;
    }

    const aliasMatch = aliasIndex.get(scrapedCanon);
    if (aliasMatch) {
      result.set(scrapedName, {
        canonicalExamId: aliasMatch.id,
        canonicalName: aliasMatch.name,
        confidence: 0.9,
        matchedBy: "alias",
      });
      continue;
    }

    const scrapedTokens = tokenize(scrapedName);
    let best: { exam: CanonicalExamSummary; score: number } | null = null;
    for (const { exam: e, tokens } of tokenIndex) {
      const score = jaccard(scrapedTokens, tokens);
      if (score >= tokenThreshold && (!best || score > best.score)) {
        best = { exam: e, score };
      }
    }
    if (best) {
      result.set(scrapedName, {
        canonicalExamId: best.exam.id,
        canonicalName: best.exam.name,
        confidence: Math.min(0.85, best.score),
        matchedBy: "token",
      });
      continue;
    }

    result.set(scrapedName, {
      canonicalExamId: null,
      canonicalName: null,
      confidence: 0,
      matchedBy: "none",
    });
  }

  return result;
}
