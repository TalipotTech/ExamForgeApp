import { createHash } from "node:crypto";
import { eq, ilike, or, and, sql } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import {
  contentSearches,
  searchResults,
  questions,
  syllabi,
  userSavedContent,
} from "@examforge/shared/db/schema";
import { parsedQuerySchema } from "@examforge/shared";
import type { ParsedQuery, SearchResultItem } from "@examforge/shared";
import { routeAIRequest, routeStreamingRequest } from "../ai/ai-router.js";
import { buildQueryParserPrompt } from "../ai/prompts/query-parser.js";
import { EXAM_PORTAL_MAP, GENERIC_SOURCES } from "../config/portal-map.js";
import { getRedisClient } from "../lib/redis.js";

// ─── Types ───

interface SearchParams {
  userId: string;
  query: string;
  filters: {
    contentType?: string;
    year?: number;
    format?: string;
    examId?: string;
  };
}

interface SearchResponse {
  searchId: string;
  results: Array<SearchResultItem & { id: string }>;
  fromCache: boolean;
  totalResults: number;
}

// ─── Cache helpers ───

const SEARCH_CACHE_PREFIX = "content-search:";
const SEARCH_CACHE_TTL = 86400; // 24 hours

function buildSearchCacheKey(query: string, filters: SearchParams["filters"]): string {
  const normalized = query.toLowerCase().trim();
  const filterStr = JSON.stringify({
    contentType: filters.contentType ?? "all",
    year: filters.year ?? null,
    format: filters.format ?? "all",
  });
  return `${SEARCH_CACHE_PREFIX}${createHash("md5").update(`${normalized}:${filterStr}`).digest("hex")}`;
}

// ─── Scoring ───

function scoreResult(result: SearchResultItem, parsedQuery: ParsedQuery): number {
  let score = 0;

  // Source quality
  if (result.sourceQuality === "official") score += 0.3;
  else if (result.sourceQuality === "established") score += 0.2;
  else if (result.sourceQuality === "community") score += 0.1;

  // Title match
  const titleLower = result.title.toLowerCase();
  if (parsedQuery.examName && titleLower.includes(parsedQuery.examName.toLowerCase())) {
    score += 0.2;
  }
  if (parsedQuery.examYear && result.title.includes(String(parsedQuery.examYear))) {
    score += 0.15;
  }

  // Content type match
  if (
    parsedQuery.intent === "previous_questions" &&
    ["pdf", "question_set"].includes(result.contentType)
  ) {
    score += 0.2;
  }
  if (parsedQuery.intent === "syllabus" && result.contentType === "syllabus") {
    score += 0.2;
  }

  // Format preference
  if (parsedQuery.contentFormat === "pdf" && result.contentType === "pdf") {
    score += 0.1;
  }

  // Has answers/explanations
  if (result.metadata?.hasAnswers) score += 0.05;

  return Math.min(score, 1.0);
}

function assignMatchQuality(score: number): "high" | "medium" | "low" {
  if (score >= 0.5) return "high";
  if (score >= 0.25) return "medium";
  return "low";
}

// ─── Internal DB Search ───

async function searchInternalDB(
  db: Database,
  userId: string,
  parsedQuery: ParsedQuery,
  examId?: string,
): Promise<SearchResultItem[]> {
  const results: SearchResultItem[] = [];
  const searchTerms = [parsedQuery.examName, parsedQuery.subject, ...parsedQuery.keywords].filter(
    Boolean,
  ) as string[];

  if (searchTerms.length === 0) return results;

  const searchPattern = `%${searchTerms[0]}%`;

  try {
    // Search existing questions by subject
    const questionRows = await db
      .select({
        subject: questions.subject,
        count: sql<number>`count(*)::int`,
      })
      .from(questions)
      .where(
        and(
          ...(examId ? [eq(questions.examId, examId)] : []),
          or(
            ilike(questions.subject, searchPattern),
            ...(searchTerms.length > 1
              ? searchTerms.slice(1).map((t) => ilike(questions.subject, `%${t}%`))
              : []),
          ),
        ),
      )
      .groupBy(questions.subject)
      .limit(5);

    for (const row of questionRows) {
      results.push({
        title: `${row.subject} Questions (${row.count} questions)`,
        sourceUrl: `internal://questions/${row.subject}`,
        sourceName: "ExamForge Internal",
        sourceDomain: "examforge.app",
        contentType: "question_set",
        snippet: `${row.count} questions available in your question bank for ${row.subject}`,
        matchQuality: "high",
        relevanceScore: 0.8,
        sourceQuality: "established",
        metadata: { questionCount: row.count, source: "internal" },
      });
    }

    // Search existing syllabi
    const syllabusRows = await db
      .select({
        id: syllabi.id,
        name: syllabi.name,
      })
      .from(syllabi)
      .where(ilike(syllabi.name, searchPattern))
      .limit(3);

    for (const row of syllabusRows) {
      results.push({
        title: row.name,
        sourceUrl: `internal://syllabi/${row.id}`,
        sourceName: "ExamForge Internal",
        sourceDomain: "examforge.app",
        contentType: "syllabus",
        snippet: `Syllabus available in your library`,
        matchQuality: "high",
        relevanceScore: 0.9,
        sourceQuality: "established",
        metadata: { source: "internal" },
      });
    }

    // Search user's saved content
    const savedRows = await db
      .select({
        id: userSavedContent.id,
        title: userSavedContent.title,
        contentType: userSavedContent.contentType,
        sourceName: userSavedContent.sourceName,
      })
      .from(userSavedContent)
      .where(and(eq(userSavedContent.userId, userId), ilike(userSavedContent.title, searchPattern)))
      .limit(3);

    for (const row of savedRows) {
      results.push({
        title: `${row.title} (Saved)`,
        sourceUrl: `internal://saved/${row.id}`,
        sourceName: row.sourceName ?? "Saved Content",
        sourceDomain: "examforge.app",
        contentType: row.contentType as SearchResultItem["contentType"],
        snippet: `Previously saved content`,
        matchQuality: "high",
        relevanceScore: 0.85,
        sourceQuality: "established",
        metadata: { source: "internal_saved" },
      });
    }
  } catch (err) {
    console.error("Internal DB search failed:", err);
  }

  return results;
}

