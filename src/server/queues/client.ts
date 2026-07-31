import { Queue } from "bullmq";
import { DEFAULT_JOB_OPTIONS, QUEUES } from "@/server/queues/contracts";

export function redisConnectionUrl() {
  const value = process.env.REDIS_URL || process.env.KV_URL;
  if (!value) throw new Error("REDIS_URL is required");
  return value;
}

export function redisConnectionOptions() {
  const value = redisConnectionUrl();
  const url = new URL(value);
  const db = url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined;
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isInteger(db) ? db : undefined,
    tls: url.protocol === "rediss:" ? { servername: url.hostname } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
  };
}

export function whatsappQueue() { return new Queue(QUEUES.sync, { connection: redisConnectionOptions(), defaultJobOptions: DEFAULT_JOB_OPTIONS }); }
export function messageQueue() { return new Queue(QUEUES.message, { connection: redisConnectionOptions(), defaultJobOptions: DEFAULT_JOB_OPTIONS }); }
export function campaignQueue() { return new Queue(QUEUES.campaign, { connection: redisConnectionOptions(), defaultJobOptions: DEFAULT_JOB_OPTIONS }); }
export function deadLetterQueue() {
  return new Queue(QUEUES.deadLetter, {
    connection: redisConnectionOptions(),
    defaultJobOptions: {
      removeOnComplete: { age: 86_400, count: 200 },
      removeOnFail: { age: 7 * 86_400, count: 500 },
    },
  });
}
