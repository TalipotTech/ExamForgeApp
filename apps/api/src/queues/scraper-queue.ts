import { Queue } from "bullmq";
import type { ScrapeJobData } from "@examforge/shared/validators";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const SCRAPER_QUEUE_NAME = "scraper";

type ScraperQueue = Queue<ScrapeJobData>;

let scraperQueue: ScraperQueue | null = null;

function createQueue(): ScraperQueue {
  return new Queue(SCRAPER_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }) as ScraperQueue;
}

export function getScraperQueue(): ScraperQueue {
  if (!scraperQueue) {
    scraperQueue = createQueue();
  }
  return scraperQueue;
}

export async function addScrapeJob(
  data: ScrapeJobData,
  opts?: { priority?: number; delay?: number },
): Promise<string> {
  const queue = getScraperQueue();
  const job = await queue.add(`scrape:${data.sourceId}`, data, {
    priority: opts?.priority,
    delay: opts?.delay,
  });
  return job.id!;
}

export async function scheduleScrapeJob(
  sourceId: string,
  data: ScrapeJobData,
  cron: string,
): Promise<void> {
  const queue = getScraperQueue();
  await queue.upsertJobScheduler(
    `scrape-schedule:${sourceId}`,
    { pattern: cron },
    { name: `scrape:${sourceId}`, data },
  );
}

export async function unscheduleScrapeJob(sourceId: string): Promise<void> {
  const queue = getScraperQueue();
  await queue.removeJobScheduler(`scrape-schedule:${sourceId}`);
}

export async function closeScraperQueue(): Promise<void> {
  if (scraperQueue) {
    await scraperQueue.close();
    scraperQueue = null;
  }
}
