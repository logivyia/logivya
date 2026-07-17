import Redis from "ioredis";

import { redisConnectionOptions } from "@/server/queues/client";

const KEY = "logivya:notifications:worker:heartbeat";
const TTL_SECONDS = 30;
const CRON_TTL_SECONDS = 30 * 60 * 60;

export type NotificationProcessorMode = "worker" | "cron";

export function notificationProcessorMode(value = process.env.NOTIFICATION_PROCESSING_MODE): NotificationProcessorMode {
  return value?.trim().toLowerCase() === "cron" ? "cron" : "worker";
}

export function notificationHeartbeatMaxAgeMs(
  mode = notificationProcessorMode(),
  configured = process.env.NOTIFICATION_CRON_HEARTBEAT_MAX_AGE_MS,
) {
  if (mode === "worker") return 30_000;
  const parsed = Number(configured || 26 * 60 * 60_000);
  if (!Number.isFinite(parsed)) return 26 * 60 * 60_000;
  return Math.min(48 * 60 * 60_000, Math.max(5 * 60_000, parsed));
}

export type NotificationWorkerHeartbeat = {
  workerId: string;
  mode: NotificationProcessorMode;
  status: "HEALTHY" | "DEGRADED";
  lastHeartbeatAt: string;
  release: string | null;
  cycleMs: number;
  processed: number;
  lastErrorCode?: string;
};

export async function writeNotificationWorkerHeartbeat(heartbeat: NotificationWorkerHeartbeat) {
  const redis = new Redis({ ...redisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const ttlSeconds = heartbeat.mode === "cron" ? CRON_TTL_SECONDS : TTL_SECONDS;
    await redis.set(KEY, JSON.stringify(heartbeat), "EX", ttlSeconds);
  } finally {
    redis.disconnect();
  }
}

export async function readNotificationWorkerHeartbeat(): Promise<NotificationWorkerHeartbeat | null> {
  const redis = new Redis({ ...redisConnectionOptions(), lazyConnect: true, maxRetriesPerRequest: 1 });
  try {
    await redis.connect();
    const raw = await redis.get(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<NotificationWorkerHeartbeat>;
    if (!parsed.workerId || !parsed.lastHeartbeatAt || (parsed.status !== "HEALTHY" && parsed.status !== "DEGRADED")) return null;
    const mode = parsed.mode === "cron" ? "cron" : "worker";
    return { ...parsed, mode } as NotificationWorkerHeartbeat;
  } catch {
    return null;
  } finally {
    redis.disconnect();
  }
}
