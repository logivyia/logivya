import { Queue } from "bullmq";
import type { WhatsAppIngestionStage } from "@prisma/client";

import { redisConnectionOptions } from "@/server/queues/client";
import {
  ingestionJobId,
  WHATSAPP_INGESTION_JOB_OPTIONS,
  WHATSAPP_INGESTION_QUEUE_NAMES,
  type WhatsAppIngestionJob,
} from "@/server/whatsapp-ingestion/contracts";

export function whatsappIngestionQueue(stage: Exclude<WhatsAppIngestionStage, "COMPLETED">) {
  return new Queue<WhatsAppIngestionJob>(WHATSAPP_INGESTION_QUEUE_NAMES[stage], {
    connection: redisConnectionOptions(),
    defaultJobOptions: WHATSAPP_INGESTION_JOB_OPTIONS,
  });
}

export async function enqueueWhatsAppIngestionStage(input: WhatsAppIngestionJob) {
  const queue = whatsappIngestionQueue(input.stage);
  try {
    return await queue.add(input.stage, input, {
      ...WHATSAPP_INGESTION_JOB_OPTIONS,
      jobId: ingestionJobId(input),
    });
  } finally {
    await queue.close().catch(() => undefined);
  }
}