// ─── Perplexity Web Search ───

async function searchPerplexity(
  db: Database,
  userId: string,
  parsedQuery: ParsedQuery,
): Promise<SearchResultItem[]> {
  const intentText: Record<string, string> = {
    previous_questions: "previous year question papers with answers",
    syllabus: "exam syllabus PDF",
    mock_test: "mock test papers",
    study_material: "study material and notes",
    answer_key: "answer key",
    notification: "exam notification and dates",
    general: "exam resources",
  };

  const searchParts = [
    parsedQuery.examName,
    parsedQuery.examYear ? String(parsedQuery.examYear) : null,
    parsedQuery.subject,
    intentText[parsedQuery.intent] ?? "exam resources",
  ].filter(Boolean);

  const searchQuery = searchParts.join(" ");

  const prompt = `Search for: ${searchQuery}

Find official question papers, syllabus, solved papers, and study material.

For each result, output ONE line in this exact format:
RESULT|title|url|source_name|description

Example:
RESULT|GPAT 2024 Question Paper PDF|https://nta.ac.in/Download/QP-GPAT|NTA Official|Official GPAT 2024 question paper download
RESULT|GPAT Previous Year Solved Papers|https://testbook.com/gpat-papers|Testbook|Collection of GPAT solved papers with answers

Return up to 10 results. Prioritize official sources, then established platforms.`;

  try {
    // Perplexity doesn't support generateObject — use streaming text
    const streamResult = await routeStreamingRequest(
      {
        task: "search_web_content",
        prompt,
        userId,
      },
      db,
    );

    const text = await streamResult.text;
    return parsePerplexityResults(text, parsedQuery);
  } catch (err) {
    console.error("Perplexity search failed:", err);
    return [];
  }
}

function parsePerplexityResults(text: string, parsedQuery: ParsedQuery): SearchResultItem[] {
  const results: SearchResultItem[] = [];
  const lines = text.split("\n");

  for (const line of lines) {
    if (!line.startsWith("RESULT|")) continue;

    const parts = line.split("|");
    if (parts.length < 5) continue;

    const [, title, url, sourceName, snippet] = parts;
    if (!title || !url) continue;

    // Validate URL
    let domain = "";
    try {
      domain = new URL(url).hostname;
    } catch {
      continue;
    }

    // Determine source quality from domain
    let sourceQuality: "official" | "established" | "community" | "unknown" = "unknown";
    const officialDomains = [
      "nta.ac.in",
      "upsc.gov.in",
      "keralapsc.gov.in",
      "ssc.nic.in",
      "ibps.in",
      "natboard.edu.in",
    ];
    const establishedDomains = [
      "testbook.com",
      "byjusexamprep.com",
      "unacademy.com",
      "embibe.com",
      "adda247.com",
    ];

    if (officialDomains.some((d) => domain.includes(d))) {
      sourceQuality = "official";
    } else if (establishedDomains.some((d) => domain.includes(d))) {
      sourceQuality = "established";
    } else if (domain.includes(".gov.") || domain.includes(".ac.") || domain.includes(".edu.")) {
      sourceQuality = "official";
    }

    // Determine content type from URL/title
    let contentType: SearchResultItem["contentType"] = "web_page";
    const lowerTitle = title.toLowerCase();
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.endsWith(".pdf") || lowerTitle.includes("pdf")) {
      contentType = "pdf";
    } else if (lowerTitle.includes("syllabus")) {
      contentType = "syllabus";
    } else if (lowerTitle.includes("answer key")) {
      contentType = "answer_key";
    } else if (lowerTitle.includes("question") || lowerTitle.includes("paper")) {
      contentType = "question_set";
    }

    results.push({
      title: title.trim(),
      sourceUrl: url.trim(),
      sourceName: sourceName?.trim(),
      sourceDomain: domain,
      contentType,
      snippet: snippet?.trim(),
      matchQuality: "medium",
      relevanceScore: 0.6,
      sourceQuality,
      metadata: {
        source: "perplexity",
        year: parsedQuery.examYear,
      },
    });
  }

  return results;
}

