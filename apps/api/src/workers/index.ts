import { config } from "dotenv";
config({ path: "../../.env.local" });

import { createScraperWorker } from "./scraper-worker.js";
import { closeScraperQueue } from "../queues/scraper-queue.js";
import { createPortalIngestionWorker } from "./portal-ingestion-worker.js";
import { closePortalIngestionQueue } from "../queues/portal-ingestion-queue.js";
import { createPortalProcessingWorker } from "./portal-processing-worker.js";
import { closePortalProcessingQueue } from "../queues/portal-processing-queue.js";
import { createSyllabusWorker } from "./syllabus-processor.js";
import { closeSyllabusQueue } from "../queues/syllabus-queue.js";

async function main(): Promise<void> {
  console.log("[workers] Starting ExamForge workers...");

  const scraperWorker = createScraperWorker();
  const portalIngestionWorker = createPortalIngestionWorker();
  const portalProcessingWorker = createPortalProcessingWorker();
  const syllabusWorker = createSyllabusWorker();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[workers] Received ${signal}, shutting down...`);
    await scraperWorker.close();
    await portalIngestionWorker.close();
    await portalProcessingWorker.close();
    await syllabusWorker.close();
    await closeScraperQueue();
    await closePortalIngestionQueue();
    await closePortalProcessingQueue();
    await closeSyllabusQueue();
    console.log("[workers] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(
    "[workers] Scraper + Portal Ingestion + Portal Processing + Syllabus workers started. Waiting for jobs...",
  );
}

main().catch((err) => {
  console.error("[workers] Failed to start:", err);
  process.exit(1);
});
