import Redis from "ioredis";

import { redisConnectionOptions } from "@/server/queues/client";

const KEY = "logivya:notifications:worker:heartbeat";
const TTL_SECONDS = 30;

export type NotificationWorkerHeartbeat = {
  workerId: string;
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
    await redis.set(KEY, JSON.stringify(heartbeat), "EX", TTL_SECONDS);
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
    return parsed as NotificationWorkerHeartbeat;
  } catch {
    return null;
  } finally {
    redis.disconnect();
  }
}
