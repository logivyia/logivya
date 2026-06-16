import IORedis from "ioredis";
import { campaignQueue, messageQueue, redisConnectionOptions, whatsappQueue } from "@/server/queues/client";
import { readWorkerHeartbeat } from "@/server/whatsapp/worker-heartbeat";

const requiredEnv = [
  "DATABASE_URL",
  "REDIS_URL",
  "WHATSAPP_SESSION_SECRET",
  "NEXT_PUBLIC_APP_URL",
];

const recommendedEnv = [
  "WHATSAPP_SESSION_DIR",
  "WHATSAPP_SESSION_ROOT",
  "WHATSAPP_WORKER_URL",
  "WORKER_HEALTH_URL",
  "WHATSAPP_PROVIDER",
];

function envStatus(name: string) {
  return { name, present: Boolean(process.env[name]) };
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function checkRedis() {
  let redis: IORedis | null = null;
  try {
    redis = new IORedis(redisConnectionOptions());
    const started = Date.now();
    const pong = await redis.ping();
    return { status: pong === "PONG" ? "healthy" : "unhealthy", latencyMs: Date.now() - started };
  } catch (error) {
    return { status: "unhealthy", error: safeError(error) };
  } finally {
    await redis?.quit().catch(() => undefined);
  }
}

async function checkQueue(name: string, createQueue: () => ReturnType<typeof messageQueue>) {
  let queue: ReturnType<typeof messageQueue> | null = null;
  try {
    queue = createQueue();
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "completed", "failed");
    return { name, status: "healthy", counts };
  } catch (error) {
    return { name, status: "unhealthy", error: safeError(error) };
  } finally {
    await queue?.close().catch(() => undefined);
  }
}

async function main() {
  const heartbeat = await readWorkerHeartbeat().catch((error) => ({ error: safeError(error) }));
  const queues = await Promise.all([
    checkQueue("logivya-sync", whatsappQueue),
    checkQueue("logivya-message", messageQueue),
    checkQueue("logivya-campaign", campaignQueue),
  ]);

  const report = {
    env: {
      required: requiredEnv.map(envStatus),
      recommended: recommendedEnv.map(envStatus),
    },
    redis: await checkRedis(),
    queues,
    workerHeartbeat: heartbeat,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({ status: "failed", error: safeError(error) }, null, 2));
  process.exitCode = 1;
});
