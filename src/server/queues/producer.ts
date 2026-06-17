import type { JobsOptions } from "bullmq";
import { whatsappQueue } from "@/server/queues/client";
import { logger } from "@/server/observability/logger";

type WhatsAppConnectionJob =
  | { action: "connect" | "reconnect" | "sync" | "disconnect"; accountId: string }
  | { action: "pairing"; accountId: string; phoneNumber: string };

export async function enqueueWhatsAppJob(name: string, data: WhatsAppConnectionJob, options?: JobsOptions) {
  const queue = whatsappQueue();
  try {
    logger.info("queue.whatsapp.enqueue.started", {
      jobName: name,
      accountId: data.accountId,
      action: data.action,
    });
    const job = await queue.add(name, data, options);
    logger.info("whatsapp.connect.job.enqueued", {
      jobName: name,
      jobId: job.id,
      accountId: data.accountId,
      action: data.action,
    });
    logger.info("queue.whatsapp.enqueue.completed", {
      jobName: name,
      jobId: job.id,
      accountId: data.accountId,
      action: data.action,
    });
    return job;
  } catch (error) {
    logger.error("queue.whatsapp.enqueue.failed", error, {
      jobName: name,
      accountId: data.accountId,
      action: data.action,
    });
    throw error;
  } finally {
    await queue.close().catch((error) => logger.warn("queue.whatsapp.close_failed", { message: error instanceof Error ? error.message : String(error) }));
  }
}
