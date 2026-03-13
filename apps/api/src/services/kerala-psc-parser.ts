/**
 * Deterministic HTML table parser for Kerala PSC portal pages.
 *
 * Kerala PSC uses consistent Drupal-generated HTML tables across its pages.
 * Parsing these tables directly is faster, cheaper, and more reliable than
 * sending 30K tokens to an LLM.
 *
 * Supported page types:
 * - previous_questions:  Year | Title (link) | Paper Code + Date | Download (PDF)
 * - omr_answer_key:      Post (link) | Details | Type | Question Paper (PDF) | ??? | Download (PDF)
 * - online_answer_key:   Same structure as OMR answer keys
 * - descriptive_questions: Similar table with question paper PDFs
 * - examinations:        Exam listing (notification PDFs)
 * - syllabus:            Post-wise syllabus table
 */

import * as cheerio from "cheerio";
import type { PortalPageEntry } from "@examforge/shared/validators";

const BASE_URL = "https://keralapsc.gov.in";

function resolveUrl(href: string): string {
  if (!href) return href;
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("//")) return `https:${href}`;
  try {
    return new URL(href, BASE_URL).toString();
  } catch {
    return `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
  }
}

function extractYear(text: string): number | undefined {
  // Look for 4-digit years in common patterns
  const yearMatch = text.match(/\b(20\d{2})\b/);
  const yearStr = yearMatch?.[1];
  return yearStr ? parseInt(yearStr, 10) : undefined;
}

function extractPaperCode(text: string): string | undefined {
  const codeMatch = text.match(/(?:Paper\s*Code|Code)[:\s-]*(\d+[/-]\d+)/i);
  return codeMatch?.[1] ?? undefined;
}

// ─── Previous Question Papers ───
// Table: Year | Title (linked) | Paper Code + Date | Download (PDF link)
function parsePreviousQuestions($: cheerio.CheerioAPI): PortalPageEntry[] {
  const entries: PortalPageEntry[] = [];

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return; // Skip header/info rows

    const yearCell = $(cells[0]).text().trim();
    const titleCell = $(cells[1]);
    const infoCell = $(cells[2]).text().trim();

    const titleText = titleCell.text().trim();
    if (!titleText) return;

    const year = parseInt(yearCell, 10) || extractYear(infoCell);
    const paperCode = extractPaperCode(infoCell);

    // Extract PDF links from all cells in the row
    const pdfLinks: PortalPageEntry["pdfLinks"] = [];
    $(row)
      .find("a")
      .each((_j, link) => {
        const href = $(link).attr("href") || "";
        const linkText = $(link).text().trim();
        const resolvedUrl = resolveUrl(href);

        if (resolvedUrl.toLowerCase().includes(".pdf")) {
          pdfLinks.push({
            url: resolvedUrl,
            label: linkText || "Download",
            type: "question_paper",
          });
        }
      });

    entries.push({
      examName: titleText,
      examCategory: paperCode ?? "",
      examYear: year,
      pdfLinks,
    });
  });

  return entries;
}

// ─── OMR / Online Answer Keys ───
// Table: Post (linked) | Details | Type (Provisional/Final) | Question Paper (PDF) | ??? | Download (Answer Key PDF)
function parseAnswerKeys($: cheerio.CheerioAPI): PortalPageEntry[] {
  const entries: PortalPageEntry[] = [];

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 3) return;

    const postCell = $(cells[0]);
    const postText = postCell.text().trim();
    if (!postText || postText.length > 500) return; // Skip note/disclaimer rows

    const detailsText = cells.length > 1 ? $(cells[1]).text().trim() : "";
    const keyType = cells.length > 2 ? $(cells[2]).text().trim() : "";

    const year = extractYear(detailsText);
    const paperCode = extractPaperCode(detailsText);

    // Extract all PDF links — classify as question_paper or answer_key
    const pdfLinks: PortalPageEntry["pdfLinks"] = [];
    $(row)
      .find("a")
      .each((_j, link) => {
        const href = $(link).attr("href") || "";
        const linkText = $(link).text().trim().toLowerCase();
        const resolvedUrl = resolveUrl(href);

        if (!resolvedUrl.toLowerCase().includes(".pdf")) return;

        const isAnswerKey =
          linkText.includes("download") || linkText.includes("answer") || linkText.includes("key");
        const isQuestionPaper = linkText.includes("question") || linkText.includes("paper");

        pdfLinks.push({
          url: resolvedUrl,
          label: $(link).text().trim() || "Download",
          type: isQuestionPaper ? "question_paper" : isAnswerKey ? "answer_key" : "other",
        });
      });

    entries.push({
      examName: postText,
      examCategory: keyType,
      examYear: year,
      additionalInfo: paperCode ? `Paper Code: ${paperCode}` : undefined,
      pdfLinks,
    });
  });

  return entries;
}

// ─── Examinations (notifications) ───
function parseExaminations($: cheerio.CheerioAPI): PortalPageEntry[] {
  const entries: PortalPageEntry[] = [];

  // Examinations page may use various structures — try table first
  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const titleText = $(cells[0]).text().trim() || $(cells[1]).text().trim();
    if (!titleText) return;

    const pdfLinks: PortalPageEntry["pdfLinks"] = [];
    $(row)
      .find("a")
      .each((_j, link) => {
        const href = $(link).attr("href") || "";
        const linkText = $(link).text().trim();
        const resolvedUrl = resolveUrl(href);

        if (resolvedUrl.toLowerCase().includes(".pdf")) {
          pdfLinks.push({
            url: resolvedUrl,
            label: linkText || "Download",
            type: "notification",
          });
        }
      });

    entries.push({
      examName: titleText,
      examCategory: "",
      pdfLinks,
    });
  });

  // If no table found, try list-based structure
  if (entries.length === 0) {
    $(".view-content .views-row, .item-list li").each((_i, item) => {
      const titleEl = $(item).find("a").first();
      const titleText = titleEl.text().trim();
      if (!titleText) return;

      const pdfLinks: PortalPageEntry["pdfLinks"] = [];
      $(item)
        .find('a[href*=".pdf"]')
        .each((_j, link) => {
          pdfLinks.push({
            url: resolveUrl($(link).attr("href") || ""),
            label: $(link).text().trim() || "Download",
            type: "notification",
          });
        });

      entries.push({
        examName: titleText,
        examCategory: "",
        pdfLinks,
      });
    });
  }

  return entries;
}

// ─── Syllabus ───
function parseSyllabus($: cheerio.CheerioAPI): PortalPageEntry[] {
  const entries: PortalPageEntry[] = [];

  $("table tbody tr").each((_i, row) => {
    const cells = $(row).find("td");
    if (cells.length < 2) return;

    const titleText = $(cells[0]).text().trim() || $(cells[1]).text().trim();
    if (!titleText) return;

    const pdfLinks: PortalPageEntry["pdfLinks"] = [];
    $(row)
      .find("a")
      .each((_j, link) => {
        const href = $(link).attr("href") || "";
        const resolvedUrl = resolveUrl(href);

        if (resolvedUrl.toLowerCase().includes(".pdf")) {
          pdfLinks.push({
            url: resolvedUrl,
            label: $(link).text().trim() || "Download",
            type: "syllabus",
          });
        }
      });

    if (pdfLinks.length > 0) {
      entries.push({
        examName: titleText,
        examCategory: "",
        pdfLinks,
      });
    }
  });

  return entries;
}

// ─── Pagination Info ───

export type PaginationInfo = {
  totalPages: number;
  currentPage: number;
};

/**
 * Extracts pagination info from Kerala PSC pages.
 * Kerala PSC uses Drupal-style pagers: <ul class="pager"> with <li class="pager-item">.
 * Pages use ?page=0, ?page=1, etc. (0-indexed).
 */
export function extractPaginationInfo(html: string): PaginationInfo {
  const $ = cheerio.load(html);

  // Look for pager elements
  const pagerLinks = $(".pager li a, .pager a, nav.pager a, ul.pagination a");
  if (pagerLinks.length === 0) {
    return { totalPages: 1, currentPage: 0 };
  }

  let maxPage = 0;

  pagerLinks.each((_i, link) => {
    const href = $(link).attr("href") || "";
    const pageMatch = href.match(/[?&]page=(\d+)/);
    if (pageMatch?.[1]) {
      const pageNum = parseInt(pageMatch[1], 10);
      if (pageNum > maxPage) maxPage = pageNum;
    }
  });

  // Also check the "last" page link
  const lastLink = $(".pager-last a, .pager li.last a").attr("href") || "";
  const lastMatch = lastLink.match(/[?&]page=(\d+)/);
  if (lastMatch?.[1]) {
    const lastPage = parseInt(lastMatch[1], 10);
    if (lastPage > maxPage) maxPage = lastPage;
  }

  // Current page: look for active/current pager item
  let currentPage = 0;
  const currentItem = $(".pager-current, .pager .active, li.active").text().trim();
  if (currentItem) {
    const num = parseInt(currentItem, 10);
    if (!isNaN(num)) currentPage = num - 1; // Convert 1-indexed display to 0-indexed
  }

  return {
    totalPages: maxPage + 1, // 0-indexed → count
    currentPage,
  };
}

// ─── Main Parser ───

export function parseKeralaPSCPage(html: string, pageType: string): PortalPageEntry[] | null {
  // Only handle Kerala PSC page types we know
  const $ = cheerio.load(html);

  // Check if page has tables — if not, return null to fall back to AI
  const tableRows = $("table tbody tr").length;
  if (tableRows === 0) return null;

  switch (pageType) {
    case "previous_questions":
      return parsePreviousQuestions($);
    case "omr_answer_key":
    case "online_answer_key":
      return parseAnswerKeys($);
    case "examinations":
      return parseExaminations($);
    case "descriptive_questions":
      return parsePreviousQuestions($); // Same table structure
    case "syllabus":
      return parseSyllabus($);
    default:
      return null; // Unknown page type — fall back to AI
  }
}
