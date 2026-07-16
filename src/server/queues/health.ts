import type { JobType } from "bullmq";
import { campaignQueue, messageQueue, whatsappQueue } from "@/server/queues/client";
import { evaluateQueueBacklog, type HealthState, type QueueOperationalMetrics } from "@/server/monitoring/contracts";

const DEFAULT_QUEUE_HEALTH_CACHE_MS = Number(process.env.QUEUE_HEALTH_CACHE_MS || 120_000);
const STALE_QUEUE_HEALTH_CACHE_MS = Number(process.env.QUEUE_HEALTH_STALE_CACHE_MS || 600_000);
const QUEUE_HEALTH_TIMEOUT_MS = Number(process.env.QUEUE_HEALTH_TIMEOUT_MS || 5_000);

type QueueFactory = () => ReturnType<typeof messageQueue>;

export type QueueHealthSnapshot = {
  name: string;
  status: "healthy" | "unhealthy";
  state: HealthState;
  counts: Record<string, number>;
  cachedAt: string;
  stale: boolean;
  safeErrorCode: string | null;
  oldestWaitingAgeMs: number | null;
  completedLast15m: number;
  failedLast15m: number;
  retrying: number;
  throughputPerMinute: number;
  averageProcessingMs: number | null;
  p95ProcessingMs: number | null;
  p99ProcessingMs: number | null;
  completionRate: number | null;
  workerCount: number | null;
};

const cache = new Map<string, { expiresAt: number; staleUntil: number; value: QueueHealthSnapshot }>();

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("QUEUE_HEALTH_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function safeErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/max requests limit exceeded/i.test(message)) return "REDIS_COMMAND_QUOTA_EXCEEDED";
  if (/timeout|timed out/i.test(message)) return "QUEUE_HEALTH_TIMEOUT";
  if (/connect|ECONN|socket|redis/i.test(message)) return "QUEUE_BACKEND_UNAVAILABLE";
  return "QUEUE_HEALTH_CHECK_FAILED";
}

function isRedisQuotaError(error: unknown) {
  return safeErrorCode(error) === "REDIS_COMMAND_QUOTA_EXCEEDED";
}

function percentile(values: number[], percent: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil((percent / 100) * sorted.length) - 1)] ?? null;
}

function asOperationalMetrics(snapshot: QueueHealthSnapshot): QueueOperationalMetrics {
  return {
    name: snapshot.name,
    state: snapshot.state,
    counts: snapshot.counts,
    oldestWaitingAgeMs: snapshot.oldestWaitingAgeMs,
    completedLast15m: snapshot.completedLast15m,
    failedLast15m: snapshot.failedLast15m,
    retrying: snapshot.retrying,
    throughputPerMinute: snapshot.throughputPerMinute,
    averageProcessingMs: snapshot.averageProcessingMs,
    p95ProcessingMs: snapshot.p95ProcessingMs,
    p99ProcessingMs: snapshot.p99ProcessingMs,
    completionRate: snapshot.completionRate,
    workerCount: snapshot.workerCount,
    checkedAt: snapshot.cachedAt,
    stale: snapshot.stale,
    safeErrorCode: snapshot.safeErrorCode,
  };
}

