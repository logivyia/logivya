import { Worker, type Job } from "bullmq";
import os from "node:os";

import { logger } from "../src/server/observability/logger";
import { deadLetterQueue, redisConnectionOptions } from "../src/server/queues/client";
import {
  WHATSAPP_INGESTION_QUEUE_NAMES,
  WHATSAPP_INGESTION_STAGES,
  type WhatsAppIngestionJob,
} from "../src/server/whatsapp-ingestion/contracts";
import {
  markWhatsAppIngestionFinalFailure,
  processWhatsAppIngestionJob,
  reconcilePendingWhatsAppIngestion,
  enforceWhatsAppIngestionRetention,
} from "../src/server/whatsapp-ingestion/processor";
import { disconnectWhatsAppIngestionHeartbeat, writeWhatsAppIngestionHeartbeat } from "../src/server/whatsapp-ingestion/heartbeat";

if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");

const workerId = process.env.WHATSAPP_INGESTION_WORKER_ID || `whatsapp-ingestion:${os.hostname()}:${process.pid}`;
const concurrency = Math.min(64, Math.max(1, Number(process.env.WHATSAPP_INGESTION_CONCURRENCY || 8)));
const workers: Worker<WhatsAppIngestionJob>[] = [];
const startedAt = new Date().toISOString();
const queueNames = WHATSAPP_INGESTION_STAGES.map((stage) => WHATSAPP_INGESTION_QUEUE_NAMES[stage]);
let shuttingDown = false;
let currentJobs = 0;
let lastSuccessfulEventAt: string | null = null;

for (const stage of WHATSAPP_INGESTION_STAGES) {
  const queueName = WHATSAPP_INGESTION_QUEUE_NAMES[stage];
  const worker = new Worker<WhatsAppIngestionJob>(
    queueName,
    async (job) => {
      currentJobs += 1;
      void heartbeat().catch((error) => logger.warn("whatsapp_ingestion.heartbeat.failed", { workerId, reason: error instanceof Error ? error.message : String(error) }));
      try {
        return await processWhatsAppIngestionJob(job.data, workerId);
      } finally {
        currentJobs = Math.max(0, currentJobs - 1);
      }
    },
    {
      connection: redisConnectionOptions(),
      concurrency: stage === "AI_CLASSIFICATION" || stage === "STRUCTURED_EXTRACTION"
        ? Math.min(concurrency, Math.max(1, Number(process.env.WHATSAPP_AI_CONCURRENCY || 4)))
        : concurrency,
      lockDuration: Math.min(10 * 60_000, Math.max(60_000, Number(process.env.WHATSAPP_INGESTION_LOCK_MS || 5 * 60_000))),
      stalledInterval: 30_000,
      maxStalledCount: 2,
    },
  );
  worker.on("ready", () => logger.info("whatsapp_ingestion.worker.ready", { workerId, queueName, stage, concurrency }));
  worker.on("completed", (job) => {
    lastSuccessfulEventAt = new Date().toISOString();
    logger.info("whatsapp_ingestion.job.completed", jobContext(job));
    void heartbeat().catch((error) => logger.warn("whatsapp_ingestion.heartbeat.failed", { workerId, reason: error instanceof Error ? error.message : String(error) }));
  });
  worker.on("failed", (job, error) => {
    logger.error("whatsapp_ingestion.job.failed", error, job ? jobContext(job) : { workerId, queueName, stage });
    if (!job || job.attemptsMade < Number(job.opts.attempts || 1)) return;
    void recordFinalFailure(job, error);
  });
  worker.on("stalled", (jobId) => logger.warn("whatsapp_ingestion.job.stalled", { workerId, queueName, stage, jobId }));
  worker.on("error", (error) => logger.error("whatsapp_ingestion.worker.error", error, { workerId, queueName, stage }));
  workers.push(worker);
}

const recoveryTimer = setInterval(() => {
  if (shuttingDown) return;
  void reconcilePendingWhatsAppIngestion(500)
    .then((result) => {
      if (result.enqueued) logger.info("whatsapp_ingestion.recovery.completed", { workerId, ...result });
    })
    .catch((error) => logger.error("whatsapp_ingestion.recovery.failed", error, { workerId }));
}, Math.min(5 * 60_000, Math.max(30_000, Number(process.env.WHATSAPP_INGESTION_RECOVERY_INTERVAL_MS || 60_000))));
recoveryTimer.unref?.();

