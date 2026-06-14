import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const EARNINGS_SETTLEMENT_QUEUE_NAME = "earnings-settlement";

type EarningsSettlementJobData = {
  trigger: "scheduled" | "manual";
};

type EarningsSettlementQueue = Queue<EarningsSettlementJobData>;

let queueInstance: EarningsSettlementQueue | null = null;

function createQueue(): EarningsSettlementQueue {
  return new Queue(EARNINGS_SETTLEMENT_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: "exponential", delay: 60_000 },
      removeOnComplete: { count: 30 },
      removeOnFail: { count: 50 },
    },
  }) as EarningsSettlementQueue;
}

export function getEarningsSettlementQueue(): EarningsSettlementQueue {
  if (!queueInstance) {
    queueInstance = createQueue();
  }
  return queueInstance;
}

/**
 * Daily cron at 02:30 IST (21:00 UTC previous day) — shifts all matured
 * marketplace earnings from pending → available and reflects the balance
 * move on the creator wallet.
 */
export async function scheduleEarningsSettlementJob(): Promise<void> {
  const queue = getEarningsSettlementQueue();
  await queue.upsertJobScheduler(
    "earnings-settlement-daily",
    { pattern: "30 2 * * *" },
    { name: "settle-mature-earnings", data: { trigger: "scheduled" } },
  );
}

export async function closeEarningsSettlementQueue(): Promise<void> {
  if (queueInstance) {
    await queueInstance.close();
    queueInstance = null;
  }
}