// ─── Build portal-based results from known portals ───

function buildPortalResults(parsedQuery: ParsedQuery): SearchResultItem[] {
  const results: SearchResultItem[] = [];

  if (!parsedQuery.examName) return results;

  const portals = EXAM_PORTAL_MAP[parsedQuery.examName];
  if (portals) {
    for (const portal of portals) {
      if (portal.archiveUrl) {
        results.push({
          title: `${parsedQuery.examName} ${parsedQuery.examYear ?? ""} - ${portal.name}`.trim(),
          sourceUrl: portal.archiveUrl,
          sourceName: portal.name,
          sourceDomain: portal.domain,
          contentType: "pdf",
          snippet: `Official question papers and resources from ${portal.name}`,
          matchQuality: "high",
          relevanceScore: 0.9,
          sourceQuality: portal.quality,
          metadata: { portal: true },
        });
      }
      if (portal.syllabusUrl && parsedQuery.intent === "syllabus") {
        results.push({
          title: `${parsedQuery.examName} Syllabus - ${portal.name}`,
          sourceUrl: portal.syllabusUrl,
          sourceName: portal.name,
          sourceDomain: portal.domain,
          contentType: "syllabus",
          snippet: `Official syllabus from ${portal.name}`,
          matchQuality: "high",
          relevanceScore: 0.95,
          sourceQuality: portal.quality,
          metadata: { portal: true },
        });
      }
    }
  }

  // Add generic sources
  for (const source of GENERIC_SOURCES) {
    const yearPart = parsedQuery.examYear ? `+${parsedQuery.examYear}` : "";
    const searchUrl = `https://${source.domain}/search?q=${encodeURIComponent(parsedQuery.examName)}${yearPart}`;
    results.push({
      title: `${parsedQuery.examName} ${parsedQuery.examYear ?? ""} on ${source.name}`.trim(),
      sourceUrl: searchUrl,
      sourceName: source.name,
      sourceDomain: source.domain,
      contentType: "web_page",
      snippet: `Search results from ${source.name}`,
      matchQuality: "medium",
      relevanceScore: 0.5,
      sourceQuality: source.quality,
      metadata: { generic: true },
    });
  }

  return results;
}

// ─── Deduplication ───

function deduplicateResults(results: SearchResultItem[]): SearchResultItem[] {
  const seen = new Set<string>();
  const deduped: SearchResultItem[] = [];

  for (const result of results) {
    try {
      const url = new URL(result.sourceUrl);
      const key = `${url.hostname}${url.pathname}`.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(result);
      }
    } catch {
      // For internal URLs, use the full sourceUrl
      if (!seen.has(result.sourceUrl)) {
        seen.add(result.sourceUrl);
        deduped.push(result);
      }
    }
  }

  return deduped;
}

// ─── Main Search Function ───

