import Redis from "ioredis";
import { redisConnectionOptions } from "@/server/queues/client";
import type { WorkerHeartbeat } from "@/server/monitoring/contracts";

const HEARTBEAT_KEY = "logivya:whatsapp-worker:heartbeat";
export const WORKER_HEARTBEAT_TTL_SECONDS = Number(process.env.WORKER_HEARTBEAT_TTL_SECONDS || 90);
export const WORKER_HEARTBEAT_FRESH_MS = Number(process.env.WORKER_HEARTBEAT_FRESH_MS || 60_000);
let redis: Redis | null = null;
const fallbackStartedAt = new Date().toISOString();

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

export async function writeWorkerHeartbeat(
  workerId: string,
  details: Partial<Omit<WorkerHeartbeat, "workerId" | "lastHeartbeatAt">> = {},
) {
  const instance = client();
  await ensureConnected(instance);
  const lastHeartbeatAt = new Date().toISOString();
  const sourceCommit = process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || null;
  const release = process.env.LOG_RELEASE_VERSION || process.env.APP_VERSION || sourceCommit;
  const payload: WorkerHeartbeat & { timestamp: string; releaseMarker: string | null } = {
    workerId,
    service: details.service ?? process.env.LOG_SERVICE_NAME ?? "logivya-whatsapp-worker",
    environment: details.environment ?? process.env.LOG_ENVIRONMENT ?? process.env.RENDER_SERVICE_NAME ?? process.env.NODE_ENV ?? "development",
    release: details.release ?? release,
    queueNames: details.queueNames ?? [],
    startedAt: details.startedAt ?? fallbackStartedAt,
    lastHeartbeatAt,
    currentJobs: details.currentJobs ?? 0,
    capacity: details.capacity ?? 0,
    status: details.status ?? "HEALTHY",
    sourceCommit: details.sourceCommit ?? sourceCommit,
    timestamp: lastHeartbeatAt,
    releaseMarker: release,
  };
  await instance.set(
    HEARTBEAT_KEY,
    JSON.stringify(payload),
    "EX",
    WORKER_HEARTBEAT_TTL_SECONDS,
  );
}

export async function readWorkerHeartbeat() {
  const instance = client();
  await ensureConnected(instance);
  const value = await instance.get(HEARTBEAT_KEY);
  if (!value) return null;
  const parsed = JSON.parse(value) as Partial<WorkerHeartbeat> & { workerId?: string; timestamp?: string; releaseMarker?: string | null };
  if (!parsed.workerId || !(parsed.lastHeartbeatAt || parsed.timestamp)) return null;
  return {
    workerId: parsed.workerId,
    service: parsed.service ?? "logivya-whatsapp-worker",
    environment: parsed.environment ?? "unknown",
    release: parsed.release ?? parsed.releaseMarker ?? null,
    queueNames: Array.isArray(parsed.queueNames) ? parsed.queueNames : [],
    startedAt: parsed.startedAt ?? parsed.timestamp ?? new Date(0).toISOString(),
    lastHeartbeatAt: parsed.lastHeartbeatAt ?? parsed.timestamp!,
    currentJobs: Number.isFinite(parsed.currentJobs) ? Number(parsed.currentJobs) : 0,
    capacity: Number.isFinite(parsed.capacity) ? Number(parsed.capacity) : 0,
    status: parsed.status ?? "UNKNOWN",
    sourceCommit: parsed.sourceCommit ?? null,
  } satisfies WorkerHeartbeat;
}

export function isWorkerHeartbeatFresh(heartbeat: Pick<WorkerHeartbeat, "workerId" | "lastHeartbeatAt"> | null) {
  return Boolean(heartbeat && Date.now() - new Date(heartbeat.lastHeartbeatAt).getTime() <= WORKER_HEARTBEAT_FRESH_MS);
}

export function disconnectWorkerHeartbeatClient() {
  redis?.disconnect();
  redis = null;
}
