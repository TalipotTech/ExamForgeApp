import { z } from "zod";
import { crawlPages } from "../workers/scraper/crawler.js";
import { buildPageStructureExtractionPrompt } from "../ai/prompts/portal-extraction.js";
import { routeAIRequest } from "../ai/ai-router.js";
import { portalPageEntrySchema } from "@examforge/shared/validators";
import type { PortalPageEntry } from "@examforge/shared/validators";
import type { Database } from "@examforge/shared/db";
import { parseKeralaPSCPage, extractPaginationInfo } from "./kerala-psc-parser.js";

const MAX_PAGINATION_PAGES = 10;
const PAGINATION_DELAY_MS = 1500; // Polite delay between page fetches

export type CrawlPortalParams = {
  url: string;
  portalName: string;
  pageType: string;
  userId: string;
};

export async function crawlPortalPage(
  params: CrawlPortalParams,
  db: Database,
): Promise<PortalPageEntry[]> {
  const { url, portalName, pageType, userId } = params;

  // Fetch page 1
  const firstPageHtml = await fetchPage(url);
  if (!firstPageHtml) {
    console.warn(`[portal-crawler] Could not fetch content from ${url}`);
    return [];
  }

  // ─── Strategy 1: Deterministic HTML parser (fast, free, reliable) ───
  if (isKeralaPSC(url)) {
    const parsed = parseKeralaPSCPage(firstPageHtml, pageType);
    if (parsed && parsed.length > 0) {
      console.log(
        `[portal-crawler] Parsed ${parsed.length} entries from page 1 of ${url} (deterministic, no AI cost)`,
      );

      // Check for pagination and fetch additional pages
      const paginationInfo = extractPaginationInfo(firstPageHtml);
      if (paginationInfo.totalPages > 1) {
        const allEntries = [...parsed];
        const pagesToFetch = Math.min(paginationInfo.totalPages, MAX_PAGINATION_PAGES);

        console.log(
          `[portal-crawler] Found ${paginationInfo.totalPages} pages, fetching up to ${pagesToFetch}`,
        );

        for (let pageNum = 1; pageNum < pagesToFetch; pageNum++) {
          // Polite delay between fetches
          await new Promise<void>((r) => setTimeout(r, PAGINATION_DELAY_MS));

          const pageUrl = buildPaginatedUrl(url, pageNum);
          const pageHtml = await fetchPage(pageUrl);
          if (!pageHtml) continue;

          const pageEntries = parseKeralaPSCPage(pageHtml, pageType);
          if (pageEntries && pageEntries.length > 0) {
            // Dedup by PDF URL
            for (const entry of pageEntries) {
              const isDuplicate = allEntries.some((existing) =>
                existing.pdfLinks.some((existingLink) =>
                  entry.pdfLinks.some((newLink) => newLink.url === existingLink.url),
                ),
              );
              if (!isDuplicate) {
                allEntries.push(entry);
              }
            }

            console.log(
              `[portal-crawler] Page ${pageNum + 1}: ${pageEntries.length} entries (total: ${allEntries.length})`,
            );
          }
        }

        return allEntries;
      }

      return parsed;
    }
    console.log(
      `[portal-crawler] Deterministic parser returned 0 entries, falling back to AI for ${url}`,
    );
  }

  // ─── Strategy 2: AI extraction (fallback for unknown pages) ───
  const { systemPrompt, prompt } = buildPageStructureExtractionPrompt(firstPageHtml, {
    portalName,
    pageType,
    url,
  });

  const wrappedSchema = z.object({ entries: z.array(portalPageEntrySchema) });

  const aiResult = await routeAIRequest(
    {
      task: "extract_portal_page",
      prompt,
      systemPrompt,
      schema: wrappedSchema,
      userId,
      skipCache: true,
      temperature: 0.1,
    },
    db,
  );

  const entries = aiResult.data.entries;

  // Resolve relative PDF URLs to absolute
  const baseUrl = resolveBaseUrl(url);
  for (const entry of entries) {
    for (const link of entry.pdfLinks) {
      link.url = resolveUrl(link.url, baseUrl);
    }
  }

  console.log(
    `[portal-crawler] Extracted ${entries.length} entries from ${url} (AI, ${aiResult.usage.totalTokens} tokens)`,
  );

  return entries;
}

// ─── Fetch a single page ───

async function fetchPage(url: string): Promise<string | null> {
  let pages = await crawlPages({
    startUrl: url,
    maxPages: 1,
    crawlerType: "cheerio",
    fetchDelayMs: 0,
  });

  if (pages.length === 0 || (pages[0]?.textContent?.trim().length ?? 0) < 200) {
    console.log(`[portal-crawler] Cheerio got insufficient content, trying Playwright for ${url}`);
    try {
      pages = await crawlPages({
        startUrl: url,
        maxPages: 1,
        crawlerType: "playwright",
        fetchDelayMs: 0,
      });
    } catch (err) {
      console.warn(
        `[portal-crawler] Playwright fallback failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  if (pages.length === 0 || !pages[0]?.textContent) {
    return null;
  }

  return pages[0].htmlContent ?? pages[0].textContent;
}

// ─── Build paginated URL ───

function buildPaginatedUrl(baseUrl: string, pageNum: number): string {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set("page", String(pageNum));
    return u.toString();
  } catch {
    const separator = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${separator}page=${pageNum}`;
  }
}

// ─── Helpers ───

function isKeralaPSC(url: string): boolean {
  return url.includes("keralapsc.gov.in");
}

function resolveBaseUrl(pageUrl: string): string {
  try {
    const u = new URL(pageUrl);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "";
  }
}

function resolveUrl(href: string, baseUrl: string): string {
  if (!href) return href;
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
  }
}