export async function getCachedQueueHealth(
  name: string,
  createQueue: QueueFactory,
  statuses: JobType[] = ["waiting", "active", "delayed", "failed"],
  cacheMs = DEFAULT_QUEUE_HEALTH_CACHE_MS,
): Promise<QueueHealthSnapshot> {
  const key = `${name}:${statuses.join(",")}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value;

  let queue: ReturnType<QueueFactory> | null = null;
  let value: QueueHealthSnapshot;
  try {
    queue = createQueue();
    const windowStart = now - 15 * 60_000;
    const [counts, oldestWaiting, recentCompleted, recentFailed, retryCandidates, workerCount] = await withTimeout(Promise.all([
      queue.getJobCounts(...statuses),
      queue.getJobs(["waiting"], 0, 0, true),
      queue.getJobs(["completed"], 0, 99, false),
      queue.getJobs(["failed"], 0, 99, false),
      queue.getJobs(["waiting", "delayed"], 0, 99, false),
      queue.getWorkersCount(),
    ]), QUEUE_HEALTH_TIMEOUT_MS);
    const completedInWindow = recentCompleted.filter((job) => (job.finishedOn ?? 0) >= windowStart);
    const failedInWindow = recentFailed.filter((job) => (job.finishedOn ?? job.timestamp) >= windowStart);
    const durations = completedInWindow
      .map((job) => job.finishedOn && job.processedOn ? job.finishedOn - job.processedOn : null)
      .filter((duration): duration is number => typeof duration === "number" && duration >= 0);
    const completedLast15m = completedInWindow.length;
    const failedLast15m = failedInWindow.length;
    const oldestWaitingAgeMs = oldestWaiting[0]?.timestamp ? Math.max(0, now - oldestWaiting[0].timestamp) : null;
    const throughputPerMinute = Number((completedLast15m / 15).toFixed(2));
    const retrying = retryCandidates.filter((job) => job.attemptsMade > 0).length;
    const state = evaluateQueueBacklog({
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      workerCount,
      oldestWaitingAgeMs,
      throughputPerMinute,
      stale: false,
    });
    value = {
      name,
      status: state === "HEALTHY" ? "healthy" : "unhealthy",
      state,
      counts,
      cachedAt: new Date(now).toISOString(),
      stale: false,
      safeErrorCode: null,
      oldestWaitingAgeMs,
      completedLast15m,
      failedLast15m,
      retrying,
      throughputPerMinute,
      averageProcessingMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
      p95ProcessingMs: percentile(durations, 95),
      p99ProcessingMs: percentile(durations, 99),
      completionRate: completedLast15m + failedLast15m > 0
        ? Number(((completedLast15m / (completedLast15m + failedLast15m)) * 100).toFixed(2))
        : null,
      workerCount,
    };
  } catch (error) {
    if (hit && hit.staleUntil > now && isRedisQuotaError(error)) {
      value = {
        ...hit.value,
        status: "unhealthy",
        state: "UNKNOWN",
        stale: true,
        safeErrorCode: safeErrorCode(error),
      };
    } else {
      value = {
        name,
        status: "unhealthy",
        state: "UNAVAILABLE",
        counts: {},
        cachedAt: new Date(now).toISOString(),
        stale: false,
        safeErrorCode: safeErrorCode(error),
        oldestWaitingAgeMs: null,
        completedLast15m: 0,
        failedLast15m: 0,
        retrying: 0,
        throughputPerMinute: 0,
        averageProcessingMs: null,
        p95ProcessingMs: null,
        p99ProcessingMs: null,
        completionRate: null,
        workerCount: null,
      };
    }
  } finally {
    if (queue) {
      await withTimeout(queue.close(), 1_000).catch(() => queue?.disconnect());
      queue.disconnect();
    }
  }

  cache.set(key, { expiresAt: now + cacheMs, staleUntil: now + STALE_QUEUE_HEALTH_CACHE_MS, value });
  return value;
}

export async function getWhatsAppQueueHealth(cacheMs = DEFAULT_QUEUE_HEALTH_CACHE_MS) {
  return Promise.all([
    getCachedQueueHealth("logivya-sync", whatsappQueue, undefined, cacheMs),
    getCachedQueueHealth("logivya-message", messageQueue, undefined, cacheMs),
  ]);
}

export async function getCoreQueueHealth(cacheMs = DEFAULT_QUEUE_HEALTH_CACHE_MS) {
  const whatsappQueues = await getWhatsAppQueueHealth(cacheMs);
  return Promise.all([
    ...whatsappQueues,
    getCachedQueueHealth("logivya-campaign", campaignQueue, undefined, cacheMs),
  ]);
}

export async function getCoreQueueOperationalMetrics(cacheMs = DEFAULT_QUEUE_HEALTH_CACHE_MS) {
  return (await getCoreQueueHealth(cacheMs)).map(asOperationalMetrics);
}
