import { Worker } from "bullmq";
import { createDatabase } from "@examforge/shared/db";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { EARNINGS_SETTLEMENT_QUEUE_NAME } from "../queues/earnings-settlement-queue.js";
import { settleMatureEarnings } from "../services/marketplace-purchase.js";

export function createEarningsSettlementWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    EARNINGS_SETTLEMENT_QUEUE_NAME,
    async (job) => {
      console.log(`[earnings-settlement] Running (trigger=${job.data.trigger})`);
      const result = await settleMatureEarnings(db);
      console.log(`[earnings-settlement] Settled ${result.settledCount} earnings`);
      return result;
    },
    { connection: getBullMQConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => {
    console.log(`[earnings-settlement] Job ${job?.id} completed:`, job?.returnvalue);
  });
  worker.on("failed", (job, err) => {
    console.error(`[earnings-settlement] Job ${job?.id} failed:`, err);
  });

  return worker;
}
