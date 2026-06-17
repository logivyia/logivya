import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";

const HEARTBEAT_KEY = "logivya:whatsapp-worker:heartbeat";
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
  await instance.set(HEARTBEAT_KEY, JSON.stringify({ workerId, timestamp: new Date().toISOString() }), "EX", WORKER_HEARTBEAT_TTL_SECONDS);
}

export async function readWorkerHeartbeat() {
  const instance = client();
  await ensureConnected(instance);
  const value = await instance.get(HEARTBEAT_KEY);
  return value ? JSON.parse(value) as { workerId: string; timestamp: string } : null;
}

export function isWorkerHeartbeatFresh(heartbeat: { workerId: string; timestamp: string } | null) {
  return Boolean(heartbeat && Date.now() - new Date(heartbeat.timestamp).getTime() <= WORKER_HEARTBEAT_FRESH_MS);
}
