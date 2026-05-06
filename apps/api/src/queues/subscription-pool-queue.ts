import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const SUBSCRIPTION_POOL_QUEUE_NAME = "subscription-pool";

export type SubscriptionPoolJobData = {
  trigger: "scheduled" | "manual";
  /** "YYYY-MM" — when omitted, the worker derives the previous month at runtime. */
  periodMonth?: string;
  /** Caller (admin user id) for audit trails. Omitted for scheduled runs. */
  triggeredBy?: string;
};

type SubscriptionPoolQueue = Queue<SubscriptionPoolJobData>;

let queueInstance: SubscriptionPoolQueue | null = null;

function createQueue(): SubscriptionPoolQueue {
  return new Queue(SUBSCRIPTION_POOL_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 5 * 60_000 },
      removeOnComplete: { count: 24 },
      removeOnFail: { count: 50 },
    },
  }) as SubscriptionPoolQueue;
}

export function getSubscriptionPoolQueue(): SubscriptionPoolQueue {
  if (!queueInstance) {
    queueInstance = createQueue();
  }
  return queueInstance;
}

/**
 * Repeatable cron: fires at 20:30 UTC on the 1st of every month, which is
 * 02:00 IST on the 2nd. The worker resolves the *previous* calendar month
 * at runtime, so the firing-day-vs-IST-day skew is harmless. Service-layer
 * idempotency (unique `(creator_id, period_month)`) guards against
 * accidental re-runs.
 */
export async function scheduleSubscriptionPoolJob(): Promise<void> {
  const queue = getSubscriptionPoolQueue();
  await queue.upsertJobScheduler(
    "subscription-pool-monthly",
    { pattern: "30 20 1 * *" },
    {
      name: "distribute-subscription-pool",
      data: { trigger: "scheduled" },
    },
  );
}

/**
 * Admin-triggered one-shot run for a specific period (defaults to previous
 * month if omitted). Idempotent at the service layer.
 */
export async function enqueueSubscriptionPoolRun(
  periodMonth: string | undefined,
  triggeredBy: string,
): Promise<{ jobId: string }> {
  const queue = getSubscriptionPoolQueue();
  const job = await queue.add(
    "distribute-subscription-pool",
    { trigger: "manual", periodMonth, triggeredBy },
    {
      jobId: `manual-${periodMonth ?? "auto"}-${Date.now()}`,
    },
  );
  return { jobId: job.id ?? "unknown" };
}

export async function closeSubscriptionPoolQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
