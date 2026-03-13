import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const PORTAL_PROCESSING_QUEUE_NAME = "portal-processing";

export type ProcessDocumentJobData = {
  documentId: string;
  userId: string;
  orgId: string;
};

type PortalProcessingQueue = Queue<ProcessDocumentJobData>;

let portalProcessingQueue: PortalProcessingQueue | null = null;

function createQueue(): PortalProcessingQueue {
  return new Queue(PORTAL_PROCESSING_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 200 },
    },
  }) as PortalProcessingQueue;
}

export function getPortalProcessingQueue(): PortalProcessingQueue {
  if (!portalProcessingQueue) {
    portalProcessingQueue = createQueue();
  }
  return portalProcessingQueue;
}

export async function addProcessDocumentJob(data: ProcessDocumentJobData): Promise<string> {
  const queue = getPortalProcessingQueue();
  const job = await queue.add(`process:${data.documentId}`, data);
  return job.id!;
}

export async function addProcessDocumentJobs(
  documents: Array<{ documentId: string; userId: string; orgId: string }>,
): Promise<string[]> {
  const queue = getPortalProcessingQueue();
  const jobs = await queue.addBulk(
    documents.map((d) => ({
      name: `process:${d.documentId}`,
      data: d,
    })),
  );
  return jobs.map((j) => j.id!);
}

export async function closePortalProcessingQueue(): Promise<void> {
  if (portalProcessingQueue) {
    await portalProcessingQueue.close();
    portalProcessingQueue = null;
  }
}
