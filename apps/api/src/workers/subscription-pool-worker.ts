import { Worker } from "bullmq";
import { createDatabase } from "@examforge/shared/db";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { SUBSCRIPTION_POOL_QUEUE_NAME } from "../queues/subscription-pool-queue.js";
import { distributePool, previousPeriodMonth } from "../services/subscription-pool.js";
import { getFlag } from "../services/feature-flags.js";

export function createSubscriptionPoolWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    SUBSCRIPTION_POOL_QUEUE_NAME,
    async (job) => {
      const enabled = (await getFlag(db, "creators.subscription_pool_enabled")) === true;
      if (!enabled) {
        console.log(
          `[subscription-pool] Skipped (creators.subscription_pool_enabled=false, trigger=${job.data.trigger})`,
        );
        return { status: "feature_disabled" as const };
      }

      const periodMonth = job.data.periodMonth ?? previousPeriodMonth();
      console.log(
        `[subscription-pool] Running for ${periodMonth} (trigger=${job.data.trigger}${
          job.data.triggeredBy ? `, by=${job.data.triggeredBy}` : ""
        })`,
      );

      const result = await distributePool(db, periodMonth);
      console.log(
        `[subscription-pool] ${periodMonth} ${result.status} — pool=${result.totalPoolInr}p creators=${result.creatorCount}`,
      );
      return result;
    },
    { connection: getBullMQConnection(), concurrency: 1 },
  );

  worker.on("completed", (job) => {
    console.log(`[subscription-pool] Job ${job?.id} completed:`, job?.returnvalue);
  });
  worker.on("failed", (job, err) => {
    console.error(`[subscription-pool] Job ${job?.id} failed:`, err);
  });

  return worker;
}
