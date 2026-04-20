/**
 * Universal Page Parser — Universal Discovery Agent v2
 *
 * ONE prompt, ANY portal. The key insight of v2 is AI-as-Adapter:
 * we don't write CSS selectors or XPath per portal. We fetch the page
 * as clean markdown and let the LLM understand the semantic structure.
 *
 * This prompt is format-agnostic — it extracts the same shape of
 * structured output whether the page is a card layout, a flat HTML
 * table, a notifications list, or a PDF-index page.
 */

import type { DiscoveryPageType } from "@examforge/shared/validators";

export interface UniversalPageParserParams {
  portalName: string;
  portalDomain: string;
  pageUrl: string;
  pageType: DiscoveryPageType;
  baseUrl: string;
  pageMarkdown: string;
  /** Canonical exam names this portal is known to conduct — helps the AI disambiguate. */
  knownExams?: string[];
}

const SYSTEM_PROMPT = `You are an expert at extracting structured exam information from Indian
government and educational portal web pages. You handle ANY page format:
HTML tables, card layouts, list pages, notification boards, PDF indexes,
and bilingual content.

You ALWAYS extract the same structured output regardless of how the
source page is formatted. You normalize dates, exam names, and URLs.

When you encounter content in regional languages (Malayalam, Hindi, Tamil,
Telugu, Kannada), extract the English version. If only regional language
is available, transliterate key fields (exam name, dates) to English.

RULES:
1. Extract EVERY exam-related item on the page — do not skip any.
2. For each item, extract as many fields as you can find.
3. If a field is not present on the page, set it to null — DO NOT guess.
4. Normalize all dates to ISO format: YYYY-MM-DD. If only a month+year
   is given (e.g. "May 2026"), use the 1st of that month.
5. Resolve relative URLs using the base URL provided.
6. Identify the content type of each linked document from its link text
   and URL: notifications, question papers, answer keys, syllabi, results.
7. Distinguish question papers vs. answer keys — answer keys often have
   "key" or "answer" in the filename or link label.
8. If the page has pagination (Next / numbered page links), set
   pagination.hasMore and nextPageUrl. Do NOT actually follow the link —
   we'll do that separately.
9. If you see the same exam listed multiple times (e.g. one row per
   year), produce one item per listing — don't collapse them.
10. For category: use "pharmacy" for BPharm/MPharm/GPAT,
    "medical" for NEET/FMGE/DNB, "engineering" for GATE/JEE/IES,
    "civil_services" for UPSC, "state_psc" for State PSCs,
    "teaching" for UGC NET / Assistant Professor roles,
    "other" for anything else.`;

function buildUserPrompt(params: UniversalPageParserParams): string {
  const knownExamsHint = params.knownExams?.length
    ? `\nThis portal is known to conduct or aggregate: ${params.knownExams.join(", ")}.\nPrefer these canonical names when the page matches one of them.\n`
    : "";

  // Truncate markdown to keep the prompt within reasonable token budget.
  const MAX_CHARS = 24_000;
  const truncated =
    params.pageMarkdown.length > MAX_CHARS
      ? params.pageMarkdown.slice(0, MAX_CHARS) +
        `\n\n[... truncated ${params.pageMarkdown.length - MAX_CHARS} chars ...]`
      : params.pageMarkdown;

  return `Extract exam information from this page.

Portal: ${params.portalName} (${params.portalDomain})
Page URL: ${params.pageUrl}
Page type hint: ${params.pageType}
Base URL for resolving relative links: ${params.baseUrl}${knownExamsHint}

=== PAGE CONTENT (Markdown) ===
${truncated}
=== END PAGE CONTENT ===

For each exam entry, notification, or downloadable document visible on
the page, return an item in the \`items\` array. Follow the output
schema exactly. Use null (not empty strings or guesses) for fields you
cannot determine from the page.

If this page contains primarily question-paper/answer-key/syllabus
download links (e.g. a previous-papers index page), each row or card
becomes one item whose \`links\` array holds the downloadable URL.

If you detect pagination, populate the \`pagination\` object.`;
}

export function buildUniversalPageParserPrompt(params: UniversalPageParserParams): {
  systemPrompt: string;
  prompt: string;
} {
  return {
    systemPrompt: SYSTEM_PROMPT,
    prompt: buildUserPrompt(params),
  };
}
