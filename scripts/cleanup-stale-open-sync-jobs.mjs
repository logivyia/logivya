import { Queue } from "bullmq";

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error("REDIS_URL is required");

const execute = process.argv.includes("--execute");
const url = new URL(redisUrl);
const queue = new Queue("logivya-sync", {
  connection: {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : undefined,
    tls: url.protocol === "rediss:" ? { servername: url.hostname } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    connectTimeout: 10_000,
  },
});

const removableStates = ["waiting", "delayed", "failed"];
const stalePrefixes = ["sync-groups-open-", "sync-contacts-open-"];

try {
  const before = await queue.getJobCounts(...removableStates, "active");
  const jobs = await queue.getJobs(removableStates, 0, 10_000, true);
  const staleJobs = jobs.filter((job) =>
    stalePrefixes.some((prefix) => String(job.id ?? "").startsWith(prefix)),
  );

  let removed = 0;
  if (execute) {
    for (let offset = 0; offset < staleJobs.length; offset += 25) {
      const batch = staleJobs.slice(offset, offset + 25);
      const results = await Promise.allSettled(batch.map((job) => job.remove()));
      removed += results.filter((result) => result.status === "fulfilled").length;
    }
  }

  const after = await queue.getJobCounts(...removableStates, "active");
  console.log(JSON.stringify({
    mode: execute ? "execute" : "dry-run",
    matched: staleJobs.length,
    removed,
    before,
    after,
  }));
} finally {
  await queue.close().catch(() => undefined);
}