const retentionTimer = setInterval(() => {
  if (shuttingDown) return;
  void enforceWhatsAppIngestionRetention()
    .then((result) => logger.info("whatsapp_ingestion.retention.completed", { workerId, ...result }))
    .catch((error) => logger.error("whatsapp_ingestion.retention.failed", error, { workerId }));
}, Math.min(24 * 60 * 60_000, Math.max(15 * 60_000, Number(process.env.WHATSAPP_INGESTION_RETENTION_INTERVAL_MS || 60 * 60_000))));
retentionTimer.unref?.();

const heartbeatTimer = setInterval(() => {
  if (shuttingDown) return;
  void heartbeat().catch((error) => logger.warn("whatsapp_ingestion.heartbeat.failed", { workerId, reason: error instanceof Error ? error.message : String(error) }));
}, Math.min(60_000, Math.max(10_000, Number(process.env.WHATSAPP_INGESTION_HEARTBEAT_INTERVAL_MS || 30_000))));
heartbeatTimer.unref?.();

void heartbeat().catch((error) => logger.warn("whatsapp_ingestion.heartbeat.failed", { workerId, reason: error instanceof Error ? error.message : String(error) }));

void reconcilePendingWhatsAppIngestion(1_000)
  .then((result) => logger.info("whatsapp_ingestion.startup_recovery.completed", { workerId, ...result }))
  .catch((error) => logger.error("whatsapp_ingestion.startup_recovery.failed", error, { workerId }));

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  logger.fatal("whatsapp_ingestion.worker.uncaught_exception", error, { workerId });
  void shutdown("UNCAUGHT_EXCEPTION", 1);
});
process.on("unhandledRejection", (reason) => {
  logger.error("whatsapp_ingestion.worker.unhandled_rejection", reason instanceof Error ? reason : new Error(String(reason)), { workerId });
});

async function recordFinalFailure(job: Job<WhatsAppIngestionJob>, error: Error) {
  await markWhatsAppIngestionFinalFailure(job.data, error).catch((failureError) => {
    logger.error("whatsapp_ingestion.final_failure_persistence.failed", failureError, jobContext(job));
  });
  const queue = deadLetterQueue();
  try {
    await queue.add("whatsapp-ingestion-dead-letter", {
      inboundMessageId: job.data.inboundMessageId,
      accountId: job.data.accountId,
      groupId: job.data.groupId,
      stage: job.data.stage,
      stageVersion: job.data.stageVersion,
      correlationId: job.data.correlationId,
      errorCode: error.message.slice(0, 200),
    }, { jobId: `ingestion-dlq-${job.data.inboundMessageId}-${job.data.stageVersion}-${job.data.stage}` });
  } finally {
    await queue.close().catch(() => undefined);
  }
}

function jobContext(job: Job<WhatsAppIngestionJob>) {
  return {
    workerId,
    queueName: job.queueName,
    jobId: job.id,
    inboundMessageId: job.data.inboundMessageId,
    groupId: job.data.groupId,
    stage: job.data.stage,
    stageVersion: job.data.stageVersion,
    correlationId: job.data.correlationId,
    attempt: job.attemptsMade + 1,
  };
}

function heartbeat(status: "HEALTHY" | "DRAINING" = "HEALTHY") {
  return writeWhatsAppIngestionHeartbeat({
    workerId,
    startedAt,
    lastSuccessfulEventAt,
    currentJobs,
    capacity: concurrency,
    queueNames,
    status,
  });
}

async function shutdown(reason: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(recoveryTimer);
  clearInterval(retentionTimer);
  clearInterval(heartbeatTimer);
  logger.info("whatsapp_ingestion.worker.shutdown_started", { workerId, reason });
  await heartbeat("DRAINING").catch(() => undefined);
  await Promise.allSettled(workers.map((worker) => worker.close()));
  disconnectWhatsAppIngestionHeartbeat();
  logger.info("whatsapp_ingestion.worker.shutdown_completed", { workerId, reason });
  process.exit(exitCode);
}
