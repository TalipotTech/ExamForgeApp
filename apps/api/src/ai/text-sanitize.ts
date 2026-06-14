/**
 * Shared text-sanitisation utilities for OCR + embedding pipelines.
 *
 * Some OCR providers (notably Gemini and Claude when given multi-column
 * or visually-padded PDFs) preserve layout-only whitespace by emitting
 * long runs of `&nbsp;` or raw Unicode non-breaking-space characters.
 * That's noise: it inflates token counts (each `&nbsp;` is ~3 tokens),
 * eats into output budgets, blows past embedding model token caps, and
 * degrades retrieval quality without adding semantic content.
 *
 * Both the OCR worker (before persisting extractedText) and the
 * embedding pipeline (before chunking) run this — keeping them
 * in sync via a single source of truth.
 */

// Alternation rather than a character class so the lint rule
// no-misleading-character-class (zero-width joiners next to other code
// points combining into a single grapheme) stays happy.
// Covers: NBSP (U+00A0), NARROW NBSP (U+202F), ZERO WIDTH SPACE (U+200B),
// ZWNJ / ZWJ (U+200C / U+200D), ZERO WIDTH NO-BREAK SPACE / BOM (U+FEFF).
const INVISIBLE_WHITESPACE_RE = new RegExp("\\u00a0|\\u202f|\\u200b|\\u200c|\\u200d|\\ufeff", "g");

/** Strip HTML whitespace entities + invisible Unicode whitespace and
 *  collapse runs of regular whitespace to single spaces. Preserves
 *  newlines (so paragraph structure stays intact for chunking). */
export function sanitizeOcrText(text: string): string {
  return (
    text
      .replace(/&nbsp;/gi, " ")
      .replace(/&#160;/g, " ")
      .replace(/&#x?a0;/gi, " ")
      .replace(/&ensp;|&emsp;|&thinsp;|&zwj;|&zwnj;/gi, " ")
      .replace(INVISIBLE_WHITESPACE_RE, " ")
      .replace(/[ \t]{2,}/g, " ")
      // Collapse 3+ consecutive newlines to a paragraph break.
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}
