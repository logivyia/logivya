import type { JobType } from "bullmq";
import { campaignQueue, messageQueue, whatsappQueue } from "@/server/queues/client";

const DEFAULT_QUEUE_HEALTH_CACHE_MS = Number(process.env.QUEUE_HEALTH_CACHE_MS || 15_000);

type QueueFactory = () => ReturnType<typeof messageQueue>;

export type QueueHealthSnapshot =
  | { name: string; status: "healthy"; counts: Record<string, number>; cachedAt: string }
  | { name: string; status: "unhealthy"; error: string; cachedAt: string };

const cache = new Map<string, { expiresAt: number; value: QueueHealthSnapshot }>();

function safeError(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN_QUEUE_ERROR";
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
    value = { name, status: "unhealthy", error: safeError(error), cachedAt: new Date(now).toISOString() };
  } finally {
    await queue.close().catch(() => undefined);
  }

  cache.set(key, { expiresAt: now + cacheMs, value });
  return value;
}

export async function getCoreQueueHealth(cacheMs = DEFAULT_QUEUE_HEALTH_CACHE_MS) {
  return Promise.all([
    getCachedQueueHealth("logivya-sync", whatsappQueue, undefined, cacheMs),
    getCachedQueueHealth("logivya-message", messageQueue, undefined, cacheMs),
    getCachedQueueHealth("logivya-campaign", campaignQueue, undefined, cacheMs),
  ]);
}
