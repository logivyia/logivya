import Redis from "ioredis";

import { redisConnectionOptions } from "@/server/queues/client";

const HEARTBEAT_KEY = "logivya:whatsapp-ingestion-worker:heartbeat";
const HEARTBEAT_TTL_SECONDS = Math.min(300, Math.max(30, Number(process.env.WHATSAPP_INGESTION_HEARTBEAT_TTL_SECONDS || 90)));
const HEARTBEAT_FRESH_MS = Math.min(5 * 60_000, Math.max(30_000, Number(process.env.WHATSAPP_INGESTION_HEARTBEAT_FRESH_MS || 60_000)));
let redis: Redis | null = null;

export type WhatsAppIngestionWorkerHeartbeat = {
  workerId: string;
  startedAt: string;
  lastHeartbeatAt: string;
  lastSuccessfulEventAt: string | null;
  currentJobs: number;
  capacity: number;
  queueNames: string[];
  status: "HEALTHY" | "DRAINING";
};

function client() {
  redis ??= new Redis({ ...redisConnectionOptions(), lazyConnect: true });
  return redis;
}

async function ensureConnected(instance: Redis) {
  if (instance.status === "ready") return;
  if (instance.status === "connecting" || instance.status === "connect") {
    await new Promise<void>((resolve, reject) => {
      instance.once("ready", resolve);
      instance.once("error", reject);
    });
    return;
  }
  await instance.connect();
}

export async function writeWhatsAppIngestionHeartbeat(input: Omit<WhatsAppIngestionWorkerHeartbeat, "lastHeartbeatAt">) {
  const instance = client();
  await ensureConnected(instance);
  const payload: WhatsAppIngestionWorkerHeartbeat = { ...input, lastHeartbeatAt: new Date().toISOString() };
  await instance.set(HEARTBEAT_KEY, JSON.stringify(payload), "EX", HEARTBEAT_TTL_SECONDS);
  return payload;
}

export async function readWhatsAppIngestionHeartbeat() {
  const instance = client();
  await ensureConnected(instance);
  const value = await instance.get(HEARTBEAT_KEY);
  if (!value) return null;
  const parsed = JSON.parse(value) as Partial<WhatsAppIngestionWorkerHeartbeat>;
  if (!parsed.workerId || !parsed.lastHeartbeatAt || !parsed.startedAt) return null;
  return {
    workerId: parsed.workerId,
    startedAt: parsed.startedAt,
    lastHeartbeatAt: parsed.lastHeartbeatAt,
    lastSuccessfulEventAt: parsed.lastSuccessfulEventAt ?? null,
    currentJobs: Number.isFinite(parsed.currentJobs) ? Number(parsed.currentJobs) : 0,
    capacity: Number.isFinite(parsed.capacity) ? Number(parsed.capacity) : 0,
    queueNames: Array.isArray(parsed.queueNames) ? parsed.queueNames.filter((item): item is string => typeof item === "string") : [],
    status: parsed.status === "DRAINING" ? "DRAINING" : "HEALTHY",
  } satisfies WhatsAppIngestionWorkerHeartbeat;
}

export function isWhatsAppIngestionHeartbeatFresh(heartbeat: Pick<WhatsAppIngestionWorkerHeartbeat, "lastHeartbeatAt"> | null) {
  return Boolean(heartbeat && Date.now() - new Date(heartbeat.lastHeartbeatAt).getTime() <= HEARTBEAT_FRESH_MS);
}

export function disconnectWhatsAppIngestionHeartbeat() {
  redis?.disconnect();
  redis = null;
}