export async function searchContent(params: SearchParams, db: Database): Promise<SearchResponse> {
  const redis = getRedisClient();
  const cacheKey = buildSearchCacheKey(params.query, params.filters);

  // 1. Check cache
  const cached = await redis.get(cacheKey).catch(() => null);
  if (cached) {
    try {
      const cachedData = JSON.parse(cached) as {
        results: Array<SearchResultItem & { id: string }>;
      };

      // Create a new search record pointing to cached data
      const [search] = await db
        .insert(contentSearches)
        .values({
          userId: params.userId,
          queryText: params.query,
          parsedQuery: {},
          resultsCount: cachedData.results.length,
          searchStrategiesUsed: ["cache"],
          cacheKey,
        })
        .returning({ id: contentSearches.id });

      return {
        searchId: search!.id,
        results: cachedData.results,
        fromCache: true,
        totalResults: cachedData.results.length,
      };
    } catch {
      // Cache parse failed, continue with fresh search
    }
  }

  // 2. Parse query with AI
  const { systemPrompt, prompt } = buildQueryParserPrompt(params.query);
  let parsedQuery: ParsedQuery;
  let aiTokensUsed = 0;
  let aiCostUsd = 0;
  let aiProvider: string | undefined;

  try {
    const parseResult = await routeAIRequest(
      {
        task: "parse_content_query",
        prompt,
        systemPrompt,
        schema: parsedQuerySchema,
        userId: params.userId,
      },
      db,
    );
    parsedQuery = parseResult.data;
    aiTokensUsed = parseResult.usage.totalTokens;
    aiCostUsd = parseResult.estimatedCostUsd;
    aiProvider = `${parseResult.provider}/${parseResult.model}`;
  } catch (err) {
    console.error("Query parsing failed, using fallback:", err);
    // Fallback: simple keyword extraction
    parsedQuery = {
      intent: "general",
      examName: null,
      examYear: null,
      subject: null,
      contentFormat: "any",
      keywords: params.query.split(/\s+/).filter((w) => w.length > 2),
      specificSource: null,
    };
  }

  // 3. Execute strategies in parallel
  const strategiesUsed: string[] = [];
  const [internalResults, portalResults, perplexityResults] = await Promise.allSettled([
    searchInternalDB(db, params.userId, parsedQuery, params.filters.examId).then((r) => {
      if (r.length > 0) strategiesUsed.push("internal");
      return r;
    }),
    Promise.resolve(buildPortalResults(parsedQuery)).then((r) => {
      if (r.length > 0) strategiesUsed.push("portal");
      return r;
    }),
    searchPerplexity(db, params.userId, parsedQuery).then((r) => {
      if (r.length > 0) strategiesUsed.push("perplexity");
      return r;
    }),
  ]);

  // 4. Aggregate results
  const allResults: SearchResultItem[] = [
    ...(internalResults.status === "fulfilled" ? internalResults.value : []),
    ...(portalResults.status === "fulfilled" ? portalResults.value : []),
    ...(perplexityResults.status === "fulfilled" ? perplexityResults.value : []),
  ];

  // 5. Apply filters
  let filtered = allResults;
  if (params.filters.contentType && params.filters.contentType !== "all") {
    const typeMap: Record<string, string[]> = {
      previous_questions: ["pdf", "question_set", "web_page"],
      syllabus: ["syllabus"],
      mock_test: ["question_set", "web_page"],
      study_material: ["study_material", "web_page"],
      answer_key: ["answer_key", "pdf"],
    };
    const allowed = typeMap[params.filters.contentType];
    if (allowed) {
      filtered = filtered.filter((r) => allowed.includes(r.contentType));
    }
  }
  if (params.filters.format && params.filters.format !== "all") {
    if (params.filters.format === "pdf") {
      filtered = filtered.filter((r) => r.contentType === "pdf");
    } else if (params.filters.format === "web") {
      filtered = filtered.filter((r) => r.contentType !== "pdf");
    }
  }

  // 6. Deduplicate
  const deduped = deduplicateResults(filtered);

  // 7. Score and rank
  const scored = deduped.map((r) => {
    const score = scoreResult(r, parsedQuery);
    return {
      ...r,
      relevanceScore: score,
      matchQuality: assignMatchQuality(score),
    };
  });
  scored.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // 8. Save to DB
  const [search] = await db
    .insert(contentSearches)
    .values({
      userId: params.userId,
      queryText: params.query,
      parsedQuery: parsedQuery as unknown as Record<string, unknown>,
      resultsCount: scored.length,
      searchStrategiesUsed: strategiesUsed,
      aiProvider,
      aiTokensUsed,
      aiCostUsd,
      cacheKey,
    })
    .returning({ id: contentSearches.id });

  const savedResults: Array<SearchResultItem & { id: string }> = [];

  if (scored.length > 0) {
    const rows = await db
      .insert(searchResults)
      .values(
        scored.map((r, idx) => ({
          searchId: search!.id,
          title: r.title,
          sourceUrl: r.sourceUrl,
          sourceName: r.sourceName,
          sourceDomain: r.sourceDomain,
          contentType: r.contentType,
          snippet: r.snippet,
          matchQuality: r.matchQuality,
          relevanceScore: r.relevanceScore,
          sourceQuality: r.sourceQuality ?? "unknown",
          metadata: (r.metadata ?? {}) as Record<string, unknown>,
          sortOrder: idx,
        })),
      )
      .returning({ id: searchResults.id });

    for (let i = 0; i < rows.length; i++) {
      savedResults.push({ ...scored[i]!, id: rows[i]!.id });
    }
  }

  // 9. Cache results
  await redis
    .set(cacheKey, JSON.stringify({ results: savedResults }), "EX", SEARCH_CACHE_TTL)
    .catch((err: unknown) => {
      console.warn("Failed to cache search results:", err);
    });

  return {
    searchId: search!.id,
    results: savedResults,
    fromCache: false,
    totalResults: savedResults.length,
  };
}
