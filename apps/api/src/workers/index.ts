import { config } from "dotenv";
config({ path: "../../.env.local" });

import { createScraperWorker } from "./scraper-worker.js";
import { closeScraperQueue } from "../queues/scraper-queue.js";

async function main(): Promise<void> {
  console.log("[workers] Starting ExamForge workers...");

  const scraperWorker = createScraperWorker();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[workers] Received ${signal}, shutting down...`);
    await scraperWorker.close();
    await closeScraperQueue();
    console.log("[workers] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log("[workers] Scraper worker started. Waiting for jobs...");
}

main().catch((err) => {
  console.error("[workers] Failed to start:", err);
  process.exit(1);
});
