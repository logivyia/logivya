import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";

const HEARTBEAT_KEY = "logivya:whatsapp-worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = 20;
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
  await instance.set(HEARTBEAT_KEY, JSON.stringify({ workerId, timestamp: new Date().toISOString() }), "EX", HEARTBEAT_TTL_SECONDS);
}

export async function readWorkerHeartbeat() {
  const instance = client();
  await ensureConnected(instance);
  const value = await instance.get(HEARTBEAT_KEY);
  return value ? JSON.parse(value) as { workerId: string; timestamp: string } : null;
}
