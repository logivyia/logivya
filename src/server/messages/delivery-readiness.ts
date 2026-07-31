import type { Queue } from "bullmq";
import { logger } from "@/server/observability/logger";
import { campaignQueue, messageQueue } from "@/server/queues/client";
import { QUEUES } from "@/server/queues/contracts";
import { isWorkerHeartbeatFresh, readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";

type MessageScheduleType = "SEND_NOW" | "SCHEDULED" | "RECURRING";

type ReadinessDetails = {
  queueName: string;
  workerCount: number | null;
  consumerEvidence: "bullmq" | "heartbeat" | "none";
  paused: boolean | null;
  counts: Record<string, number>;
};

export class MessageDeliveryReadinessError extends Error {
  constructor(
    public readonly code: "MESSAGE_QUEUE_UNAVAILABLE" | "MESSAGE_QUEUE_NO_CONSUMER" | "MESSAGE_QUEUE_PAUSED",
    public readonly details: ReadinessDetails,
  ) {
    super(code);
    this.name = "MessageDeliveryReadinessError";
  }
}

export function isMessageDeliveryReadinessError(error: unknown): error is MessageDeliveryReadinessError {
  return error instanceof MessageDeliveryReadinessError;
}

const DEFAULT_TIMEOUT_MS = Number(process.env.MESSAGE_DELIVERY_READINESS_TIMEOUT_MS || 3_000);
const DEFAULT_CACHE_MS = Number(process.env.MESSAGE_DELIVERY_READINESS_CACHE_MS || 10_000);
let cache: { expiresAt: number; key: string; result: ReadinessDetails[] } | null = null;

async function withTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("MESSAGE_QUEUE_READINESS_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function inspectQueue(queueName: string, createQueue: () => Queue): Promise<ReadinessDetails> {
  let queue: Queue | null = null;
  try {
    queue = createQueue();
    const [paused, counts, heartbeat] = await withTimeout(Promise.all([
      queue.isPaused(),
      queue.getJobCounts("waiting", "active", "delayed", "failed"),
      readWorkerHeartbeat().catch(() => null),
    ]));
    const bullWorkerCount = await withTimeout(queue.getWorkersCount()).catch(() => null);
    const heartbeatConsumer = Boolean(
      heartbeat &&
      isWorkerHeartbeatFresh(heartbeat) &&
      heartbeat.status !== "STOPPED" &&
      heartbeat.status !== "DRAINING" &&
      heartbeat.queueNames.includes(queueName),
    );
    const workerCount = heartbeatConsumer ? Math.max(1, bullWorkerCount ?? 0) : bullWorkerCount;
    return {
      queueName,
      workerCount,
      consumerEvidence: (bullWorkerCount ?? 0) > 0 ? "bullmq" : heartbeatConsumer ? "heartbeat" : "none",
      paused,
      counts,
    };
  } catch (error) {
    logger.error("message.queue.readiness_probe_failed", error, { queueName });
    return {
      queueName,
      workerCount: null,
      consumerEvidence: "none",
      paused: null,
      counts: {},
    };
  } finally {
    if (queue) {
      try {
        await withTimeout(queue.close(), 1_000);
      } catch {
        await queue.disconnect().catch(() => undefined);
      }
    }
  }
}

export async function inspectMessageDeliveryQueueReadiness(input: {
  scheduleType: MessageScheduleType;
  force?: boolean;
}) {
  const queueNames = input.scheduleType === "RECURRING"
    ? [QUEUES.message, QUEUES.campaign]
    : [QUEUES.message];
  const key = queueNames.join("|");
  const now = Date.now();
  if (!input.force && DEFAULT_CACHE_MS > 0 && cache?.key === key && cache.expiresAt > now) return cache.result;

  const result = await Promise.all(queueNames.map((queueName) =>
    inspectQueue(queueName, queueName === QUEUES.campaign ? campaignQueue : messageQueue)
  ));
  cache = { key, result, expiresAt: now + Math.max(0, DEFAULT_CACHE_MS) };
  return result;
}

export async function assertMessageDeliveryQueueReady(input: {
  scheduleType: MessageScheduleType;
  companyId: string;
  userId: string;
  source: string;
  correlationId: string;
}) {
  const inspections = await inspectMessageDeliveryQueueReadiness({ scheduleType: input.scheduleType });
  for (const details of inspections) {
    if (details.workerCount === null) {
      logger.error("message.queue.readiness_unavailable", new Error("MESSAGE_QUEUE_UNAVAILABLE"), { ...input, ...details });
      throw new MessageDeliveryReadinessError("MESSAGE_QUEUE_UNAVAILABLE", details);
    }
    if (details.paused) {
      logger.error("message.queue.readiness_paused", new Error("MESSAGE_QUEUE_PAUSED"), { ...input, ...details });
      throw new MessageDeliveryReadinessError("MESSAGE_QUEUE_PAUSED", details);
    }
    if (details.workerCount < 1) {
      logger.error("message.queue.readiness_no_consumer", new Error("MESSAGE_QUEUE_NO_CONSUMER"), { ...input, ...details });
      throw new MessageDeliveryReadinessError("MESSAGE_QUEUE_NO_CONSUMER", details);
    }
  }
  logger.info("message.queue.readiness_ok", {
    ...input,
    queues: inspections.map((item) => ({ queueName: item.queueName, workerCount: item.workerCount, counts: item.counts })),
  });
}
