import { Queue } from "bullmq";
import { getBullMQConnection } from "../lib/bullmq-connection.js";

export const PORTAL_INGESTION_QUEUE_NAME = "portal-ingestion";

export type IngestPortalJobData = {
  url: string;
  portalName: string;
  pageType: string;
  examId?: string;
  runId: string;
  userId: string;
};

type PortalIngestionQueue = Queue<IngestPortalJobData>;

let portalIngestionQueue: PortalIngestionQueue | null = null;

function createQueue(): PortalIngestionQueue {
  return new Queue(PORTAL_INGESTION_QUEUE_NAME, {
    connection: getBullMQConnection(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  }) as PortalIngestionQueue;
}

export function getPortalIngestionQueue(): PortalIngestionQueue {
  if (!portalIngestionQueue) {
    portalIngestionQueue = createQueue();
  }
  return portalIngestionQueue;
}

export async function addPortalIngestionJob(data: IngestPortalJobData): Promise<string> {
  const queue = getPortalIngestionQueue();
  const job = await queue.add(`ingest:${data.portalName}`, data);
  return job.id!;
}

export async function closePortalIngestionQueue(): Promise<void> {
  if (portalIngestionQueue) {
    await portalIngestionQueue.close();
    portalIngestionQueue = null;
  }
}
