import { eq, ilike } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import type { AiProvider } from "@examforge/shared/types";
import { exams, examNotifications, discoveryRuns } from "@examforge/shared/db/schema";
import { discoveryAgentResponseSchema } from "@examforge/shared/validators";
import type { DiscoveredExam, DiscoveredNotification } from "@examforge/shared/validators";
import { EXAM_PORTALS } from "@examforge/shared/constants";
import type { PortalConfig } from "@examforge/shared/constants";
import { routeAIRequest } from "../ai/ai-router.js";
import { buildExamDiscoveryPrompt } from "../ai/prompts/exam-discovery.js";
import { crawlPages } from "./scraper/crawler.js";

// ─── Discovery Agent Options ───

export type DiscoveryOptions = {
  portals?: string[];
  aiProvider?: string;
  maxPagesPerPortal?: number;
  crawlerType?: "cheerio" | "playwright" | "auto";
};

// ─── Discovery Agent Result ───

type DiscoveryResult = {
  portalsChecked: string[];
  examsFound: number;
  examsNew: number;
  examsUpdated: number;
  notificationsCreated: number;
  totalTokens: number;
  totalCost: number;
};

// ─── Resolve Crawler Type ───

function resolveCrawlerType(
  portal: PortalConfig,
  requestedType: "cheerio" | "playwright" | "auto",
): "cheerio" | "playwright" {
  if (requestedType !== "auto") return requestedType;
  return portal.preferredCrawler;
}

// ─── Map Provider Name ───

function mapProviderOverride(provider: string): AiProvider | undefined {
  switch (provider) {
    case "anthropic":
    case "claude":
      return "anthropic";
    case "openai":
      return "openai";
    case "google":
    case "gemini":
      return "google";
    case "mistral":
      return "mistral";
    default:
      return undefined;
  }
}

// ─── Main Discovery Function ───

export async function runExamDiscovery(
  db: Database,
  userId: string,
  orgId: string,
  options?: DiscoveryOptions,
): Promise<DiscoveryResult> {
  const crawlerType = options?.crawlerType ?? "auto";
  const maxPages = options?.maxPagesPerPortal ?? 3;
  const aiProviderOverride: AiProvider | undefined = mapProviderOverride(
    options?.aiProvider ?? "auto",
  );

  // Filter portals if specific URLs were provided
  let portalsToCheck: PortalConfig[];
  if (options?.portals && options.portals.length > 0) {
    const selectedUrls = new Set(options.portals);
    portalsToCheck = EXAM_PORTALS.filter((p) => selectedUrls.has(p.url));

    // Add ad-hoc portals for URLs not in the known list
    for (const url of options.portals) {
      if (!portalsToCheck.some((p) => p.url === url)) {
        portalsToCheck.push({
          name: new URL(url).hostname,
          url,
          focusAreas: [],
          frequency: "weekly",
          preferredCrawler: "cheerio",
        });
      }
    }
  } else {
    portalsToCheck = [...EXAM_PORTALS];
  }

  // Create a discovery_run record
  const [run] = await db
    .insert(discoveryRuns)
    .values({
      agentType: "exam_discovery",
      portalsChecked: portalsToCheck.map((p) => p.url),
      status: "running",
      aiProvider: options?.aiProvider ?? "auto",
      crawlerType,
      maxPagesPerPortal: maxPages,
    })
    .returning();

  const result: DiscoveryResult = {
    portalsChecked: [],
    examsFound: 0,
    examsNew: 0,
    examsUpdated: 0,
    notificationsCreated: 0,
    totalTokens: 0,
    totalCost: 0,
  };

  const errorLog: Array<{ time: string; message: string }> = [];

  try {
    for (const portal of portalsToCheck) {
      try {
        const resolvedCrawler = resolveCrawlerType(portal, crawlerType);
        let portalResult: PortalResult;
        try {
          portalResult = await processPortal(
            portal,
            db,
            userId,
            orgId,
            resolvedCrawler,
            maxPages,
            aiProviderOverride,
          );
        } catch (crawlError) {
          // If Playwright fails (e.g. browser not installed), fall back to Cheerio
          if (resolvedCrawler === "playwright") {
            const errMsg = crawlError instanceof Error ? crawlError.message : String(crawlError);
            console.warn(
              `[discovery] Playwright failed for ${portal.name}, falling back to Cheerio: ${errMsg.slice(0, 100)}`,
            );
            errorLog.push({
              time: new Date().toISOString(),
              message: `${portal.name}: Playwright failed, retrying with Cheerio`,
            });
            portalResult = await processPortal(
              portal,
              db,
              userId,
              orgId,
              "cheerio",
              maxPages,
              aiProviderOverride,
            );
          } else {
            throw crawlError;
          }
        }
        result.portalsChecked.push(portal.url);
        result.examsFound += portalResult.examsFound;
        result.examsNew += portalResult.examsNew;
        result.examsUpdated += portalResult.examsUpdated;
        result.notificationsCreated += portalResult.notificationsCreated;
        result.totalTokens += portalResult.tokensUsed;
        result.totalCost += portalResult.costUsd;
      } catch (portalError) {
        const errMsg = portalError instanceof Error ? portalError.message : String(portalError);
        console.error(`[discovery] Error checking ${portal.name}:`, errMsg);
        errorLog.push({ time: new Date().toISOString(), message: `${portal.name}: ${errMsg}` });
      }
    }

    // Update discovery run record
    await db
      .update(discoveryRuns)
      .set({
        status: "completed",
        completedAt: new Date(),
        examsFound: result.examsFound,
        examsNew: result.examsNew,
        examsUpdated: result.examsUpdated,
        notificationsCreated: result.notificationsCreated,
        aiTokensUsed: result.totalTokens,
        aiCostUsd: result.totalCost,
        errorLog: errorLog.length > 0 ? errorLog : [],
      })
      .where(eq(discoveryRuns.id, run!.id));

    console.log(
      `[discovery] Completed: ${result.examsFound} exams found, ` +
        `${result.examsNew} new, ${result.examsUpdated} updated, ` +
        `${result.notificationsCreated} notifications`,
    );

    return result;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    errorLog.push({ time: new Date().toISOString(), message: errMsg });

    await db
      .update(discoveryRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        examsFound: result.examsFound,
        examsNew: result.examsNew,
        examsUpdated: result.examsUpdated,
        notificationsCreated: result.notificationsCreated,
        aiTokensUsed: result.totalTokens,
        aiCostUsd: result.totalCost,
        errorLog,
      })
      .where(eq(discoveryRuns.id, run!.id));

    throw error;
  }
}

