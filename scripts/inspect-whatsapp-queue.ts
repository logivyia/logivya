import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { Queue } from "bullmq";
import type { RedisOptions } from "ioredis";

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    env[key] = parts.join("=").replace(/^["']|["']$/g, "");
  }
  return env;
}

const fileEnv = {
  ...readEnvFile(path.join(process.cwd(), ".env")),
  ...readEnvFile(path.join(process.cwd(), ".env.local")),
};

const redisUrl = fileEnv.REDIS_URL || process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is missing.");
const resolvedRedisUrl = redisUrl;
const queueName = process.argv[2] || "logivya-sync";
const accountId = process.argv[3];

function redisOptions(): RedisOptions {
  const url = new URL(resolvedRedisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

async function main() {
  const queue = new Queue(queueName, { connection: redisOptions() });
  try {
    const counts = await queue.getJobCounts("waiting", "active", "delayed", "completed", "failed", "paused");
    const jobs = await queue.getJobs(["waiting", "active", "delayed", "completed", "failed"], 0, 30, false);
    const compact = await Promise.all(
      jobs
        .filter((job) => !accountId || job.data?.accountId === accountId)
        .map(async (job) => ({
          id: job.id,
          name: job.name,
          state: await job.getState(),
          data: job.data,
          attemptsMade: job.attemptsMade,
          failedReason: job.failedReason,
          returnvalue: job.returnvalue,
          timestamp: job.timestamp ? new Date(job.timestamp).toISOString() : null,
          processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
          finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
        })),
    );
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), queueName, accountId, counts, jobs: compact }, null, 2));
  } finally {
    await queue.close().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
