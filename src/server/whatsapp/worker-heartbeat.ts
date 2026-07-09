import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";

const HEARTBEAT_KEY = "logivya:whatsapp-worker:heartbeat";
const WORKER_RELEASE_MARKER = "WHATSAPP_PAIRING_LIVE_WA_WEB_VERSION_V119";
export const WORKER_HEARTBEAT_TTL_SECONDS = Number(process.env.WORKER_HEARTBEAT_TTL_SECONDS || 90);
export const WORKER_HEARTBEAT_FRESH_MS = Number(process.env.WORKER_HEARTBEAT_FRESH_MS || 60_000);
let redis: Redis | null = null;

function client() {
  redis ??= new Redis({ ...redisConnectionOptions(), lazyConnect: true });
  return redis;
}

async function ensureConnected(instance: Redis) {
  if (instance.status === "ready") return;
  if (instance.status === "connecting" || instance.status === "connect") {
    await new Promise((resolve) => instance.once("ready", resolve));
    return;
  }
  await instance.connect();
}

export async function writeWorkerHeartbeat(workerId: string) {
  const instance = client();
  await ensureConnected(instance);
  await instance.set(
    HEARTBEAT_KEY,
    JSON.stringify({
      workerId,
      timestamp: new Date().toISOString(),
      releaseMarker: WORKER_RELEASE_MARKER,
      sourceCommit: process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null,
    }),
    "EX",
    WORKER_HEARTBEAT_TTL_SECONDS,
  );
}

export async function readWorkerHeartbeat() {
  const instance = client();
  await ensureConnected(instance);
  const value = await instance.get(HEARTBEAT_KEY);
  return value ? JSON.parse(value) as { workerId: string; timestamp: string; releaseMarker?: string; sourceCommit?: string | null } : null;
}

export function isWorkerHeartbeatFresh(heartbeat: { workerId: string; timestamp: string } | null) {
  return Boolean(heartbeat && Date.now() - new Date(heartbeat.timestamp).getTime() <= WORKER_HEARTBEAT_FRESH_MS);
}
