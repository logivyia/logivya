import type { JobType } from "bullmq";
import { campaignQueue, messageQueue, whatsappQueue } from "@/server/queues/client";

const DEFAULT_QUEUE_HEALTH_CACHE_MS = Number(process.env.QUEUE_HEALTH_CACHE_MS || 120_000);
const STALE_QUEUE_HEALTH_CACHE_MS = Number(process.env.QUEUE_HEALTH_STALE_CACHE_MS || 600_000);

type QueueFactory = () => ReturnType<typeof messageQueue>;

export type QueueHealthSnapshot =
  | { name: string; status: "healthy"; counts: Record<string, number>; cachedAt: string; stale?: boolean; warning?: string }
  | { name: string; status: "unhealthy"; error: string; cachedAt: string; stale?: boolean; warning?: string };

const cache = new Map<string, { expiresAt: number; staleUntil: number; value: QueueHealthSnapshot }>();

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_QUEUE_ERROR";
}

function isRedisQuotaError(error: unknown) {
  return safeError(error).includes("max requests limit exceeded");
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

  const queue = createQueue();
  let value: QueueHealthSnapshot;
  try {
    const counts = await queue.getJobCounts(...statuses);
    value = { name, status: "healthy", counts, cachedAt: new Date(now).toISOString() };
  } catch (error) {
    if (hit && hit.staleUntil > now && isRedisQuotaError(error)) {
      value = {
        ...hit.value,
        stale: true,
        warning: "Redis command quota exceeded while refreshing queue health; returning last known snapshot.",
      };
    } else {
      value = { name, status: "unhealthy", error: safeError(error), cachedAt: new Date(now).toISOString() };
    }
  } finally {
    await queue.close().catch(() => undefined);
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