// ─── Process a Single Portal ───

type PortalResult = {
  examsFound: number;
  examsNew: number;
  examsUpdated: number;
  notificationsCreated: number;
  tokensUsed: number;
  costUsd: number;
};

async function processPortal(
  portal: PortalConfig,
  db: Database,
  userId: string,
  orgId: string,
  crawlerType: "cheerio" | "playwright",
  maxPages: number,
  aiProviderOverride?: string,
): Promise<PortalResult> {
  console.log(
    `[discovery] Checking portal: ${portal.name} (${portal.url}) [${crawlerType}, ${maxPages} pages]`,
  );

  // 1. Crawl the portal
  const pages = await crawlPages({
    startUrl: portal.url,
    maxPages,
    crawlerType,
    fetchDelayMs: 2000,
  });

  if (pages.length === 0) {
    console.warn(
      `[discovery] No pages crawled from ${portal.name} (${portal.url}) using ${crawlerType}`,
    );
    // If Playwright returned 0 pages, throw so the caller can fall back to Cheerio
    if (crawlerType === "playwright") {
      throw new Error(
        `Playwright returned 0 pages from ${portal.name} — site may block headless browsers`,
      );
    }
    return {
      examsFound: 0,
      examsNew: 0,
      examsUpdated: 0,
      notificationsCreated: 0,
      tokensUsed: 0,
      costUsd: 0,
    };
  }

  console.log(`[discovery] Crawled ${pages.length} pages from ${portal.name}`);

  // 2. Combine content from crawled pages
  const combinedContent = pages
    .map((p) => `--- ${p.title} (${p.url}) ---\n${p.textContent}`)
    .join("\n\n");

  // 3. Run AI extraction
  const { systemPrompt, prompt } = buildExamDiscoveryPrompt(combinedContent, {
    portalName: portal.name,
    portalUrl: portal.url,
    focusAreas: portal.focusAreas,
  });

  const aiResult = await routeAIRequest(
    {
      task: "discover_exams",
      prompt,
      systemPrompt,
      schema: discoveryAgentResponseSchema,
      userId,
      skipCache: true,
      temperature: 0.1,
      overrideProvider: aiProviderOverride as AiProvider | undefined,
    },
    db,
  );

  const discovered = aiResult.data;
  const portalResult: PortalResult = {
    examsFound: discovered.exams.length,
    examsNew: 0,
    examsUpdated: 0,
    notificationsCreated: 0,
    tokensUsed: aiResult.usage.totalTokens,
    costUsd: aiResult.estimatedCostUsd,
  };

  console.log(
    `[discovery] AI extracted ${discovered.exams.length} exams, ` +
      `${discovered.notifications.length} notifications from ${portal.name} ` +
      `(relevance: ${discovered.portalRelevance}, provider: ${aiResult.provider})`,
  );

  if (discovered.portalRelevance === "none") {
    return portalResult;
  }

  // 4. Process discovered exams
  for (const exam of discovered.exams) {
    const isNew = await upsertDiscoveredExam(exam, portal, db, orgId);
    if (isNew) {
      portalResult.examsNew++;
    } else {
      portalResult.examsUpdated++;
    }
  }

  // 5. Process notifications
  for (const notif of discovered.notifications) {
    const created = await createNotificationIfNew(notif, db);
    if (created) {
      portalResult.notificationsCreated++;
    }
  }

  return portalResult;
}

