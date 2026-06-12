import { Queue } from "bullmq";
import { DEFAULT_JOB_OPTIONS, QUEUES } from "@/server/queues/contracts";

function redis() {
  const value = process.env.REDIS_URL;
  if (!value) throw new Error("REDIS_URL is required");
  const url = new URL(value);
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined, password: url.password || undefined, tls: url.protocol === "rediss:" ? { servername: url.hostname } : undefined, maxRetriesPerRequest: null };
}

export function whatsappQueue() { return new Queue(QUEUES.sync, { connection: redis(), defaultJobOptions: DEFAULT_JOB_OPTIONS }); }
export function messageQueue() { return new Queue(QUEUES.message, { connection: redis(), defaultJobOptions: DEFAULT_JOB_OPTIONS }); }
export function campaignQueue() { return new Queue(QUEUES.campaign, { connection: redis(), defaultJobOptions: DEFAULT_JOB_OPTIONS }); }
export function deadLetterQueue() { return new Queue(QUEUES.deadLetter, { connection: redis(), defaultJobOptions: { removeOnComplete: 1_000, removeOnFail: 10_000 } }); }
