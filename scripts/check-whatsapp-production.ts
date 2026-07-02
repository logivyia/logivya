import { Queue } from "bullmq";
import IORedis, { type RedisOptions } from "ioredis";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { redisConnectionOptions } from "@/server/queues/client";
import { QUEUES } from "@/server/queues/contracts";

const WORKER_HEARTBEAT_KEY = "logivya:whatsapp-worker:heartbeat";
const HEALTH_CHECK_TIMEOUT_MS = 10_000;

function loadEnvFile(filePath: string) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
}

loadEnvFile(path.join(process.cwd(), ".env.local"));
loadEnvFile(path.join(process.cwd(), ".env"));

const requiredEnv = [
  "DATABASE_URL",
  "REDIS_URL",
  "NEXT_PUBLIC_APP_URL",
];

const recommendedEnv = [
  "JWT_SECRET",
  "AUTH_SECRET",
  "SESSION_ENCRYPTION_KEY",
  "FIELD_ENCRYPTION_ACTIVE_VERSION",
  "FIELD_ENCRYPTION_KEY_V1",
  "WHATSAPP_SESSION_SECRET",
  "WHATSAPP_SESSION_DIR",
  "WHATSAPP_SESSION_ROOT",
  "WHATSAPP_WORKER_URL",
  "WORKER_HEALTH_URL",
  "WHATSAPP_PROVIDER",
];

function envStatus(name: string) {
  return { name, present: Boolean(process.env[name]) };
}

function sessionEncryptionStatus() {
  const activeVersion = process.env.FIELD_ENCRYPTION_ACTIVE_VERSION || "v1";
  const activeKeyName = `FIELD_ENCRYPTION_KEY_${activeVersion.toUpperCase()}`;
  const accepted = [
    activeKeyName,
    "WHATSAPP_SESSION_SECRET",
    "SESSION_ENCRYPTION_KEY",
    "AUTH_SECRET",
  ];

  return {
    name: "WHATSAPP_SESSION_ENCRYPTION",
    present: accepted.some((name) => Boolean(process.env[name])),
    accepted,
    activeKeyName,
  };
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = HEALTH_CHECK_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

function healthRedisOptions(): RedisOptions {
  return {
    ...redisConnectionOptions(),
    connectTimeout: 5_000,
    commandTimeout: 5_000,
    lazyConnect: true,
    retryStrategy: () => null,
    reconnectOnError: () => false,
  };
}

async function createHealthRedis() {
  const redis = new IORedis(healthRedisOptions());
  redis.on("error", () => undefined);
  await withTimeout(redis.connect(), "redis connect", 6_000);
  return redis;
}

async function checkRedis() {
  let redis: IORedis | null = null;
  try {
    redis = await createHealthRedis();
    const started = Date.now();
    const pong = await withTimeout(redis.ping(), "redis ping", 6_000);
    return { status: pong === "PONG" ? "healthy" : "unhealthy", latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "unhealthy", error: safeError(error) };
  } finally {
    redis?.disconnect();
  }
}

async function checkQueue(name: string, queueName: string) {
  let queue: Queue | null = null;
  try {
    queue = new Queue(queueName, { connection: healthRedisOptions() });
    queue.on("error", () => undefined);
    const counts = await withTimeout(queue.getJobCounts("waiting", "active", "delayed", "completed", "failed"), `${name} counts`);
    return { name, status: "healthy", counts };
  } catch (error) {
    return { name, status: "unhealthy", error: safeError(error) };
  } finally {
    await queue?.close().catch(() => undefined);
    await queue?.disconnect().catch(() => undefined);
  }
}

async function checkWorkerHeartbeat() {
  let redis: IORedis | null = null;
  try {
    redis = await createHealthRedis();
    const value = await withTimeout(redis.get(WORKER_HEARTBEAT_KEY), "worker heartbeat get", 6_000);
    if (!value) return { status: "missing", fresh: false };
    const heartbeat = JSON.parse(value) as { workerId?: string; timestamp?: string; releaseMarker?: string; sourceCommit?: string | null };
    const timestamp = heartbeat.timestamp ? new Date(heartbeat.timestamp).getTime() : 0;
    const fresh = Number.isFinite(timestamp) && Date.now() - timestamp <= 60_000;
    return {
      status: fresh ? "healthy" : "stale",
      fresh,
      workerId: heartbeat.workerId ?? null,
      timestamp: heartbeat.timestamp ?? null,
      releaseMarker: heartbeat.releaseMarker ?? null,
      sourceCommit: heartbeat.sourceCommit ?? null,
    };
  } catch (error) {
    return { status: "unhealthy", fresh: false, error: safeError(error) };
  } finally {
    redis?.disconnect();
  }
}

async function main() {
  const queues = await Promise.all([
    checkQueue("logivya-sync", QUEUES.sync),
    checkQueue("logivya-message", QUEUES.message),
    checkQueue("logivya-campaign", QUEUES.campaign),
  ]);

  const required = requiredEnv.map(envStatus);
  const requiredGroups = [sessionEncryptionStatus()];
  const redis = await checkRedis();
  const workerHeartbeat = await checkWorkerHeartbeat();
  const report = {
    env: {
      required,
      requiredGroups,
      recommended: recommendedEnv.map(envStatus),
    },
    redis,
    queues,
    workerHeartbeat,
  };

  console.log(JSON.stringify(report, null, 2));

  if (
    required.some((item) => !item.present) ||
    requiredGroups.some((item) => !item.present) ||
    redis.status !== "healthy" ||
    queues.some((queue) => queue.status !== "healthy") ||
    workerHeartbeat.status !== "healthy"
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: safeError(error) }, null, 2));
  process.exitCode = 1;
});