// ─── Upsert Discovered Exam ───

async function upsertDiscoveredExam(
  discovered: DiscoveredExam,
  portal: PortalConfig,
  db: Database,
  orgId: string,
): Promise<boolean> {
  // Check if exam already exists (match by name, case-insensitive)
  const [existing] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(ilike(exams.name, discovered.name))
    .limit(1);

  if (existing) {
    // Update existing exam with fresh data
    const updateData: Record<string, unknown> = {
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
    };

    if (discovered.examDate) updateData.examDate = new Date(discovered.examDate);
    if (discovered.registrationStart)
      updateData.registrationStart = new Date(discovered.registrationStart);
    if (discovered.registrationEnd)
      updateData.registrationEnd = new Date(discovered.registrationEnd);
    if (discovered.resultDate) updateData.resultDate = new Date(discovered.resultDate);
    if (discovered.dateConfidence) updateData.dateConfidence = discovered.dateConfidence;
    if (discovered.officialUrl) updateData.officialUrl = discovered.officialUrl;
    if (discovered.applicationUrl) updateData.applicationUrl = discovered.applicationUrl;
    if (discovered.status) updateData.status = discovered.status;

    await db.update(exams).set(updateData).where(eq(exams.id, existing.id));

    console.log(
      `[discovery]   Updated: ${discovered.name} (dateConfidence: ${discovered.dateConfidence ?? "n/a"})`,
    );
    return false; // updated, not new
  }

  // Create new exam as draft
  await db.insert(exams).values({
    name: discovered.name,
    category: discovered.category || "uncategorized",
    subjects: discovered.subjects ?? [],
    status: "draft",
    examDate: discovered.examDate ? new Date(discovered.examDate) : null,
    registrationStart: discovered.registrationStart ? new Date(discovered.registrationStart) : null,
    registrationEnd: discovered.registrationEnd ? new Date(discovered.registrationEnd) : null,
    resultDate: discovered.resultDate ? new Date(discovered.resultDate) : null,
    dateConfidence: discovered.dateConfidence ?? "unknown",
    officialUrl: discovered.officialUrl ?? null,
    applicationUrl: discovered.applicationUrl ?? null,
    syllabusUrl: discovered.syllabusUrl ?? null,
    conductingBody: discovered.conductingBody ?? null,
    level: discovered.level ?? "national",
    eligibility: discovered.eligibility ?? null,
    totalMarks: discovered.totalMarks ?? null,
    durationMinutes: discovered.durationMinutes ?? null,
    negativeMarking: discovered.negativeMarking ?? false,
    negativeMarkingScheme: discovered.negativeMarkingScheme ?? null,
    tags: discovered.tags ?? [],
    isAutoDiscovered: true,
    discoverySource: portal.url,
    lastCheckedAt: new Date(),
    orgId,
  });

  console.log(
    `[discovery]   NEW: ${discovered.name} (dateConfidence: ${discovered.dateConfidence ?? "unknown"})`,
  );
  return true; // new exam
}

// ─── Create Notification If Not Duplicate ───

async function createNotificationIfNew(
  notif: DiscoveredNotification,
  db: Database,
): Promise<boolean> {
  // Find the exam by name
  const [exam] = await db
    .select({ id: exams.id })
    .from(exams)
    .where(ilike(exams.name, `%${notif.examName}%`))
    .limit(1);

  if (!exam) {
    console.warn(`[discovery] Notification for unknown exam: ${notif.examName}`);
    return false;
  }

  // Check for duplicate notification (same exam, type, title)
  const [existing] = await db
    .select({ id: examNotifications.id })
    .from(examNotifications)
    .where(eq(examNotifications.examId, exam.id))
    .limit(1);

  // Simple dedup: if there's already a notification with similar title, skip
  if (existing) {
    const [dupCheck] = await db
      .select({ id: examNotifications.id })
      .from(examNotifications)
      .where(ilike(examNotifications.title, notif.title))
      .limit(1);

    if (dupCheck) return false;
  }

  await db.insert(examNotifications).values({
    examId: exam.id,
    type: notif.type,
    title: notif.title,
    description: notif.description ?? null,
    sourceUrl: notif.sourceUrl ?? null,
    isImportant: notif.isImportant ?? false,
  });

  return true;
}
