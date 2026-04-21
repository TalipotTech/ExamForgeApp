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
import { createTutorialAgentWorker } from "./tutorial-agent-worker.js";
import { closeTutorialAgentQueue } from "../queues/tutorial-agent-queue.js";
import { createNoteSummaryWorker } from "./note-summary-worker.js";
import { closeNoteSummaryQueue, scheduleNoteSummaryJob } from "../queues/note-summary-queue.js";
import { createPatternAnalysisWorker } from "./pattern-analysis-worker.js";
import { closePatternAnalysisQueue } from "../queues/pattern-analysis-queue.js";
import { createUniversalDiscoveryWorker } from "./universal-discovery-worker.js";
import { closeUniversalDiscoveryQueue } from "../queues/universal-discovery-queue.js";
import { createVerificationWorker } from "./verification-worker.js";
import { closeVerificationQueue } from "../queues/verification-queue.js";
import { createTopicGenerationWorker } from "./topic-generation-worker.js";
import { closeTopicGenerationQueue } from "../queues/topic-generation-queue.js";
import { createPatternExamGenerationWorker } from "./pattern-exam-generation-worker.js";
import { closePatternExamGenerationQueue } from "../queues/pattern-exam-generation-queue.js";

async function main(): Promise<void> {
  console.log("[workers] Starting ExamForge workers...");

  const scraperWorker = createScraperWorker();
  const portalIngestionWorker = createPortalIngestionWorker();
  const portalProcessingWorker = createPortalProcessingWorker();
  const syllabusWorker = createSyllabusWorker();
  const tutorialAgentWorker = createTutorialAgentWorker();
  const noteSummaryWorker = createNoteSummaryWorker();
  const patternAnalysisWorker = createPatternAnalysisWorker();
  const universalDiscoveryWorker = createUniversalDiscoveryWorker();
  const verificationWorker = createVerificationWorker();
  const topicGenerationWorker = createTopicGenerationWorker();
  const patternExamGenerationWorker = createPatternExamGenerationWorker();

  // Schedule daily note summary generation
  await scheduleNoteSummaryJob();

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`[workers] Received ${signal}, shutting down...`);
    await scraperWorker.close();
    await portalIngestionWorker.close();
    await portalProcessingWorker.close();
    await syllabusWorker.close();
    await tutorialAgentWorker.close();
    await noteSummaryWorker.close();
    await patternAnalysisWorker.close();
    await universalDiscoveryWorker.close();
    await verificationWorker.close();
    await topicGenerationWorker.close();
    await patternExamGenerationWorker.close();
    await closeScraperQueue();
    await closePortalIngestionQueue();
    await closePortalProcessingQueue();
    await closeSyllabusQueue();
    await closeTutorialAgentQueue();
    await closeNoteSummaryQueue();
    await closePatternAnalysisQueue();
    await closeUniversalDiscoveryQueue();
    await closeVerificationQueue();
    await closeTopicGenerationQueue();
    await closePatternExamGenerationQueue();
    console.log("[workers] Shutdown complete.");
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  console.log(
    "[workers] Scraper + Portal Ingestion + Portal Processing + Syllabus + Tutorial Agent + Note Summary + Pattern Analysis + Universal Discovery + Verification + Topic Generation + Pattern Exam Generation workers started. Waiting for jobs...",
  );
}

main().catch((err) => {
  console.error("[workers] Failed to start:", err);
  process.exit(1);
});
