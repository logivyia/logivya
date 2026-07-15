import { randomUUID } from "node:crypto";
import type { JobsOptions } from "bullmq";
import { whatsappQueue } from "@/server/queues/client";
import { logger } from "@/server/observability/logger";

type WhatsAppConnectionJob = (
  | { action: "connect" | "reconnect" | "sync" | "disconnect"; accountId: string }
  | { action: "sync-contacts"; accountId: string; syncRunId?: string }
  | { action: "pairing" | "pairing-refresh"; accountId: string; phoneNumber: string; preserveRetryCounter?: boolean }
) & { correlationId?: string };

export async function enqueueWhatsAppJob(name: string, data: WhatsAppConnectionJob, options?: JobsOptions) {
  const queue = whatsappQueue();
  const correlationId = data.correlationId || randomUUID();
  const payload = { ...data, correlationId };
  try {
    logger.info("queue.whatsapp.enqueue.started", {
      jobName: name,
      accountId: data.accountId,
      action: data.action,
      correlationId,
    });
    const job = await queue.add(name, payload, options);
    logger.info("whatsapp.connect.job.enqueued", {
      jobName: name,
      jobId: job.id,
      accountId: data.accountId,
      action: data.action,
      correlationId,
    });
    logger.info("queue.whatsapp.enqueue.completed", {
      jobName: name,
      jobId: job.id,
      accountId: data.accountId,
      action: data.action,
      correlationId,
    });
    return job;
  } catch (error) {
    logger.error("queue.whatsapp.enqueue.failed", error, {
      jobName: name,
      accountId: data.accountId,
      action: data.action,
      correlationId,
    });
    throw error;
  } finally {
    await queue.close().catch((error) => logger.error("queue.whatsapp.close_failed", error, { correlationId }));
  }
}
